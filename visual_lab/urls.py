from django.urls import path
from . import views

app_name = "visual_lab"

urlpatterns = [
    path("", views.home, name="home"),
    path("bfs/", views.bfs, name="bfs"),
    path("dfs/", views.dfs, name="dfs"),
    path("minimax/", views.minimax, name="minimax"),
    path("8-puzzle/", views.puzzle8, name="puzzle8"),
    path("dijkstra/", views.dijkstra, name="dijkstra"),
    path("bellman-ford/", views.bellman_ford, name="bellman_ford"),
]