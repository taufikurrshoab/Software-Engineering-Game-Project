document.addEventListener("DOMContentLoaded", () => {
    // =====================================================
    // ELEMENTS
    // =====================================================

    const nodesInput = document.getElementById("nodes");
    const edgesInput = document.getElementById("edges");
    const startInput = document.getElementById("start-node");

    const generateBtn = document.getElementById("generate-btn");
    const startBtn = document.getElementById("start-btn");
    const nextBtn = document.getElementById("next-btn");
    const resetBtn = document.getElementById("reset-btn");

    const graphContainer = document.getElementById("graph-container");

    const stackDisplay = document.getElementById("stack");
    const currentDisplay = document.getElementById("current-node");
    const visitedDisplay = document.getElementById("visited");

    const errorMessage = document.getElementById("error-message");
    const graphStatus = document.getElementById("graph-status");

    const nodeCount = document.getElementById("node-count");
    const edgeCount = document.getElementById("edge-count");

    const stepNumber = document.getElementById("step-number");

    const descriptionTitle = document.getElementById("description-title");
    const stepDescription = document.getElementById("step-description");
    const descriptionFacts = document.getElementById("description-facts");

    const progressBar = document.getElementById("progress-bar");
    const progressPercent = document.getElementById("progress-percent");
    const progressText = document.getElementById("progress-text");

    // Scroll target after Generate Graph: the visualization workspace.
    const visualizerSection = document.getElementById("dfs-workspace");

    // =====================================================
    // THEORY: CLICKABLE CONCEPT CARDS
    // =====================================================

    const conceptCards = document.querySelectorAll(".dfs-concept-card");
    const conceptDetail = document.getElementById("concept-detail");

    conceptCards.forEach(card => {
        card.addEventListener("click", () => {
            conceptCards.forEach(item => item.classList.remove("is-active"));

            card.classList.add("is-active");

            if (conceptDetail) {
                conceptDetail.textContent = card.dataset.detail || "";
            }
        });
    });

    // =====================================================
    // THEORY: MINI STACK DEMO (PUSH / POP)
    // =====================================================

    const stackPushBtn = document.getElementById("stack-push");
    const stackPopBtn = document.getElementById("stack-pop");
    const demoItemsEl = document.getElementById("stack-items");
    const demoMessage = document.getElementById("stack-message");

    const DEMO_MAX = 6;

    let demoItems = [];
    let demoCounter = 0;

    function renderDemoStack() {
        if (!demoItemsEl) return;

        demoItemsEl.replaceChildren();

        if (demoItems.length === 0) {
            const empty = document.createElement("span");

            empty.className = "empty-text";
            empty.textContent = "Stack is empty";

            demoItemsEl.appendChild(empty);
            return;
        }

        demoItems.forEach((label, index) => {
            const isTop = index === demoItems.length - 1;

            const chip = makeChip(
                label,
                isTop ? "chip stack-chip is-top" : "chip stack-chip"
            );

            if (isTop) {
                chip.appendChild(makeTag("TOP"));
            }

            demoItemsEl.appendChild(chip);
        });
    }

    function demoPush() {
        if (demoItems.length >= DEMO_MAX) {
            if (demoMessage) {
                demoMessage.textContent =
                    "The demo stack is full. Try Pop to remove the top item.";
            }
            return;
        }

        const label = String.fromCharCode(65 + (demoCounter % 26));

        demoCounter++;
        demoItems.push(label);

        if (demoMessage) {
            demoMessage.textContent = `${label} was pushed onto the TOP of the stack.`;
        }

        renderDemoStack();
    }

    function demoPop() {
        if (demoItems.length === 0) {
            if (demoMessage) {
                demoMessage.textContent = "Nothing to pop yet. Press Push first.";
            }
            return;
        }

        const removed = demoItems.pop();

        if (demoMessage) {
            demoMessage.textContent =
                `${removed} left from the TOP: it was the last one in, so it is the first one out.`;
        }

        renderDemoStack();
    }

    if (stackPushBtn) stackPushBtn.addEventListener("click", demoPush);
    if (stackPopBtn) stackPopBtn.addEventListener("click", demoPop);

    // =====================================================
    // PSEUDOCODE LINE EXPLANATION
    // =====================================================

    const codeLines = document.querySelectorAll(".dfs-code-line");
    const lineExplanation = document.getElementById("dfs-line-explanation");

    codeLines.forEach(line => {
        line.addEventListener("click", () => {
            codeLines.forEach(item => item.classList.remove("is-selected"));

            line.classList.add("is-selected");

            if (lineExplanation) {
                lineExplanation.textContent = line.dataset.explain || "";
            }
        });
    });

    // =====================================================
    // DFS DATA
    // =====================================================

    let nodes = [];
    let edges = [];
    let adjacency = {};

    let startNode = "";

    let stack = [];          // bottom ... top  (the current path)
    let visited = [];        // in the order nodes were discovered
    let currentNode = null;  // node on top of the stack
    let parent = {};         // discovered-from map (DFS tree edges)
    let activeEdge = null;   // edge used in the latest step

    let dfsStarted = false;
    let dfsFinished = false;
    let stepCount = 0;

    // =====================================================
    // DESCRIPTION HELPER
    // facts = [{ label, value, tone }]  (tone: current | stack | visited)
    // =====================================================

    function showDescription(title, message, facts = []) {
        if (descriptionTitle) {
            descriptionTitle.textContent = title;
        }

        if (stepDescription) {
            stepDescription.textContent = message;
        }

        if (descriptionFacts) {
            descriptionFacts.replaceChildren();

            facts.forEach(fact => {
                const row = document.createElement("div");
                row.className = `fact-row fact-${fact.tone || "stack"}`;

                const label = document.createElement("span");
                label.className = "fact-label";
                label.textContent = fact.label;

                const value = document.createElement("strong");
                value.className = "fact-value";
                value.textContent = fact.value;

                row.appendChild(label);
                row.appendChild(value);
                descriptionFacts.appendChild(row);
            });
        }
    }

    function formatStack() {
        return stack.length ? `[${stack.join(", ")}]  (top: ${stack[stack.length - 1]})` : "[ ] empty";
    }

    // =====================================================
    // STATUS HELPER
    // =====================================================

    function setStatus(message, type = "ready") {
        if (!graphStatus) return;

        graphStatus.textContent = message;

        const styles = {
            ready: {
                color: "#a9c9ff",
                background: "#1b3151",
                border: "#36527c"
            },
            active: {
                color: "#c8b5ff",
                background: "#382d61",
                border: "#7655b9"
            },
            complete: {
                color: "#6be2bd",
                background: "#104538",
                border: "#176e5b"
            }
        };

        const style = styles[type] || styles.ready;

        graphStatus.style.color = style.color;
        graphStatus.style.background = style.background;
        graphStatus.style.borderColor = style.border;
    }

    // =====================================================
    // GENERATE GRAPH
    // =====================================================

    function generateGraph() {
        clearError();

        const nodeText = nodesInput?.value.trim() || "";
        const edgeText = edgesInput?.value.trim() || "";
        const startText = (startInput?.value || "").trim().toUpperCase();

        if (!nodeText) {
            showError("Please enter at least one node.");
            return;
        }

        const newNodes = nodeText
            .split(/[\s,]+/)
            .map(node => node.trim().toUpperCase())
            .filter(Boolean);

        const uniqueNodes = [...new Set(newNodes)];

        if (uniqueNodes.length === 0) {
            showError("Please enter valid nodes.");
            return;
        }

        if (!startText) {
            showError("Please enter a starting node.");
            return;
        }

        if (!uniqueNodes.includes(startText)) {
            showError(`Starting node "${startText}" does not exist.`);
            return;
        }

        // Parse into temporary variables first, so invalid input
        // never leaves the visualizer half-updated.
        const newAdjacency = {};

        uniqueNodes.forEach(node => {
            newAdjacency[node] = [];
        });

        const newEdges = [];

        if (edgeText) {
            const lines = edgeText
                .split("\n")
                .map(line => line.trim())
                .filter(Boolean);

            for (const line of lines) {
                let parts;

                if (line.includes("-")) {
                    parts = line.split("-").map(x => x.trim().toUpperCase());
                } else {
                    parts = line.split(/\s+/).map(x => x.trim().toUpperCase());
                }

                if (parts.length !== 2 || !parts[0] || !parts[1]) {
                    showError(`Invalid edge "${line}". Use A-B format.`);
                    return;
                }

                const [from, to] = parts;

                if (!uniqueNodes.includes(from) || !uniqueNodes.includes(to)) {
                    showError(`Edge "${line}" contains an unknown node.`);
                    return;
                }

                if (from === to) {
                    continue;
                }

                const duplicate = newEdges.some(edge =>
                    (edge.from === from && edge.to === to) ||
                    (edge.from === to && edge.to === from)
                );

                if (duplicate) {
                    continue;
                }

                newEdges.push({ from, to });

                // Undirected graph
                newAdjacency[from].push(to);
                newAdjacency[to].push(from);
            }
        }

        // Input is valid: commit it.
        nodes = uniqueNodes;
        edges = newEdges;
        adjacency = newAdjacency;
        startNode = startText;

        // Keep neighbour order predictable (alphabetical).
        nodes.forEach(node => adjacency[node].sort());

        resetState();

        renderGraph();

        if (nodeCount) {
            nodeCount.textContent = `${nodes.length} Nodes`;
        }

        if (edgeCount) {
            edgeCount.textContent = `${edges.length} Edges`;
        }

        setStatus("Graph Ready", "ready");

        showDescription(
            "Graph generated",
            `${nodes.length} nodes and ${edges.length} edges. DFS will start from ${startNode}. Press Start DFS to begin.`,
            [{ label: "Start node", value: startNode, tone: "visited" }]
        );

        updateInformation();
        updateGraphVisuals();
        updateProgress();
        updateStepCounter();

        if (startBtn) startBtn.disabled = false;
        if (nextBtn) nextBtn.disabled = true;

        // Scroll only after Generate Graph.
        // Start DFS, Next Step and Reset never change the page scroll.
        if (visualizerSection) {
            requestAnimationFrame(() => {
                visualizerSection.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            });
        }
    }

    // =====================================================
    // RESET DFS DATA
    // =====================================================

    function resetState() {
        stack = [];
        visited = [];
        currentNode = null;
        parent = {};
        activeEdge = null;

        dfsStarted = false;
        dfsFinished = false;
        stepCount = 0;
    }

    // =====================================================
    // RENDER GRAPH
    // =====================================================

    function renderGraph() {
        if (!graphContainer) return;

        graphContainer.innerHTML = "";

        if (nodes.length === 0) {
            return;
        }

        const width = graphContainer.clientWidth || 700;
        const height = graphContainer.clientHeight || 400;

        const centerX = width / 2;
        const centerY = height / 2;

        const nodeRadius = nodes.length > 12 ? 21 : 26;

        // Keep every node fully inside the container.
        const radius = Math.max(
            40,
            Math.min(width, height) / 2 - nodeRadius - 22
        );

        const positions = {};

        nodes.forEach((node, index) => {
            const angle =
                (2 * Math.PI * index / nodes.length) - Math.PI / 2;

            // A single node is centered.
            const r = nodes.length === 1 ? 0 : radius;

            positions[node] = {
                x: centerX + r * Math.cos(angle),
                y: centerY + r * Math.sin(angle)
            };
        });

        const svgNS = "http://www.w3.org/2000/svg";

        const svg = document.createElementNS(svgNS, "svg");

        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "DFS graph visualization");

        // Draw edges first, so they stay behind the nodes.
        edges.forEach(edge => {
            const line = document.createElementNS(svgNS, "line");

            line.setAttribute("x1", positions[edge.from].x);
            line.setAttribute("y1", positions[edge.from].y);
            line.setAttribute("x2", positions[edge.to].x);
            line.setAttribute("y2", positions[edge.to].y);

            line.classList.add("graph-edge");

            line.dataset.from = edge.from;
            line.dataset.to = edge.to;

            svg.appendChild(line);
        });

        // Draw circular nodes.
        nodes.forEach(node => {
            const group = document.createElementNS(svgNS, "g");

            group.classList.add("graph-node-group");
            group.dataset.node = node;

            const circle = document.createElementNS(svgNS, "circle");

            circle.setAttribute("cx", positions[node].x);
            circle.setAttribute("cy", positions[node].y);
            circle.setAttribute("r", nodeRadius);

            circle.classList.add("graph-node");
            circle.dataset.node = node;

            const text = document.createElementNS(svgNS, "text");

            text.setAttribute("x", positions[node].x);
            text.setAttribute("y", positions[node].y);
            text.classList.add("graph-node-text");
            text.textContent = node;

            group.appendChild(circle);
            group.appendChild(text);

            // Small label that keeps the start node easy to identify.
            if (node === startNode) {
                const label = document.createElementNS(svgNS, "text");

                label.setAttribute("x", positions[node].x);
                label.setAttribute("y", positions[node].y + nodeRadius + 13);
                label.classList.add("graph-start-label");
                label.textContent = "START";

                group.appendChild(label);
            }

            svg.appendChild(group);
        });

        graphContainer.appendChild(svg);

        updateGraphVisuals();
    }

    // =====================================================
    // START DFS
    // =====================================================

    function startDFS() {
        clearError();

        if (nodes.length === 0) {
            showError("Generate a graph first.");
            return;
        }

        resetState();

        // Initialize Stack and Visited.
        stack = [startNode];
        visited = [startNode];
        currentNode = startNode;

        dfsStarted = true;

        updateInformation();
        updateGraphVisuals();
        updateProgress();
        updateStepCounter();

        setStatus(`DFS Started from ${startNode}`, "active");

        showDescription(
            "Step 0 · Initialize",
            `${startNode} is marked visited and pushed onto the stack. Next Step will explore from the top of the stack.`,
            [
                { label: "Stack", value: formatStack(), tone: "stack" },
                { label: "Visited", value: `[${visited.join(", ")}]`, tone: "visited" }
            ]
        );

        if (startBtn) startBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = false;
    }

    // =====================================================
    // NEXT DFS STEP
    // One step = either "go deeper" (push) or "backtrack" (pop)
    // =====================================================

    function nextStep() {
        clearError();

        if (!dfsStarted) {
            showError("Click Start DFS first.");
            return;
        }

        if (dfsFinished) {
            return;
        }

        if (stack.length === 0) {
            finishDFS();
            return;
        }

        stepCount++;

        // Look at the top of the stack (without removing it).
        const top = stack[stack.length - 1];

        const unvisitedNeighbors =
            (adjacency[top] || []).filter(n => !visited.includes(n));

        let title;
        let message;
        let facts;

        if (unvisitedNeighbors.length > 0) {
            // -------- GO DEEPER --------
            const next = unvisitedNeighbors[0];

            visited.push(next);
            stack.push(next);
            parent[next] = top;

            currentNode = next;
            activeEdge = { from: top, to: next };

            setStatus(`Exploring ${next}`, "active");

            title = `Step ${stepCount} · Go deeper`;

            message =
                `${top} still has unvisited neighbours (${unvisitedNeighbors.join(", ")}). ` +
                `DFS takes the first one, ${next}, marks it visited and pushes it onto the stack.`;

            facts = [
                { label: "Current", value: next, tone: "current" },
                { label: "Came from", value: top, tone: "visited" },
                { label: "Stack now", value: formatStack(), tone: "stack" }
            ];

        } else {
            // -------- BACKTRACK --------
            stack.pop();

            const newTop = stack.length ? stack[stack.length - 1] : null;

            currentNode = newTop;
            activeEdge = newTop ? { from: top, to: newTop } : null;

            const done = stack.length === 0;

            if (done) {
                dfsFinished = true;

                if (nextBtn) nextBtn.disabled = true;

                setStatus("DFS Completed", "complete");

                title = `Step ${stepCount} · Complete`;

                message =
                    `${top} has no unvisited neighbours, so it is popped. ` +
                    `The stack is empty: DFS is complete.`;

                if (visited.length < nodes.length) {
                    message +=
                        ` Nodes not connected to ${startNode} stay unvisited.`;
                }

                facts = [
                    { label: "Popped", value: top, tone: "visited" },
                    { label: "Stack now", value: formatStack(), tone: "stack" },
                    { label: "Visited", value: `[${visited.join(", ")}]`, tone: "visited" }
                ];

            } else {
                setStatus(`Backtracking to ${newTop}`, "active");

                title = `Step ${stepCount} · Backtrack`;

                message =
                    `${top} has no unvisited neighbours: a dead end. ` +
                    `It is popped from the stack and DFS backtracks to ${newTop}.`;

                facts = [
                    { label: "Popped", value: top, tone: "visited" },
                    { label: "Back at", value: newTop, tone: "current" },
                    { label: "Stack now", value: formatStack(), tone: "stack" }
                ];
            }
        }

        updateInformation();
        updateGraphVisuals();
        updateProgress();
        updateStepCounter();

        showDescription(title, message, facts);
    }

    // =====================================================
    // FINISH DFS (safety net)
    // =====================================================

    function finishDFS() {
        dfsFinished = true;
        currentNode = null;
        activeEdge = null;

        updateInformation();
        updateGraphVisuals();
        updateProgress();

        setStatus("DFS Completed", "complete");

        showDescription(
            "DFS complete",
            `The stack is empty. DFS has explored every node reachable from ${startNode}.`,
            [{ label: "Visited", value: `[${visited.join(", ")}]`, tone: "visited" }]
        );

        if (nextBtn) nextBtn.disabled = true;
    }

    // =====================================================
    // RESET BUTTON
    // =====================================================

    function resetDFS() {
        if (nodes.length === 0) {
            showError("Generate a graph first.");
            return;
        }

        resetState();

        updateInformation();
        updateGraphVisuals();
        updateProgress();
        updateStepCounter();

        setStatus("Ready", "ready");

        showDescription(
            "DFS reset",
            `Traversal cleared. Press Start DFS to begin again from ${startNode}.`,
            [{ label: "Start node", value: startNode, tone: "visited" }]
        );

        if (startBtn) startBtn.disabled = false;
        if (nextBtn) nextBtn.disabled = true;

        clearError();
    }

    // =====================================================
    // CHIP HELPERS
    // =====================================================

    function makeChip(label, className) {
        const chip = document.createElement("span");

        chip.className = className;
        chip.textContent = label;

        return chip;
    }

    function makeTag(text) {
        const tag = document.createElement("small");

        tag.className = "chip-tag";
        tag.textContent = text;

        return tag;
    }

    function showEmpty(container, message) {
        if (!container) return;

        const span = document.createElement("span");

        span.className = "empty-text";
        span.textContent = message;

        container.appendChild(span);
    }

    // =====================================================
    // UPDATE STACK / CURRENT / VISITED
    // =====================================================

    function updateInformation() {
        // ---------------- STACK (bottom -> top) ----------------

        if (stackDisplay) {
            stackDisplay.replaceChildren();

            if (stack.length === 0) {
                showEmpty(
                    stackDisplay,
                    dfsFinished
                        ? "Stack is empty"
                        : dfsStarted
                            ? "Stack is empty"
                            : "Press Start DFS"
                );
            } else {
                stack.forEach((node, index) => {
                    const isTop = index === stack.length - 1;

                    const chip = makeChip(
                        node,
                        isTop ? "chip stack-chip is-top" : "chip stack-chip"
                    );

                    if (isTop) {
                        chip.appendChild(makeTag("TOP"));
                    }

                    stackDisplay.appendChild(chip);
                });
            }
        }

        // ---------------- CURRENT NODE ----------------

        if (currentDisplay) {
            currentDisplay.replaceChildren();

            if (currentNode) {
                currentDisplay.appendChild(
                    makeChip(currentNode, "chip current-chip")
                );
            } else {
                showEmpty(
                    currentDisplay,
                    dfsFinished ? "Done" : "No node yet"
                );
            }
        }

        // ---------------- VISITED ----------------

        if (visitedDisplay) {
            visitedDisplay.replaceChildren();

            if (visited.length === 0) {
                showEmpty(visitedDisplay, "None yet");
            } else {
                visited.forEach((node, index) => {
                    const chip = makeChip(node, "chip visited-chip");

                    const order = document.createElement("sup");
                    order.className = "chip-order";
                    order.textContent = index + 1;

                    chip.appendChild(order);
                    visitedDisplay.appendChild(chip);
                });
            }
        }
    }

    // =====================================================
    // UPDATE GRAPH NODE + EDGE COLORS
    // =====================================================

    function updateGraphVisuals() {
        const graphNodes = document.querySelectorAll(".graph-node");

        graphNodes.forEach(circle => {
            const node = circle.dataset.node;

            circle.classList.remove(
                "node-start",
                "node-current",
                "node-visited",
                "node-stacked"
            );

            // Start node (distinct amber ring, set in CSS)
            if (node === startNode) {
                circle.classList.add("node-start");
            }

            // Visited nodes (includes finished / backtracked nodes)
            if (visited.includes(node)) {
                circle.classList.add("node-visited");
            }

            // Nodes on the stack (the current path)
            if (stack.includes(node)) {
                circle.classList.add("node-stacked");
            }

            // Current node gets the highest priority.
            if (node === currentNode) {
                circle.classList.add("node-current");
            }
        });

        const graphEdges = document.querySelectorAll(".graph-edge");

        graphEdges.forEach(edge => {
            const a = edge.dataset.from;
            const b = edge.dataset.to;

            edge.classList.remove("edge-active", "edge-tree");

            // Edges DFS has already walked along.
            if (parent[b] === a || parent[a] === b) {
                edge.classList.add("edge-tree");
            }

            // Edge used by the latest step (deeper or backtrack).
            if (
                activeEdge &&
                (
                    (activeEdge.from === a && activeEdge.to === b) ||
                    (activeEdge.from === b && activeEdge.to === a)
                )
            ) {
                edge.classList.add("edge-active");
            }
        });
    }

    // =====================================================
    // UPDATE PROGRESS
    // =====================================================

    function updateProgress() {
        const total = nodes.length;
        const discovered = visited.length;

        const percent = total > 0
            ? Math.round((discovered / total) * 100)
            : 0;

        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }

        if (progressPercent) {
            progressPercent.textContent = `${percent}%`;
        }

        if (progressText) {
            progressText.textContent = `${discovered}/${total} discovered`;
        }
    }

    // =====================================================
    // UPDATE STEP COUNTER
    // =====================================================

    function updateStepCounter() {
        if (stepNumber) {
            stepNumber.textContent = `STEP ${stepCount}`;
        }
    }

    // =====================================================
    // ERROR HANDLING
    // =====================================================

    function showError(message) {
        if (errorMessage) {
            errorMessage.textContent = message;
        }
    }

    function clearError() {
        if (errorMessage) {
            errorMessage.textContent = "";
        }
    }

    // =====================================================
    // BUTTON EVENTS
    // =====================================================

    if (generateBtn) {
        generateBtn.addEventListener("click", generateGraph);
    }

    if (startBtn) {
        startBtn.addEventListener("click", startDFS);
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", nextStep);
    }

    if (resetBtn) {
        resetBtn.addEventListener("click", resetDFS);
    }

    // Re-draw the graph if the window size changes (no scrolling involved).
    let resizeTimer = null;

    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);

        resizeTimer = setTimeout(() => {
            if (nodes.length > 0) {
                renderGraph();
            }
        }, 150);
    });

    // =====================================================
    // INITIAL STATE
    // =====================================================

    // Generate Graph is user-triggered, so the page never
    // scrolls on its own when it loads.
    renderDemoStack();
    updateInformation();
    updateProgress();
    updateStepCounter();

    if (startBtn) startBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    setStatus("Ready", "ready");

});