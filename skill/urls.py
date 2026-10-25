from django.urls import path

from . import views

app_name = "skill"

urlpatterns = [
    path("", views.home, name="home"),

    path("skills/new/", views.skill_create, name="skill_create"),
    path("skills/<int:pk>/edit/", views.skill_edit, name="skill_edit"),
    path("skills/<int:pk>/progress/", views.skill_progress, name="skill_progress"),
    path("skills/<int:pk>/delete/", views.skill_delete, name="skill_delete"),

    path("projects/new/", views.project_create, name="project_create"),
    path("projects/<int:pk>/", views.project_detail, name="project_detail"),
    path("projects/<int:pk>/edit/", views.project_edit, name="project_edit"),
    path("projects/<int:pk>/delete/", views.project_delete, name="project_delete"),
]