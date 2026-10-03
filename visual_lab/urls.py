from django.urls import path
from . import views

app_name = "visual_lab"

urlpatterns = [
    path("", views.home, name="home"),
    path("bfs/", views.bfs, name="bfs"),
]