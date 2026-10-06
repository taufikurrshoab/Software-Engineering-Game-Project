from django.shortcuts import render


def home(request):
    return render(request, "mind_arena/home.html")


def dashboard(request):
    return render(request, "mind_arena/dashboard.html")