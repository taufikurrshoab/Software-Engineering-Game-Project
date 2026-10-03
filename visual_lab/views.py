from django.shortcuts import render

def home(request):
    return render(request, "visual_lab/home.html")

def bfs(request):
    return render(request, "visual_lab/bfs.html")