
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('core.urls')),
    path('accounts/', include('accounts.urls')),
    path('games/tic-tac-toe/', include('tic_tac_toe.urls')),
    path('games/dots-and-boxes/', include('dots_and_boxes.urls')),
]
