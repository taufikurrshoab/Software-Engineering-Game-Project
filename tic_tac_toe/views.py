import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt

from .ai import best_move


def home(request):
    return render(request, "tic_tac_toe/home.html")


@csrf_exempt
def make_move(request):

    if request.method == "POST":

        data = json.loads(request.body)

        board = data["board"]
        lvl = data["lvl"]

        ai_move = best_move(board, lvl)

        if ai_move != -1:
            board[ai_move] = "O"

        return JsonResponse({
            "ai_move": ai_move
        })

    return JsonResponse({
        "error": "Invalid request"
    })