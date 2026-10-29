
const input = document.getElementById("initial-state");
const solveBtn = document.getElementById("solve-btn");
const nextBtn = document.getElementById("next-btn");
const autoBtn = document.getElementById("auto-btn");
const resetBtn = document.getElementById("reset-btn");

const boardElement = document.getElementById("puzzle-board");
const errorElement = document.getElementById("error-message");
const statusElement = document.getElementById("status");
const moveLabel = document.getElementById("move-label");
const solvedBadge = document.getElementById("solved-badge");

const gElement = document.getElementById("g-value");
const hElement = document.getElementById("h-value");
const fElement = document.getElementById("f-value");
const lengthElement = document.getElementById("solution-length");
const exploredElement = document.getElementById("explored-count");
const pathElement = document.getElementById("path-list");

const GOAL = [1, 2, 3, 4, 5, 6, 7, 8, 0];

let solutionPath = [];
let currentIndex = 0;
let searchExplored = 0;
let hasSolution = false;

function stateKey(state) {
    return state.join(",");
}

function manhattan(state) {
    let distance = 0;

    for (let i = 0; i < 9; i++) {
        const value = state[i];

        if (value === 0) continue;

        const currentRow = Math.floor(i / 3);
        const currentCol = i % 3;

        const goalIndex = value - 1;
        const goalRow = Math.floor(goalIndex / 3);
        const goalCol = goalIndex % 3;

        distance += Math.abs(currentRow - goalRow);
        distance += Math.abs(currentCol - goalCol);
    }

    return distance;
}

function isSolvable(state) {
    let inversions = 0;

    for (let i = 0; i < state.length; i++) {
        if (state[i] === 0) continue;

        for (let j = i + 1; j < state.length; j++) {
            if (state[j] !== 0 && state[i] > state[j]) {
                inversions++;
            }
        }
    }

    // For a 3x3 board, solvable states have even inversion parity.
    return inversions % 2 === 0;
}

function getNeighbors(state) {
    const zeroIndex = state.indexOf(0);
    const row = Math.floor(zeroIndex / 3);
    const col = zeroIndex % 3;

    const positions = [
        { row: row - 1, col },
        { row: row + 1, col },
        { row, col: col - 1 },
        { row, col: col + 1 }
    ];

    const result = [];

    for (const pos of positions) {
        if (
            pos.row < 0 || pos.row > 2 ||
            pos.col < 0 || pos.col > 2
        ) {
            continue;
        }

        const target = pos.row * 3 + pos.col;
        const next = [...state];

        [next[zeroIndex], next[target]] =
            [next[target], next[zeroIndex]];

        result.push(next);
    }

    return result;
}

// Binary min-heap: the state with the smallest f-score comes first.
class MinHeap {
    constructor() {
        this.items = [];
    }

    push(item) {
        this.items.push(item);
        let index = this.items.length - 1;

        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);

            if (this.items[parent].f <= this.items[index].f) break;

            [this.items[parent], this.items[index]] =
                [this.items[index], this.items[parent]];

            index = parent;
        }
    }

    pop() {
        if (this.items.length === 0) return null;

        const first = this.items[0];
        const last = this.items.pop();

        if (this.items.length > 0) {
            this.items[0] = last;
            let index = 0;

            while (true) {
                const left = index * 2 + 1;
                const right = index * 2 + 2;
                let smallest = index;

                if (
                    left < this.items.length &&
                    this.items[left].f < this.items[smallest].f
                ) {
                    smallest = left;
                }

                if (
                    right < this.items.length &&
                    this.items[right].f < this.items[smallest].f
                ) {
                    smallest = right;
                }

                if (smallest === index) break;

                [this.items[index], this.items[smallest]] =
                    [this.items[smallest], this.items[index]];

                index = smallest;
            }
        }

        return first;
    }

    get size() {
        return this.items.length;
    }
}

function solveAStar(start) {
    const open = new MinHeap();
    const startKey = stateKey(start);

    const gScore = new Map([[startKey, 0]]);
    const parents = new Map();
    const states = new Map([[startKey, start]]);
    const closed = new Set();

    open.push({
        key: startKey,
        state: start,
        g: 0,
        h: manhattan(start),
        f: manhattan(start)
    });

    let explored = 0;

    while (open.size > 0) {
        const current = open.pop();

        // Ignore outdated heap entries.
        if (closed.has(current.key)) continue;

        if (current.g !== gScore.get(current.key)) continue;

        explored++;

        if (current.key === stateKey(GOAL)) {
            const path = [];
            let key = current.key;

            while (key !== undefined) {
                path.push({
                    state: states.get(key),
                    g: gScore.get(key),
                    h: manhattan(states.get(key))
                });

                key = parents.get(key);
            }

            path.reverse();

            return { path, explored };
        }

        closed.add(current.key);

        for (const next of getNeighbors(current.state)) {
            const nextKey = stateKey(next);
            const tentativeG = current.g + 1;

            if (closed.has(nextKey)) continue;

            const oldG = gScore.get(nextKey);

            if (oldG !== undefined && tentativeG >= oldG) {
                continue;
            }

            parents.set(nextKey, current.key);
            states.set(nextKey, next);
            gScore.set(nextKey, tentativeG);

            const h = manhattan(next);

            open.push({
                key: nextKey,
                state: next,
                g: tentativeG,
                h,
                f: tentativeG + h
            });
        }
    }

    return { path: null, explored };
}

function parseInput() {
    const tokens = input.value.trim().split(/[\s,]+/);

    if (
        tokens.length !== 9 ||
        tokens.some(token => !/^[0-8]$/.test(token))
    ) {
        throw new Error(
            "Enter exactly 9 numbers from 0 to 8, separated by commas or spaces."
        );
    }

    const state = tokens.map(Number);

    if (new Set(state).size !== 9) {
        throw new Error("Each number from 0 to 8 must appear exactly once.");
    }

    return state;
}

function renderBoard(state) {
    boardElement.replaceChildren();

    state.forEach(value => {
        const tile = document.createElement("div");

        tile.className = value === 0 ? "tile blank" : "tile";
        tile.textContent = value === 0 ? "" : String(value);
        tile.setAttribute(
            "aria-label",
            value === 0 ? "Blank tile" : `Tile ${value}`
        );

        boardElement.appendChild(tile);
    });
}

function renderPath() {
    pathElement.replaceChildren();

    solutionPath.forEach((step, index) => {
        const item = document.createElement("div");

        item.className = "path-step";

        if (index < currentIndex) {
            item.classList.add("complete");
        }

        if (index === currentIndex) {
            item.classList.add("active");
        }

        item.textContent =
            index === 0 ? "Start" :
            index === solutionPath.length - 1 ? `Goal · ${index}` :
            `Move ${index}`;

        pathElement.appendChild(item);
    });
}

function showCurrentState() {
    if (!solutionPath.length) return;

    const step = solutionPath[currentIndex];

    renderBoard(step.state);

    moveLabel.textContent = `Move ${step.g}`;
    gElement.textContent = String(step.g);
    hElement.textContent = String(step.h);
    fElement.textContent = String(step.g + step.h);

    exploredElement.textContent = String(searchExplored);
    renderPath();

    const isGoal = stateKey(step.state) === stateKey(GOAL);

    solvedBadge.textContent = isGoal ? "Solved!" : "In progress";
    solvedBadge.classList.toggle("success", isGoal);

    if (isGoal) {
        statusElement.textContent =
            `Puzzle solved in ${step.g} moves. A* explored ${searchExplored} states.`;

        nextBtn.disabled = true;
        autoBtn.disabled = true;
    } else {
        statusElement.textContent =
            `Showing move ${step.g} of ${solutionPath.length - 1}.`;

        nextBtn.disabled = false;
        autoBtn.disabled = false;
    }
}

function findSolution() {
    errorElement.textContent = "";
    hasSolution = false;

    try {
        const start = parseInput();

        if (!isSolvable(start)) {
            resetDisplay();
            renderBoard(start);
            errorElement.textContent =
                "This puzzle is not solvable. Change the tile order and try again.";
            statusElement.textContent = "No solution exists for this state.";
            return;
        }

        statusElement.textContent = "Searching for an optimal solution...";
        solveBtn.disabled = true;

        // The search is synchronous, so always restore the button afterward.
        try {
            const result = solveAStar(start);

            searchExplored = result.explored;

            if (!result.path) {
                resetDisplay();
                renderBoard(start);
                errorElement.textContent = "No solution was found.";
                statusElement.textContent = "Search finished without a solution.";
                return;
            }

            solutionPath = result.path;
            currentIndex = 0;
            hasSolution = true;

            lengthElement.textContent = String(solutionPath.length - 1);
            exploredElement.textContent = String(searchExplored);

            nextBtn.disabled = solutionPath.length <= 1;
            autoBtn.disabled = solutionPath.length <= 1;

            showCurrentState();
        } finally {
            solveBtn.disabled = false;
        }
    } catch (error) {
        resetDisplay();
        errorElement.textContent = error.message;
        statusElement.textContent = "Please correct the input.";
    }
}

function nextStep() {
    if (!hasSolution || currentIndex >= solutionPath.length - 1) {
        return;
    }

    currentIndex++;
    showCurrentState();
}

function autoSolve() {
    if (!hasSolution) return;

    currentIndex = solutionPath.length - 1;
    showCurrentState();
}

function resetDisplay() {
    solutionPath = [];
    currentIndex = 0;
    searchExplored = 0;
    hasSolution = false;

    nextBtn.disabled = true;
    autoBtn.disabled = true;

    gElement.textContent = "0";
    hElement.textContent = "0";
    fElement.textContent = "0";
    lengthElement.textContent = "—";
    exploredElement.textContent = "0";

    moveLabel.textContent = "Move 0";
    solvedBadge.textContent = "Not solved";
    solvedBadge.classList.remove("success");

    pathElement.textContent = "The solution path will appear here.";
}

solveBtn.addEventListener("click", findSolution);

nextBtn.addEventListener("click", nextStep);

autoBtn.addEventListener("click", autoSolve);

resetBtn.addEventListener("click", () => {
    resetDisplay();
    errorElement.textContent = "";
    statusElement.textContent = "Enter a puzzle and find its solution.";

    try {
        renderBoard(parseInput());
    } catch {
        renderBoard(GOAL);
    }
});

input.addEventListener("input", () => {
    errorElement.textContent = "";
});

renderBoard(parseInput());
