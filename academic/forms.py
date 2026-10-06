from django import forms
from django.forms import BaseInlineFormSet, inlineformset_factory

from .models import ClassSchedule, Semester


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
                format="%Y-%m-%d",
            ),
            "end_date": forms.DateInput(
                attrs={"type": "date", "class": "semester-setup__input"},
                format="%Y-%m-%d",
            ),
        }


class ClassScheduleForm(forms.ModelForm):
    class Meta:
        model = ClassSchedule
        fields = ["day_of_week", "course_name", "start_time", "end_time", "room"]
        widgets = {
            "day_of_week": forms.Select(attrs={"class": "semester-setup__input"}),
            "course_name": forms.TextInput(attrs={
                "class": "semester-setup__input",
                "placeholder": "e.g. Machine Learning",
                "autocomplete": "off",
            }),
            "start_time": forms.TimeInput(
                attrs={"type": "time", "class": "semester-setup__input"},
                format="%H:%M",
            ),
            "end_time": forms.TimeInput(
                attrs={"type": "time", "class": "semester-setup__input"},
                format="%H:%M",
            ),
            "room": forms.TextInput(attrs={
                "class": "semester-setup__input",
                "placeholder": "e.g. 302",
                "autocomplete": "off",
            }),
        }


class BaseRoutineFormSet(BaseInlineFormSet):
    # Field names become routine-0-day_of_week, routine-1-course_name, ...
    @classmethod
    def get_default_prefix(cls):
        return "routine"


ClassScheduleFormSet = inlineformset_factory(
    Semester,
    ClassSchedule,
    form=ClassScheduleForm,
    formset=BaseRoutineFormSet,
    extra=1,
    can_delete=False,
)