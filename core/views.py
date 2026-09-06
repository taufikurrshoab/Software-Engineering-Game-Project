from django.contrib.auth.decorators import login_required
from django.shortcuts import render


def home(request):
    games = [
        {
            'title': 'Arcade Arena',
            'status': 'Coming soon',
            'description': 'Fast, lightweight browser games will live here.',
        },
        {
            'title': 'Puzzle Lab',
            'status': 'Coming soon',
            'description': 'Logic and brain games can be added as separate Django apps.',
        },
        {
            'title': 'Challenge Hub',
            'status': 'Coming soon',
            'description': 'A future place for leaderboards, scores, and player progress.',
        },
    ]
    return render(request, 'core/home.html', {'games': games})


@login_required
def dashboard(request):
    games = [
        {'title': 'First Game Slot', 'status': 'Ready for app link'},
        {'title': 'Second Game Slot', 'status': 'Ready for app link'},
        {'title': 'Third Game Slot', 'status': 'Ready for app link'},
    ]
    return render(request, 'core/dashboard.html', {'games': games})
