from heapq import heappush, heappop
goal = [
    [1,2,3],
    [4,5,6],
    [7,8,0]
]

def heu(state):
    cnt = 0

    for i in range(3):
        for j in range(3):
            if state[i][j] != 0 and state[i][j] != goal[i][j]:
                cnt += 1

    return cnt

def find_zero(state):
    for i in range(3):
        for j in range(3):
            if state[i][j] == 0:
                return i, j


def neighbor(state):
    x, y = find_zero(state)

    neighbors = []

    moves = [
        (-1, 0, "UP"),
        (1, 0, "DOWN"),
        (0, -1, "LEFT"),
        (0, 1, "RIGHT")
    ]

    for dx, dy,move_name in moves:
        nx, ny = x + dx, y + dy

        if 0 <= nx < 3 and 0 <= ny < 3:
            new_state = [row[:] for row in state]

            
            new_state[x][y], new_state[nx][ny] = new_state[nx][ny], new_state[x][y]

            neighbors.append((new_state,move_name))

    return neighbors


def astar(start):
    pq = []

    heappush(pq, (heu(start), 0, start, []))

    closed = set()

    while pq:
        f, g, state, path = heappop(pq)

        if state == goal:
            return path

        closed.add(str(state))

        for child, move in neighbor(state):
            if str(child) not in closed:
                new_g = g + 1
                new_f = new_g + heu(child)

                heappush(pq, (new_f, new_g, child, path + [move]))

    return None
