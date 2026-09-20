const ROWS = 3;
const COLS = 3;

const boardEl = document.getElementById("dab-board");
const statusText = document.getElementById("status");
const restartBtn = document.getElementById("restart-btn");
const player_sc = document.getElementById("player-score");
const ai_sc = document.getElementById("ai-score");

let state = createState();
let gameOver = false;
let busy = false;
let player = 0, ai = 0;


function createState() {
    return {
        h: Array.from({ length: ROWS + 1 }, () => Array(COLS).fill(0)),
        v: Array.from({ length: ROWS }, () => Array(COLS + 1).fill(0)),
        boxes: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    };
}


function boxSidesDrawn(r, c) {
    return state.h[r][c] + state.h[r + 1][c] + state.v[r][c] + state.v[r][c + 1];
}


function boxesAdjacentToLine(type, r, c) {
    const boxes = [];
    if (type === "h") {
        if (r > 0) boxes.push([r - 1, c]);
        if (r < ROWS) boxes.push([r, c]);
    } else {
        if (c > 0) boxes.push([r, c - 1]);
        if (c < COLS) boxes.push([r, c]);
    }
    return boxes;
}


function applyMove(type, r, c, owner) {
    if (type === "h") state.h[r][c] = 1;
    else state.v[r][c] = 1;

    const completed = [];
    for (const [br, bc] of boxesAdjacentToLine(type, r, c)) {
        if (state.boxes[br][bc] === null && boxSidesDrawn(br, bc) === 4) {
            state.boxes[br][bc] = owner;
            completed.push([br, bc]);
        }
    }
    return completed;
}


function isGameOver() {
    return state.boxes.every(row => row.every(cell => cell !== null));
}


function render() {
    boardEl.innerHTML = "";

    const gridRows = ROWS * 2 + 1;
    const gridCols = COLS * 2 + 1;

    const DOT_SIZE = 14;
    const CELL_SIZE = 90;

    const colSizes = [];
    for (let gc = 0; gc < gridCols; gc++) {
        colSizes.push(gc % 2 === 0 ? `${DOT_SIZE}px` : `${CELL_SIZE}px`);
    }

    const rowSizes = [];
    for (let gr = 0; gr < gridRows; gr++) {
        rowSizes.push(gr % 2 === 0 ? `${DOT_SIZE}px` : `${CELL_SIZE}px`);
    }

    boardEl.style.gridTemplateColumns = colSizes.join(" ");
    boardEl.style.gridTemplateRows = rowSizes.join(" ");

    for (let gr = 0; gr < gridRows; gr++) {
        for (let gc = 0; gc < gridCols; gc++) {

            const cell = document.createElement("div");

            if (gr % 2 === 0 && gc % 2 === 0) {
                cell.className = "dab-dot";

            } else if (gr % 2 === 0 && gc % 2 === 1) {
                const r = gr / 2, c = (gc - 1) / 2;
                cell.className = "dab-hline" + (state.h[r][c] ? " drawn" : "");
                if (!state.h[r][c]) {
                    cell.addEventListener("click", () => handlePlayerMove("h", r, c));
                }

            } else if (gr % 2 === 1 && gc % 2 === 0) {
                const r = (gr - 1) / 2, c = gc / 2;
                cell.className = "dab-vline" + (state.v[r][c] ? " drawn" : "");
                if (!state.v[r][c]) {
                    cell.addEventListener("click", () => handlePlayerMove("v", r, c));
                }

            } else {
                const r = (gr - 1) / 2, c = (gc - 1) / 2;
                cell.className = "dab-box";
                const owner = state.boxes[r][c];
                if (owner === "player") cell.classList.add("player-owned");
                if (owner === "ai") cell.classList.add("ai-owned");
            }

            boardEl.appendChild(cell);
        }
    }
}


function handlePlayerMove(type, r, c) {

    if (gameOver || busy) return;

    const completed = applyMove(type, r, c, "player");
    render();

    if (completed.length > 0) {
        player += completed.length;
        player_sc.textContent = player;
    }

    if (isGameOver()) {
        endGame();
        return;
    }

    if (completed.length > 0) {
        statusText.textContent = "You completed a box — go again!";
        return;
    }

    busy = true;
    statusText.textContent = "AI is thinking...";

    setTimeout(() => {
        fetch("ai-turn/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: state }),
        })
        .then(response => response.json())
        .then(data => {
            state = data.state;
            const aiCompleted = data.moves.reduce((sum, m) => sum + m.completed.length, 0);

            if (aiCompleted > 0) {
                ai += aiCompleted;
                ai_sc.textContent = ai;
            }

            render();
            busy = false;

            if (data.game_over) {
                endGame();
            } else {
                statusText.textContent = "Your turn — click a line to draw it";
            }
        });
    }, 300);
}


function endGame() {
    gameOver = true;

    if (player > ai) statusText.textContent = `You win! ${player} - ${ai}`;
    else if (ai > player) statusText.textContent = `AI wins! ${ai} - ${player}`;
    else statusText.textContent = `It's a tie! ${player} - ${ai}`;
}


restartBtn.addEventListener("click", () => {
    state = createState();
    gameOver = false;
    busy = false;
    player = 0;
    ai = 0;
    player_sc.textContent = 0;
    ai_sc.textContent = 0;
    statusText.textContent = "Your turn — click a line to draw it";
    render();
});


render();