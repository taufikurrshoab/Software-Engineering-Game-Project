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


class Assessment(models.Model):
    """One adaptive AI assessment attempt for a user's skill."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"

    DIFFICULTY_CHOICES = [
        ("beginner", "Beginner"),
        ("intermediate", "Intermediate"),
        ("advanced", "Advanced"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="skill_assessments",
    )
    skill = models.ForeignKey(
        Skill,
        on_delete=models.CASCADE,
        related_name="assessments",
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    total_questions = models.PositiveSmallIntegerField(default=5)
    answered_questions = models.PositiveSmallIntegerField(default=0)
    next_difficulty = models.CharField(
        max_length=20, choices=DIFFICULTY_CHOICES, default="beginner"
    )
    score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [models.Index(fields=["user", "skill", "status"], name="sk_assess_usr_skill_status")]

    def __str__(self):
        return f"{self.user} - {self.skill.name} ({self.status})"


class AssessmentQuestion(models.Model):
    DIFFICULTY_CHOICES = Assessment.DIFFICULTY_CHOICES

    assessment = models.ForeignKey(
        Assessment, on_delete=models.CASCADE, related_name="questions"
    )
    question_number = models.PositiveSmallIntegerField()
    topic = models.CharField(max_length=100, blank=True)
    question_text = models.TextField()
    options = models.JSONField()
    correct_index = models.PositiveSmallIntegerField()
    explanation = models.TextField()
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES)
    selected_index = models.PositiveSmallIntegerField(null=True, blank=True)
    is_correct = models.BooleanField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["question_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["assessment", "question_number"],
                name="unique_skill_assessment_question",
            )
        ]

    @property
    def selected_answer(self):
        if self.selected_index is None:
            return "Not answered"
        if isinstance(self.options, list) and self.selected_index < len(self.options):
            return self.options[self.selected_index]
        return "Unavailable"

    @property
    def correct_answer(self):
        if isinstance(self.options, list) and self.correct_index < len(self.options):
            return self.options[self.correct_index]
        return "Unavailable"

    def __str__(self):
        return f"{self.assessment} - Q{self.question_number}"

class LearningRecommendation(models.Model):
    """Cached AI-generated next-step suggestions for one user's skill."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="learning_recommendations",
    )
    skill = models.ForeignKey(
        Skill,
        on_delete=models.CASCADE,
        related_name="learning_recommendations",
    )
    suggestions = models.JSONField(default=list, blank=True)
    based_on_progress = models.PositiveSmallIntegerField(default=0)
    generated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "skill"],
                name="unique_learning_recommendation_per_skill",
            ),
        ]
        ordering = ["skill_id"]

    def __str__(self):
        return f"Next steps for {self.skill.name}"

