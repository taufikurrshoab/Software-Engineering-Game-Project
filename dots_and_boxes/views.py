import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt

from .ai import apply_move, choose_move, is_game_over


def home(request):
    return render(request, "dots_and_boxes/home.html")


@csrf_exempt
def ai_turn(request):

    if request.method == "POST":

        data = json.loads(request.body)
        state = data["state"]

        moves_played = []

        while True:
            move = choose_move(state)
            if move is None:
                break

            completed = apply_move(state, move, "ai")
            moves_played.append({"move": move, "completed": completed})

            if not completed or is_game_over(state):
                break

        return JsonResponse({
            "state": state,
            "moves": moves_played,
            "game_over": is_game_over(state),
        })

    return JsonResponse({"error": "Invalid request"})