console.log("PUZZLE8 JS LOADED");

document.addEventListener("DOMContentLoaded", () => {

    // ========================================================
    // ELEMENTS
    // ========================================================

    const form = document.getElementById("puzzle-form");

    if (!form) {
        console.error("Puzzle form not found.");
        return;
    }

    const boardElement =
        document.querySelector(".puzzle-board");

    const inputCells = Array.from(
        document.querySelectorAll(".input-cell")
    );

    const isInputMode =
        inputCells.length === 9;

    let gameSolved = false;
    let requestInProgress = false;


    // ========================================================
    // INPUT MODE
    // ========================================================

    if (isInputMode) {

        inputCells.forEach((cell, index) => {

            cell.addEventListener("input", () => {

                const value = cell.value;

                if (value === "") {
                    return;
                }

                const number = Number(value);

                // Only allow 0 - 8
                if (
                    Number.isNaN(number) ||
                    number < 0 ||
                    number > 8
                ) {
                    cell.value = "";
                    return;
                }

                // Keep only one digit
                cell.value =
                    String(number).charAt(0);

                // Move focus to next box
                if (
                    index < inputCells.length - 1
                ) {
                    inputCells[index + 1].focus();
                }

            });

        });

    }


    // ========================================================
    // FORM SUBMIT
    // ========================================================

    form.addEventListener(
        "submit",
        async (event) => {

            const button =
                event.submitter;

            if (!button) {
                return;
            }

            const action =
                button.value;


            // =================================================
            // SOLVE
            // =================================================

            if (action === "solve") {

                const valid =
                    validatePuzzle();

                if (!valid) {

                    event.preventDefault();

                    return;
                }

                /*
                 * Allow normal Django POST.
                 *
                 * Django will:
                 * 1. Read the puzzle
                 * 2. Run A*
                 * 3. Save solution in session
                 * 4. Render play mode
                 */

                return;
            }


            // =================================================
            // NEXT MOVE
            // =================================================

            if (action === "next") {

                event.preventDefault();

                if (
                    requestInProgress ||
                    gameSolved
                ) {
                    return;
                }

                await makeNextMove();

                return;
            }


            // =================================================
            // RESET
            // =================================================

            if (action === "reset") {

                /*
                 * IMPORTANT:
                 *
                 * Do NOT prevent the default form submit.
                 *
                 * Django will handle reset normally.
                 *
                 * This clears the session and renders
                 * the input screen again.
                 */

                return;
            }

        }
    );


    // ========================================================
    // KEYBOARD CONTROLS
    // ========================================================

    document.addEventListener(
        "keydown",
        async (event) => {

            // Don't trigger while typing
            if (
                event.target.tagName === "INPUT" ||
                event.target.tagName === "TEXTAREA" ||
                event.target.tagName === "SELECT"
            ) {
                return;
            }

            // Don't allow keyboard after solved
            if (gameSolved) {
                return;
            }

            const arrowKeys = [
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight"
            ];

            if (!arrowKeys.includes(event.key)) {
                return;
            }

            /*
             * If move panel does not exist,
             * we are not in play mode.
             */

            const movePanel =
                document.querySelector(".move-panel");

            if (!movePanel) {
                return;
            }

            if (requestInProgress) {
                return;
            }

            event.preventDefault();

            await makeNextMove();

        }
    );


    // ========================================================
    // VALIDATE PUZZLE
    // ========================================================

    function validatePuzzle() {

        if (inputCells.length !== 9) {
            return true;
        }


        // Get all values
        const values =
            inputCells.map(
                (cell) =>
                    cell.value.trim()
            );


        // Check empty boxes
        if (
            values.some(
                (value) =>
                    value === ""
            )
        ) {

            alert(
                "Please fill all 9 boxes."
            );

            return false;
        }


        // Convert to numbers
        const numbers =
            values.map(
                (value) =>
                    Number(value)
            );


        // Check duplicates
        const uniqueNumbers =
            new Set(numbers);

        if (uniqueNumbers.size !== 9) {

            alert(
                "Use every number from 0 to 8 exactly once."
            );

            return false;
        }


        // Sort numbers
        const sortedNumbers =
            [...numbers].sort(
                (a, b) => a - b
            );


        const expectedNumbers = [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8
        ];


        // Check 0-8 exactly once
        const valid =
            sortedNumbers.every(
                (number, index) =>
                    number ===
                    expectedNumbers[index]
            );


        if (!valid) {

            alert(
                "The puzzle must contain numbers from 0 to 8 exactly once."
            );

            return false;
        }


        return true;
    }


    // ========================================================
    // NEXT MOVE
    // ========================================================

    async function makeNextMove() {

        requestInProgress = true;

        try {

            const response =
                await fetch(
                    window.location.pathname,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded",

                            "X-Requested-With":
                                "XMLHttpRequest"
                        },

                        body:
                            "action=next" +
                            "&csrfmiddlewaretoken=" +
                            encodeURIComponent(
                                getCSRFToken()
                            )
                    }
                );


            // Check server response
            if (!response.ok) {

                throw new Error(
                    `Server returned ${response.status}`
                );
            }


            // Convert response to JSON
            const data =
                await response.json();


            // Django returned failure
            if (!data.success) {

                alert(
                    data.message ||
                    "Something went wrong."
                );

                return;
            }


            // =================================================
            // UPDATE BOARD
            // =================================================

            updateBoard(
                data.board
            );


            // =================================================
            // PUZZLE SOLVED
            // =================================================

            if (data.solved) {

                gameSolved = true;

                updateMoveText(
                    "SOLVED"
                );

                updatePageTitle(
                    "Puzzle solved"
                );

                updateControlsForSolved();

                alert(
                    "🎉 Puzzle solved!"
                );

                return;
            }


            // =================================================
            // UPDATE NEXT MOVE
            // =================================================

            updateMoveText(
                data.current_move
            );


        } catch (error) {

            console.error(
                "Next move error:",
                error
            );

            alert(
                "Unable to make the next move."
            );

        } finally {

            requestInProgress = false;

        }

    }


    // ========================================================
    // UPDATE BOARD
    // ========================================================

    function updateBoard(board) {

        if (!boardElement) {
            return;
        }


        // Remove old board
        boardElement.innerHTML = "";


        // Create new board
        for (let i = 0; i < 3; i++) {

            for (let j = 0; j < 3; j++) {

                const value =
                    board[i][j];


                const cell =
                    document.createElement(
                        "div"
                    );


                cell.className =
                    "puzzle-cell";


                // Empty cell
                if (value === 0) {

                    cell.classList.add(
                        "empty-cell"
                    );

                }

                // Number cell
                else {

                    cell.textContent =
                        value;
                }


                boardElement.appendChild(
                    cell
                );

            }

        }

    }


    // ========================================================
    // FORMAT MOVE WITH ARROW
    // ========================================================

    function formatMove(move) {

        const arrows = {
            UP: "↑",
            DOWN: "↓",
            LEFT: "←",
            RIGHT: "→"
        };


        if (!move) {
            return "—";
        }


        const arrow =
            arrows[move] || "";


        return `${arrow} ${move}`;

    }


    // ========================================================
    // UPDATE MOVE TEXT
    // ========================================================

    function updateMoveText(move) {

        const formattedMove =
            formatMove(move);


        // Header
        const stepIndicator =
            document.querySelector(
                ".step-indicator strong"
            );


        if (stepIndicator) {

            stepIndicator.textContent =
                formattedMove;

        }


        // Move panel
        const moveValue =
            document.querySelector(
                ".move-value"
            );


        if (moveValue) {

            moveValue.textContent =
                formattedMove;

        }

    }


    // ========================================================
    // UPDATE PAGE TITLE
    // ========================================================

    function updatePageTitle(title) {

        const heading =
            document.querySelector(
                ".card-top h2"
            );


        if (heading) {

            heading.textContent =
                title;

        }

    }


    // ========================================================
    // UPDATE CONTROLS AFTER SOLVED
    // ========================================================

    function updateControlsForSolved() {

        const controls =
            document.querySelector(
                ".puzzle-controls"
            );


        if (!controls) {
            return;
        }


        controls.innerHTML = `
            <button
                type="submit"
                name="action"
                value="reset"
                class="puzzle-button primary-button"
            >
                Try Another Puzzle
            </button>
        `;

    }


    // ========================================================
    // GET CSRF TOKEN
    // ========================================================

    function getCSRFToken() {

        const csrfInput =
            document.querySelector(
                'input[name="csrfmiddlewaretoken"]'
            );


        if (!csrfInput) {

            console.error(
                "CSRF token not found."
            );

            return "";

        }


        return csrfInput.value;

    }

});