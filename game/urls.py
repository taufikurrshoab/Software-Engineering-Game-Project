from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('core.urls')),
    path('mind-arena/', include('mind_arena.urls')),
    path('accounts/', include('accounts.urls')),
    path('games/tic-tac-toe/', include('tic_tac_toe.urls')),
    path('games/dots-and-boxes/', include('dots_and_boxes.urls')),
    path("games/8-puzzle/", include("puzzle8.urls")),
    path("visual-lab/", include("visual_lab.urls")),
    path("academic/", include("academic.urls")),
    path("skill/", include("skill.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
