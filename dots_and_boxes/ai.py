import random

ROWS = 3  # boxes per row
COLS = 3  # boxes per column


def create_state():
    return {
        "h": [[0] * COLS for _ in range(ROWS + 1)],
        "v": [[0] * (COLS + 1) for _ in range(ROWS)],
        "boxes": [[None] * COLS for _ in range(ROWS)],
    }


def get_available_moves(state):
    moves = []

    for r in range(ROWS + 1):
        for c in range(COLS):
            if state["h"][r][c] == 0:
                moves.append({"type": "h", "row": r, "col": c})

    for r in range(ROWS):
        for c in range(COLS + 1):
            if state["v"][r][c] == 0:
                moves.append({"type": "v", "row": r, "col": c})

    return moves


def box_sides_drawn(state, r, c):
    return (
        state["h"][r][c]
        + state["h"][r + 1][c]
        + state["v"][r][c]
        + state["v"][r][c + 1]
    )


def boxes_adjacent_to_line(move):
    boxes = []
    r, c = move["row"], move["col"]

    if move["type"] == "h":
        if r > 0:
            boxes.append((r - 1, c))
        if r < ROWS:
            boxes.append((r, c))
    else:
        if c > 0:
            boxes.append((r, c - 1))
        if c < COLS:
            boxes.append((r, c))

    return boxes


def apply_move(state, move, owner):
    if move["type"] == "h":
        state["h"][move["row"]][move["col"]] = 1
    else:
        state["v"][move["row"]][move["col"]] = 1

    completed = []

    for (r, c) in boxes_adjacent_to_line(move):
        if state["boxes"][r][c] is None and box_sides_drawn(state, r, c) == 4:
            state["boxes"][r][c] = owner
            completed.append([r, c])

    return completed


def choose_move(state):
    moves = get_available_moves(state)
    if not moves:
        return None

    # 1. Take a free box if any move completes one
    completing_moves = []
    for move in moves:
        gain = sum(
            1
            for (r, c) in boxes_adjacent_to_line(move)
            if state["boxes"][r][c] is None and box_sides_drawn(state, r, c) == 3
        )
        if gain > 0:
            completing_moves.append((gain, move))

    if completing_moves:
        completing_moves.sort(key=lambda x: -x[0])
        return completing_moves[0][1]

    # 2. Play safe - don't create a 3-sided box for the opponent
    safe_moves = [
        move for move in moves
        if not any(
            state["boxes"][r][c] is None and box_sides_drawn(state, r, c) == 2
            for (r, c) in boxes_adjacent_to_line(move)
        )
    ]

    if safe_moves:
        return random.choice(safe_moves)

    # 3. Forced to give something away - minimize the damage
    def boxes_given_away(move):
        return sum(
            1
            for (r, c) in boxes_adjacent_to_line(move)
            if state["boxes"][r][c] is None and box_sides_drawn(state, r, c) == 3
        )

    return min(moves, key=boxes_given_away)


def is_game_over(state):
    return all(
        state["boxes"][r][c] is not None
        for r in range(ROWS)
        for c in range(COLS)
    )