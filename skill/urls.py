from django.urls import path

from . import views, assessment_views

app_name = "skill"

urlpatterns = [
    path("", views.home, name="home"),

    path("skills/new/", views.skill_create, name="skill_create"),
    path("skills/<int:pk>/edit/", views.skill_edit, name="skill_edit"),
    path("skills/<int:pk>/delete/", views.skill_delete, name="skill_delete"),
    path("recommendations/refresh/", views.recommendations_refresh, name="recommendations_refresh"),

    path("skills/<int:skill_id>/assess/", assessment_views.assessment_start, name="assessment_start"),
    path("assessments/<int:assessment_id>/", assessment_views.assessment_take, name="assessment_take"),
    path("assessments/<int:assessment_id>/answer/<int:question_id>/", assessment_views.assessment_answer, name="assessment_answer"),
    path("assessments/<int:assessment_id>/result/", assessment_views.assessment_result, name="assessment_result"),
    path("skills/<int:skill_id>/assessments/", assessment_views.assessment_history, name="assessment_history"),

    path("projects/new/", views.project_create, name="project_create"),
    path("projects/<int:pk>/", views.project_detail, name="project_detail"),
    path("projects/<int:pk>/edit/", views.project_edit, name="project_edit"),
    path("projects/<int:pk>/delete/", views.project_delete, name="project_delete"),
]