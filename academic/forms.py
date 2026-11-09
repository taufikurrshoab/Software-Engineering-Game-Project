from django import forms
from django.core.exceptions import ValidationError
from django.db.models import Q

from .models import (
    Assignment,
    Attendance,
    ClassSchedule,
    ClassSession,
    Course,
    CourseGrade,
    Holiday,
    Semester,
    SemesterGPA,
)
from .services import get_holidays, holiday_for

DATE_FORMAT = "%Y-%m-%d"


def date_input():
    return forms.DateInput(attrs={"type": "date"}, format=DATE_FORMAT)


def time_input():
    return forms.TimeInput(attrs={"type": "time"}, format="%H:%M")


class SemesterForm(forms.ModelForm):
    class Meta:
        model = Semester
        fields = ["name", "start_date", "end_date"]
        widgets = {
            "name": forms.TextInput(attrs={
                "class": "semester-setup__input",
                "placeholder": "e.g. 3rd Year - 1st Semester",
                "autocomplete": "off",
            }),
            "start_date": forms.DateInput(
                attrs={"type": "date", "class": "semester-setup__input"},
                format=DATE_FORMAT,
            ),
            "end_date": forms.DateInput(
                attrs={"type": "date", "class": "semester-setup__input"},
                format=DATE_FORMAT,
            ),
        }

    def __init__(self, *args, student, **kwargs):
        super().__init__(*args, **kwargs)
        self.student = student

    def clean_name(self):
        name = self.cleaned_data["name"].strip()
        duplicate = Semester.objects.filter(student=self.student, name__iexact=name)
        if duplicate.exclude(pk=self.instance.pk).exists():
            raise ValidationError("You already have a semester with this name.")
        return name

    def clean(self):
        cleaned = super().clean()
        start, end = cleaned.get("start_date"), cleaned.get("end_date")
        if self.instance.pk and start and end and end > start:
            # Changing the dates must not leave existing data outside the semester
            outside = (
                Holiday.objects.filter(semester=self.instance)
                .filter(Q(start_date__lt=start) | Q(end_date__gt=end)).exists()
                or ClassSession.objects.filter(semester=self.instance)
                .filter(Q(date__lt=start) | Q(date__gt=end)).exists()
                or Assignment.objects.filter(semester=self.instance)
                .filter(Q(due_date__lt=start) | Q(due_date__gt=end)).exists()
            )
            if outside:
                raise ValidationError(
                    "Holidays, classes or assignments fall outside these dates. "
                    "Move or delete them first."
                )
        return cleaned


class SemesterScopedForm(forms.ModelForm):
    """Base for forms whose object belongs to one semester (set by the view, not the user)."""

    def __init__(self, *args, semester, **kwargs):
        super().__init__(*args, **kwargs)
        self.semester = semester
        self.instance.semester = semester  # lets the model's clean() check this semester


class CourseForm(SemesterScopedForm):
    class Meta:
        model = Course
        fields = ["name", "code", "credit", "teacher", "color"]
        widgets = {
            "credit": forms.NumberInput(attrs={"step": "0.5", "min": "0.5"}),
            "color": forms.TextInput(attrs={"type": "color"}),
        }

    def _others(self):
        return Course.objects.filter(semester=self.semester).exclude(pk=self.instance.pk)

    def clean_name(self):
        name = self.cleaned_data["name"].strip()
        if self._others().filter(name__iexact=name).exists():
            raise ValidationError("This course already exists in the semester.")
        return name

    def clean_code(self):
        code = self.cleaned_data["code"].strip()
        if code and self._others().filter(code__iexact=code).exists():
            raise ValidationError("This course code is already used in the semester.")
        return code


class ClassScheduleForm(SemesterScopedForm):
    """One weekly class. The course must already exist; it is chosen, never created here."""

    class Meta:
        model = ClassSchedule
        fields = ["course", "day_of_week", "start_time", "end_time", "room"]
        widgets = {"start_time": time_input(), "end_time": time_input()}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        course = self.fields["course"]
        course.queryset = self.semester.courses.all()
        course.required = True
        course.empty_label = "Select a course"
        # Overlaps and duplicates are rejected by ClassSchedule.clean()


class HolidayForm(SemesterScopedForm):
    class Meta:
        model = Holiday
        fields = ["title", "start_date", "end_date"]
        widgets = {"start_date": date_input(), "end_date": date_input()}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["end_date"].required = False  # blank = a single-day holiday

    def clean(self):
        cleaned = super().clean()
        start = cleaned.get("start_date")
        if start and not cleaned.get("end_date"):
            cleaned["end_date"] = start
        end = cleaned.get("end_date")
        if start and end and end >= start:
            clash = (
                Holiday.objects.filter(semester=self.semester,
                                       start_date__lte=end, end_date__gte=start)
                .exclude(pk=self.instance.pk).first()
            )
            if clash:
                raise ValidationError(f"These dates overlap the holiday \u201c{clash.title}\u201d.")
        return cleaned


class AssignmentForm(SemesterScopedForm):
    class Meta:
        model = Assignment
        fields = ["course", "title", "description", "due_date", "is_completed"]
        widgets = {
            "due_date": date_input(),
            "description": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        course = self.fields["course"]
        course.queryset = self.semester.courses.all()
        course.empty_label = "Select a course"

    def clean_due_date(self):
        due = self.cleaned_data["due_date"]
        if not self.semester.start_date <= due <= self.semester.end_date:
            raise ValidationError("The due date must fall inside the semester.")
        return due

    def clean(self):
        cleaned = super().clean()
        course, title, due = cleaned.get("course"), cleaned.get("title"), cleaned.get("due_date")
        if course and title and due:
            duplicate = Assignment.objects.filter(
                course=course, title__iexact=title.strip(), due_date=due
            ).exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise ValidationError("This assignment already exists.")
        return cleaned


class CancelClassForm(forms.Form):
    """Picks one dated occurrence of a weekly class (to cancel or restore it)."""

    date = forms.DateField(widget=date_input())
    reason = forms.CharField(max_length=200, required=False)

    def __init__(self, *args, schedule, **kwargs):
        super().__init__(*args, **kwargs)
        self.schedule = schedule

    def clean_date(self):
        day = self.cleaned_data["date"]
        semester = self.schedule.semester
        if not semester.start_date <= day <= semester.end_date:
            raise ValidationError("The date is outside the semester.")
        if day.weekday() != self.schedule.day_of_week:
            raise ValidationError(
                f"This class meets on {self.schedule.get_day_of_week_display()}s."
            )
        holiday = holiday_for(day, get_holidays(semester))
        if holiday:
            raise ValidationError(f"That day is a holiday ({holiday.title}); no class is held.")
        return day


class AttendanceForm(forms.ModelForm):
    class Meta:
        model = Attendance
        fields = ["status", "note"]


class CourseGradeForm(forms.ModelForm):
    class Meta:
        model = CourseGrade
        fields = ["grade", "grade_point"]
        widgets = {
            "grade_point": forms.NumberInput(attrs={"step": "0.01", "min": "0", "max": "4"}),
        }

    def __init__(self, *args, course, **kwargs):
        super().__init__(*args, **kwargs)
        self.instance.course = course


class SemesterGPAForm(forms.ModelForm):
    """Add or edit the GPA of one semester (the semester-wise record)."""

    class Meta:
        model = SemesterGPA
        fields = ["name", "term", "gpa", "credits"]
        labels = {
            "name": "Semester name",
            "term": "Semester number",
            "gpa": "Semester GPA",
            "credits": "Credits (optional)",
        }
        help_texts = {
            "term": "Its position in your degree: 1 for the first semester, 2 for the second...",
            "credits": "Needed to calculate a credit-weighted CGPA across semesters.",
        }
        widgets = {
            "name": forms.TextInput(attrs={"placeholder": "e.g. 2nd Year - 1st Semester", "autocomplete": "off"}),
            "term": forms.NumberInput(attrs={"min": "1", "max": "99"}),
            "gpa": forms.NumberInput(attrs={"step": "0.01", "min": "0", "max": "4"}),
            "credits": forms.NumberInput(attrs={"step": "0.5", "min": "0.5", "placeholder": "optional"}),
        }

    def __init__(self, *args, student, **kwargs):
        super().__init__(*args, **kwargs)
        self.student = student
        self.instance.student = student

    def _others(self):
        records = SemesterGPA.objects.filter(student=self.student)
        if self.instance.pk:
            records = records.exclude(pk=self.instance.pk)
        return records

    def clean_name(self):
        name = " ".join(self.cleaned_data["name"].split())
        if not name:
            raise ValidationError("Enter a name for this semester.")
        if self._others().filter(name__iexact=name).exists():
            raise ValidationError("You already have a record with this name.")
        return name

    def clean_term(self):
        term = self.cleaned_data["term"]
        if self._others().filter(term=term).exists():
            raise ValidationError("You already have a record for this semester number.")
        return term

    def clean_credits(self):
        credits = self.cleaned_data.get("credits")
        if credits is not None and credits <= 0:
            raise ValidationError("Credits must be greater than zero.")
        return credits
