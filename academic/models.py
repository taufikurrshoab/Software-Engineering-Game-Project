from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Semester(models.Model):
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="semesters",
    )
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        # Dates can be empty here if their own validation already failed
        if self.start_date and self.end_date and self.end_date <= self.start_date:
            raise ValidationError("End date must be after start date.")

    def __str__(self):
        return f"{self.name} ({self.student})"


class ClassSchedule(models.Model):
    """A recurring weekly class. One row = one slot every week."""

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
    # Plain text for now; replace with a Course foreign key later
    course_name = models.CharField(max_length=100)
    day_of_week = models.PositiveSmallIntegerField(choices=Day.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start_time"]

    @property
    def week_order(self):
        """Sunday = 0 ... Saturday = 6, for sorting a week that starts on Sunday."""
        return (self.day_of_week + 1) % 7

    def clean(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError("End time must be after start time.")

    def __str__(self):
        return f"{self.course_name} - {self.get_day_of_week_display()} {self.start_time:%H:%M}"