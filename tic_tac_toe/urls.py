from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='tic_tac_toe'),
    path('move/', views.make_move, name='tic_tac_toe_move'),
]