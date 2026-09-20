from django.http import JsonResponse
from django.shortcuts import render

from .solver import astar


# ============================================================
# APPLY ONE MOVE TO THE BOARD
# ============================================================

def apply_move(board, move):
    """
    Apply one move to the 8-puzzle board.

    0 represents the empty space.

    Example:

        1 2 3
        4 5 6
        7 0 8

    move = "RIGHT"

        1 2 3
        4 5 6
        7 8 0
    """

    # Find the empty space
    x = y = 0

    for i in range(3):
        for j in range(3):

            if board[i][j] == 0:
                x = i
                y = j
                break


    # New position of empty space
    nx = x
    ny = y


    # Calculate new position
    if move == "UP":
        nx -= 1

    elif move == "DOWN":
        nx += 1

    elif move == "LEFT":
        ny -= 1

    elif move == "RIGHT":
        ny += 1


    # Swap tiles
    board[x][y], board[nx][ny] = (
        board[nx][ny],
        board[x][y]
    )


    return board


# ============================================================
# MAIN 8 PUZZLE VIEW
# ============================================================

def home(request):

    # ========================================================
    # DEFAULT STATE
    # ========================================================

    context = {
        "mode": "input",
        "msg": "",
        "current_move": "",
        "board": [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
        ]
    }


    # ========================================================
    # GET REQUEST
    # ========================================================

    if request.method == "GET":

        # If an active puzzle exists in session,
        # restore it when the page is opened/refreshed.

        if (
            request.session.get("moves")
            and request.session.get("board") is not None
        ):

            moves = request.session.get("moves", [])
            step = request.session.get("step", 0)
            board = request.session.get("board")


            # Puzzle is still being solved
            if step < len(moves):

                context["mode"] = "play"
                context["board"] = board
                context["current_move"] = moves[step]


            # Puzzle was solved
            else:

                context["mode"] = "solved"
                context["board"] = board
                context["msg"] = "Solved"


        return render(
            request,
            "puzzle8/puzzle8.html",
            context
        )


    # ========================================================
    # POST REQUEST
    # ========================================================

    if request.method == "POST":

        action = request.POST.get("action")


        # ====================================================
        # SOLVE
        # ====================================================

        if action == "solve":

            flat = []


            # ------------------------------------------------
            # READ CELL 0 ... CELL 8
            # ------------------------------------------------

            for i in range(9):

                value = request.POST.get(
                    f"cell{i}"
                )


                if value is None or value == "":

                    context["msg"] = "Fill all boxes."

                    return render(
                        request,
                        "puzzle8/puzzle8.html",
                        context
                    )


                try:

                    number = int(value)

                except ValueError:

                    context["msg"] = "Invalid input."

                    return render(
                        request,
                        "puzzle8/puzzle8.html",
                        context
                    )


                flat.append(number)


            # ------------------------------------------------
            # VALIDATE 0-8
            # ------------------------------------------------

            if sorted(flat) != list(range(9)):

                context["msg"] = (
                    "Use every number from 0 to 8 exactly once."
                )

                return render(
                    request,
                    "puzzle8/puzzle8.html",
                    context
                )


            # ------------------------------------------------
            # CREATE 3x3 BOARD
            # ------------------------------------------------

            board = [
                flat[0:3],
                flat[3:6],
                flat[6:9]
            ]


            # ------------------------------------------------
            # RUN A*
            # ------------------------------------------------

            solution = astar(board)


            # =================================================
            # NOT SOLVABLE
            # =================================================

            if solution is None:

                context["mode"] = "input"
                context["msg"] = "Not Solvable"
                context["board"] = board

                return render(
                    request,
                    "puzzle8/puzzle8.html",
                    context
                )


            # =================================================
            # ALREADY SOLVED
            # =================================================

            if len(solution) == 0:

                context["mode"] = "solved"
                context["msg"] = "Already Solved"
                context["board"] = board

                return render(
                    request,
                    "puzzle8/puzzle8.html",
                    context
                )


            # =================================================
            # SAVE GAME STATE
            # =================================================

            request.session["moves"] = solution
            request.session["step"] = 0
            request.session["board"] = board


            # =================================================
            # RETURN PLAY PAGE
            # =================================================

            context["mode"] = "play"
            context["board"] = board
            context["current_move"] = solution[0]


            return render(
                request,
                "puzzle8/puzzle8.html",
                context
            )


        # ====================================================
        # NEXT MOVE
        # ====================================================

        elif action == "next":

            # Get saved game state
            moves = request.session.get(
                "moves",
                []
            )

            step = request.session.get(
                "step",
                0
            )

            board = request.session.get(
                "board"
            )


            # ------------------------------------------------
            # No active game
            # ------------------------------------------------

            if not moves or board is None:

                return JsonResponse({
                    "success": False,
                    "message": "No active puzzle."
                })


            # ------------------------------------------------
            # Check whether solution is already finished
            # ------------------------------------------------

            if step >= len(moves):

                return JsonResponse({
                    "success": False,
                    "message": "Puzzle already solved.",
                    "solved": True
                })


            # ------------------------------------------------
            # Get next move
            # ------------------------------------------------

            move = moves[step]


            # ------------------------------------------------
            # Apply move
            # ------------------------------------------------

            board = apply_move(
                board,
                move
            )


            # Move to next step
            step += 1


            # ------------------------------------------------
            # Save updated state
            # ------------------------------------------------

            request.session["board"] = board
            request.session["step"] = step


            # =================================================
            # SOLVED
            # =================================================

            if step >= len(moves):

                return JsonResponse({
                    "success": True,
                    "board": board,
                    "solved": True,
                    "message": "Solved",
                    "current_move": None,
                    "step": step,
                    "total_moves": len(moves)
                })


            # =================================================
            # STILL PLAYING
            # =================================================

            next_move = moves[step]


            return JsonResponse({
                "success": True,
                "board": board,
                "solved": False,
                "message": "",
                "current_move": next_move,
                "step": step,
                "total_moves": len(moves)
            })


        # ====================================================
        # RESET
        # ====================================================

        elif action == "reset":

            # Remove only puzzle-related session data

            request.session.pop(
                "moves",
                None
            )

            request.session.pop(
                "step",
                None
            )

            request.session.pop(
                "board",
                None
            )


            # ------------------------------------------------
            # If JavaScript requested reset,
            # return JSON instead of reloading the page.
            # ------------------------------------------------

            if request.headers.get("X-Requested-With") == "XMLHttpRequest":

                return JsonResponse({
                    "success": True,
                    "reset": True
                })


            # ------------------------------------------------
            # Normal reset request
            # ------------------------------------------------

            context = {
                "mode": "input",
                "msg": "",
                "current_move": "",
                "board": [
                    [0, 0, 0],
                    [0, 0, 0],
                    [0, 0, 0],
                ]
            }


            return render(
                request,
                "puzzle8/puzzle8.html",
                context
            )


    # ========================================================
    # UNKNOWN ACTION
    # ========================================================

    return JsonResponse({
        "success": False,
        "message": "Invalid action."
    })