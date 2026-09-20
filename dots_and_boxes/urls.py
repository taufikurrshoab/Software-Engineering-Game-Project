from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='dots_and_boxes'),
    path('ai-turn/', views.ai_turn, name='dots_and_boxes_ai_turn'),
]