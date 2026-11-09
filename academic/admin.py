from django.contrib import admin

from .models import SemesterGPA


@admin.register(SemesterGPA)
class SemesterGPAAdmin(admin.ModelAdmin):
    list_display = ("name", "student", "term", "gpa", "credits")
    list_filter = ("student",)
    ordering = ("student", "term")
