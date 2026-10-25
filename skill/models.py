import uuid
from pathlib import PurePath

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class Skill(models.Model):
    class Category(models.TextChoices):
        PROGRAMMING = "programming", "Programming"
        WEB = "web", "Web development"
        DATA = "data", "Data and AI"
        CS = "cs", "CS fundamentals"
        TOOLS = "tools", "Tools"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="skills",
    )
    name = models.CharField(max_length=80)
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.OTHER
    )
    progress = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="children",
    )
    # Set automatically in save() from progress
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NOT_STARTED,
        editable=False,
    )
    completed_at = models.DateTimeField(null=True, blank=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"], name="unique_skill_name_per_user"
            ),
        ]
        indexes = [models.Index(fields=["user", "parent"])]

    def __str__(self):
        return f"{self.name} ({self.progress}%)"

    @property
    def is_completed(self):
        return self.status == self.Status.COMPLETED

    def descendant_ids(self):
        """IDs of all children, grandchildren and so on."""
        found, frontier = set(), [self.pk]
        while frontier:
            children = Skill.objects.filter(parent_id__in=frontier)
            frontier = [
                pk for pk in children.values_list("pk", flat=True) if pk not in found
            ]
            found.update(frontier)
        return found

    def clean(self):
        if not self.parent_id:
            return
        if self.parent.user_id != self.user_id:
            raise ValidationError({"parent": "Choose one of your own skills."})
        # Walk up the chain so a skill can never sit under itself
        node, seen = self.parent, set()
        while node is not None and node.pk not in seen:
            if self.pk and node.pk == self.pk:
                raise ValidationError(
                    {"parent": "A skill cannot be placed under itself or its own sub-skills."}
                )
            seen.add(node.pk)
            node = node.parent

    def save(self, *args, **kwargs):
        if self.progress >= 100:
            self.status = self.Status.COMPLETED
            if self.completed_at is None:
                self.completed_at = timezone.now()
        else:
            self.status = (
                self.Status.IN_PROGRESS if self.progress > 0 else self.Status.NOT_STARTED
            )
            self.completed_at = None
        super().save(*args, **kwargs)


class Technology(models.Model):
    """A shared name like HTML or Django, reused across projects."""

    name = models.CharField(max_length=50, unique=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "technologies"

    def __str__(self):
        return self.name


def project_screenshot_path(instance, filename):
    ext = PurePath(filename).suffix.lower()
    return f"skill/projects/user_{instance.user_id}/{uuid.uuid4().hex}{ext}"


class Project(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="projects",
    )
    name = models.CharField(max_length=120)
    description = models.TextField()
    screenshot = models.ImageField(upload_to=project_screenshot_path, blank=True)
    technologies = models.ManyToManyField(Technology, blank=True, related_name="projects")
    related_skills = models.ManyToManyField(Skill, blank=True, related_name="projects")
    completed_date = models.DateField(null=True, blank=True)
    project_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-completed_date", "-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self):
        return self.name

    def delete(self, *args, **kwargs):
        # Remove the uploaded image together with the project
        if self.screenshot:
            self.screenshot.delete(save=False)
        super().delete(*args, **kwargs)