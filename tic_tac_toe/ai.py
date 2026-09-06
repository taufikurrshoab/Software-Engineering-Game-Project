import random
win_patterns = [

    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],

    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],

    [0, 4, 8],
    [2, 4, 6]

]



def check_winner(board):

    for pattern in win_patterns:

        a, b, c = pattern


        if (
            board[a] != "" and
            board[a] == board[b] and
            board[a] == board[c]
        ):

            return board[a]


    if "" not in board:
        return "draw"


    return None

def available_moves(board):

    moves = []


    for i in range(9):

        if board[i] == "":

            moves.append(i)


    return moves

def minmax(board,turn):
    res=check_winner(board)
    if res=="O":
        return 1
    elif res=="X":
        return -1
    elif res=="draw":
        return 0
    #ai turn
    if turn:
        best_score=-1000
        for move in available_moves(board):
            board[move]="O"
            score=minmax(board,False)
            board[move]="" #aita mane undo kora...move age e permanent na..best pele permanent
            best_score=max(score,best_score)

        return best_score
    else:
        best_score=1000
        for move in available_moves(board):
            board[move]="X"
            score=minmax(board,True)
            board[move]="" #aita mane undo kora...move age e permanent na..best pele permanent
            best_score=min(score,best_score)

        return best_score


#aita ai er best move ber korbe
def smart_move(board):

    best_score = -100
    move = -1

    for i in available_moves(board):

        board[i] = "O"

        score = minmax(board, False)

        board[i] = ""

        if score > best_score:
            best_score = score
            move = i

    return move



def best_move(board, lvl):

    moves = available_moves(board)

    if not moves:
        return -1


    
    if lvl == "easy":
        return random.choice(moves)


   
    elif lvl == "medium":

        chance = random.randint(1, 100)

        if chance <= 40:
            return random.choice(moves)

        return smart_move(board)


   
    else:
        return smart_move(board)