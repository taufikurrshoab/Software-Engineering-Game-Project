import re
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F, Q

HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
DEFAULT_COURSE_COLOR = "#4F46E5"


class Semester(models.Model):
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="semesters",
    )
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__gt=F("start_date")),
                name="academic_semester_end_after_start",
                violation_error_message="End date must be after start date.",
            ),
            # At most one active semester per student
            models.UniqueConstraint(
                fields=["student"],
                condition=Q(is_active=True),
                name="academic_one_active_semester_per_student",
                violation_error_message="This student already has an active semester.",
            ),
        ]

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.student_id:
                others = Semester.objects.filter(student_id=self.student_id, is_active=True)
                if self._state.adding and not self.is_active and not others.exists():
                    # A student's first semester becomes the active one
                    self.is_active = True
                if self.is_active:
                    others.exclude(pk=self.pk).update(is_active=False)
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.student})"


class Course(models.Model):
    semester = models.ForeignKey(
        Semester,
        on_delete=models.CASCADE,
        related_name="courses",
    )
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=20, blank=True)
    credit = models.DecimalField(max_digits=3, decimal_places=1, default=Decimal("3.0"))
    teacher = models.CharField(max_length=100, blank=True)
    color = models.CharField(max_length=7, default=DEFAULT_COURSE_COLOR)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["semester", "name"],
                name="academic_course_unique_name_per_semester",
                violation_error_message="This course already exists in the semester.",
            ),
            models.UniqueConstraint(
                fields=["semester", "code"],
                condition=~Q(code=""),
                name="academic_course_unique_code_per_semester",
                violation_error_message="This course code is already used in the semester.",
            ),
            models.CheckConstraint(
                condition=Q(credit__gt=0),
                name="academic_course_credit_positive",
                violation_error_message="Credit must be greater than zero.",
            ),
        ]

    def clean(self):
        if self.color and not HEX_COLOR_RE.match(self.color):
            raise ValidationError({"color": "Enter a color like #4F46E5."})

    def __str__(self):
        return f"{self.code} {self.name}".strip()


class ClassSchedule(models.Model):
    """The weekly routine: one row = one class slot every week."""

    class Day(models.IntegerChoices):
        # Values match date.weekday(); order is the dropdown order
        SUNDAY = 6, "Sunday"
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"

    semester = models.ForeignKey(
        Semester,
        on_delete=models.CASCADE,
        related_name="class_schedules",
    )
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name="weekly_classes",
        null=True,
        blank=True,
    )
    # Deprecated: kept only so the old setup form keeps working until Phase 2.
    # save() links it to a Course and keeps it equal to course.name.
    course_name = models.CharField(max_length=100, blank=True)
    day_of_week = models.PositiveSmallIntegerField(choices=Day.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start_time"]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_time__gt=F("start_time")),
                name="academic_schedule_end_after_start",
                violation_error_message="End time must be after start time.",
            ),
        ]

    @property
    def week_order(self):
        """Sunday = 0 ... Saturday = 6, for sorting a week that starts on Sunday."""
        return (self.day_of_week + 1) % 7

    def clean(self):
        errors = []
        if not self.course_id and not (self.course_name or "").strip():
            errors.append("Choose a course or enter a course name.")

        # semester is not a form field in the setup formset, so it can be unset here
        if self.semester_id:
            if self.course_id and self.course.semester_id != self.semester_id:
                errors.append("The selected course does not belong to this semester.")

            if (
                self.day_of_week is not None
                and self.start_time
                and self.end_time
                and self.start_time < self.end_time
            ):
                clashes = ClassSchedule.objects.filter(
                    semester_id=self.semester_id,
                    day_of_week=self.day_of_week,
                    start_time__lt=self.end_time,
                    end_time__gt=self.start_time,
                ).exclude(pk=self.pk)
                if clashes.exists():
                    errors.append("This class overlaps another class in the routine.")

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        name = (self.course_name or "").strip()
        if self.course_id is None and name and self.semester_id:
            course = Course.objects.filter(
                semester_id=self.semester_id, name__iexact=name
            ).first()
            if course is None:
                course = Course.objects.create(semester_id=self.semester_id, name=name)
            self.course = course
        if self.course_id:
            self.course_name = self.course.name
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.course_name} - {self.get_day_of_week_display()} {self.start_time:%H:%M}"


class ClassSession(models.Model):
    """One dated occurrence of a weekly class (or a one-off class).

    Date, time and room are copied from the routine so history survives routine
    edits. Cancelling one occurrence sets is_cancelled and leaves the routine alone.
    """

    semester = models.ForeignKey(
        Semester,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    course = models.ForeignKey(
        Course,
        on_delete=models.RESTRICT,
        related_name="sessions",
    )
    weekly_class = models.ForeignKey(
        ClassSchedule,
        on_delete=models.SET_NULL,
        related_name="sessions",
        null=True,
        blank=True,
    )
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=50, blank=True)
    is_cancelled = models.BooleanField(default=False)
    cancel_reason = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date", "start_time"]
        indexes = [
            models.Index(fields=["semester", "date"], name="academic_session_sem_date_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_time__gt=F("start_time")),
                name="academic_session_end_after_start",
                violation_error_message="End time must be after start time.",
            ),
            models.UniqueConstraint(
                fields=["weekly_class", "date"],
                condition=Q(weekly_class__isnull=False),
                name="academic_session_unique_routine_date",
                violation_error_message="A session already exists for this class on this date.",
            ),
        ]

    def clean(self):
        errors = []
        if self.semester_id:
            if self.course_id and self.course.semester_id != self.semester_id:
                errors.append("The selected course does not belong to this semester.")
            if self.weekly_class_id and self.weekly_class.semester_id != self.semester_id:
                errors.append("The weekly class does not belong to this semester.")
            if self.date and not (self.semester.start_date <= self.date <= self.semester.end_date):
                errors.append("The date is outside the semester.")
        if (
            self.course_id
            and self.weekly_class_id
            and self.weekly_class.course_id
            and self.weekly_class.course_id != self.course_id
        ):
            errors.append("The weekly class belongs to a different course.")
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.course} - {self.date:%Y-%m-%d} {self.start_time:%H:%M}"


class Attendance(models.Model):
    class Status(models.TextChoices):
        PRESENT = "present", "Present"
        ABSENT = "absent", "Absent"
        LATE = "late", "Late"
        EXCUSED = "excused", "Excused"

    session = models.OneToOneField(
        ClassSession,
        on_delete=models.CASCADE,
        related_name="attendance",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PRESENT,
    )
    note = models.CharField(max_length=200, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.session_id and self.session.is_cancelled:
            raise ValidationError("A cancelled class cannot have attendance.")

    def __str__(self):
        return f"{self.session} - {self.get_status_display()}"


class Holiday(models.Model):
    semester = models.ForeignKey(
        Semester,
        on_delete=models.CASCADE,
        related_name="holidays",
    )
    title = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()  # same as start_date for a single day
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start_date"]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__gte=F("start_date")),
                name="academic_holiday_end_not_before_start",
                violation_error_message="End date cannot be before start date.",
            ),
        ]

    def clean(self):
        if self.semester_id and self.start_date and self.end_date:
            sem = self.semester
            if self.start_date < sem.start_date or self.end_date > sem.end_date:
                raise ValidationError("The holiday must fall inside the semester.")

    def __str__(self):
        return f"{self.title} ({self.start_date} - {self.end_date})"


class Assignment(models.Model):
    semester = models.ForeignKey(
        Semester,
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    due_date = models.DateField()
    is_completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["due_date", "id"]

    def clean(self):
        if self.semester_id and self.course_id and self.course.semester_id != self.semester_id:
            raise ValidationError("The selected course does not belong to this semester.")

    def __str__(self):
        return self.title


class CourseGrade(models.Model):
    """Final grade of a course. CGPA = sum(grade_point * course.credit) / sum(course.credit)."""

    course = models.OneToOneField(
        Course,
        on_delete=models.CASCADE,
        related_name="grade",
    )
    grade = models.CharField(max_length=5)  # letter grade, e.g. "A-"
    grade_point = models.DecimalField(max_digits=3, decimal_places=2)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(grade_point__gte=0, grade_point__lte=4),
                name="academic_grade_point_range",
                violation_error_message="Grade point must be between 0 and 4.",
            ),
        ]

    @property
    def quality_points(self):
        return self.grade_point * self.course.credit

    def __str__(self):
        return f"{self.course} - {self.grade}"