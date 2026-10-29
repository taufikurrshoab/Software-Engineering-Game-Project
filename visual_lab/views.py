from django.shortcuts import render

def home(request):
    return render(request, "visual_lab/home.html")

def bfs(request):
    return render(request, "visual_lab/bfs.html")

def dfs(request):
    return render(request, "visual_lab/dfs.html")

def minimax(request):
    return render(request, "visual_lab/minimax.html")

def puzzle8(request):
    return render(request, "visual_lab/puzzle8.html")

def dijkstra(request):
    return render(request, "visual_lab/dijkstra.html")

def bellman_ford(request):
    return render(request, "visual_lab/bellman_ford.html")


