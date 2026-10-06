from django.urls import path

from . import views

app_name = "academic"

urlpatterns = [
    path("", views.home, name="home"),
    path("setup/", views.semester_setup, name="setup"),
]