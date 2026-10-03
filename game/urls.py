
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('core.urls')),
    path('mind-arena/', include('mind_arena.urls')),
    path('accounts/', include('accounts.urls')),
    path('games/tic-tac-toe/', include('tic_tac_toe.urls')),
    path('games/dots-and-boxes/', include('dots_and_boxes.urls')),
    path("games/8-puzzle/", include("puzzle8.urls")),
    path("visual-lab/", include("visual_lab.urls")),
]
