from django import forms
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import UploadedFile

from .models import Project, Skill, Technology

MAX_SCREENSHOT_MB = 5
MAX_TECHNOLOGIES = 12


class SkillForm(forms.ModelForm):
    class Meta:
        model = Skill
        fields = ["name", "category", "parent", "progress"]
        widgets = {
            "name": forms.TextInput(attrs={
                "class": "skill-input", "placeholder": "e.g. Python", "autocomplete": "off",
            }),
            "category": forms.Select(attrs={"class": "skill-input"}),
            "parent": forms.Select(attrs={"class": "skill-input"}),
            "progress": forms.NumberInput(attrs={
                "class": "skill-input", "min": 0, "max": 100, "step": 5,
            }),
        }

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        self.instance.user = user  # Skill.clean() needs the owner

        parents = Skill.objects.filter(user=user)
        if self.instance.pk:
            # A skill can't become a child of itself or its own descendants
            blocked = {self.instance.pk, *self.instance.descendant_ids()}
            parents = parents.exclude(pk__in=blocked)
        self.fields["parent"].queryset = parents
        self.fields["parent"].empty_label = "No parent (top-level skill)"

    def clean_name(self):
        name = " ".join(self.cleaned_data["name"].split())
        duplicates = Skill.objects.filter(user=self.user, name__iexact=name)
        if self.instance.pk:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise ValidationError("You already have a skill with this name.")
        return name


class SkillProgressForm(forms.Form):
    progress = forms.IntegerField(min_value=0, max_value=100)


class ProjectForm(forms.ModelForm):
    technologies_text = forms.CharField(
        label="Technologies",
        required=False,
        help_text="Separate with commas, e.g. HTML, CSS, JavaScript, Django",
        widget=forms.TextInput(attrs={"class": "skill-input", "autocomplete": "off"}),
    )

    class Meta:
        model = Project
        fields = ["name", "description", "screenshot", "completed_date",
                  "project_url", "related_skills"]
        widgets = {
            "name": forms.TextInput(attrs={"class": "skill-input", "autocomplete": "off"}),
            "description": forms.Textarea(attrs={"class": "skill-input", "rows": 4}),
            "screenshot": forms.ClearableFileInput(attrs={"accept": "image/*"}),
            "completed_date": forms.DateInput(
                attrs={"type": "date", "class": "skill-input"}, format="%Y-%m-%d"
            ),
            "project_url": forms.URLInput(attrs={
                "class": "skill-input", "placeholder": "https://",
            }),
            "related_skills": forms.CheckboxSelectMultiple,
        }

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        self.instance.user = user
        # Only the user's own skills can be linked
        self.fields["related_skills"].queryset = Skill.objects.filter(user=user)
        self._old_screenshot = self.instance.screenshot.name if self.instance.pk else ""
        if self.instance.pk:
            self.fields["technologies_text"].initial = ", ".join(
                t.name for t in self.instance.technologies.all()
            )

    def clean_screenshot(self):
        image = self.cleaned_data.get("screenshot")
        if isinstance(image, UploadedFile) and image.size > MAX_SCREENSHOT_MB * 1024 * 1024:
            raise ValidationError(f"Image must be smaller than {MAX_SCREENSHOT_MB} MB.")
        return image

    def clean_technologies_text(self):
        names, seen = [], set()
        for raw in self.cleaned_data.get("technologies_text", "").split(","):
            name = " ".join(raw.split())
            if name and name.lower() not in seen:
                seen.add(name.lower())
                names.append(name)
        if len(names) > MAX_TECHNOLOGIES:
            raise ValidationError(f"Add at most {MAX_TECHNOLOGIES} technologies.")
        if any(len(n) > 50 for n in names):
            raise ValidationError("Each technology name must be 50 characters or fewer.")
        return names

    def save(self, commit=True):
        project = super().save(commit=False)
        project.user = self.user
        if commit:
            project.save()
            self.save_m2m()  # related skills
            self._save_technologies(project)
            self._remove_replaced_screenshot(project)
        return project

    def _save_technologies(self, project):
        technologies = []
        for name in self.cleaned_data["technologies_text"]:
            tech = Technology.objects.filter(name__iexact=name).first()
            technologies.append(tech or Technology.objects.create(name=name))
        project.technologies.set(technologies)

    def _remove_replaced_screenshot(self, project):
        # Delete the old file after a replacement or when "clear" is ticked
        if self._old_screenshot and project.screenshot.name != self._old_screenshot:
            default_storage.delete(self._old_screenshot)