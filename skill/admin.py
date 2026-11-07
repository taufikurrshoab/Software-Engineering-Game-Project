from django.contrib import admin

from .models import Assessment, AssessmentQuestion, Project, Skill, Technology


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "category", "progress", "status", "updated_at")
    list_filter = ("category", "status")
    search_fields = ("name", "user__username")


class AssessmentQuestionInline(admin.TabularInline):
    model = AssessmentQuestion
    extra = 0
    readonly_fields = ("question_number", "topic", "difficulty", "selected_index", "is_correct")


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ("skill", "user", "status", "score", "answered_questions", "started_at", "completed_at")
    list_filter = ("status", "next_difficulty")
    search_fields = ("skill__name", "user__username")
    inlines = [AssessmentQuestionInline]


admin.site.register(Project)
admin.site.register(Technology)
