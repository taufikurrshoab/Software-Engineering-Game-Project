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

    const queueDisplay = document.getElementById("queue");
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
    const visualizerSection = document.getElementById("bfs-workspace");

    // =====================================================
    // THEORY: CLICKABLE CONCEPT CARDS
    // =====================================================

    const conceptCards = document.querySelectorAll(".bfs-concept-card");
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
    // THEORY: MINI FIFO DEMO
    // =====================================================

    const fifoEnqueueBtn = document.getElementById("fifo-enqueue");
    const fifoDequeueBtn = document.getElementById("fifo-dequeue");
    const fifoItemsEl = document.getElementById("fifo-items");
    const fifoMessage = document.getElementById("fifo-message");

    const FIFO_MAX = 6;

    let fifoItems = [];
    let fifoCounter = 0;

    function renderFifo() {
        if (!fifoItemsEl) return;

        fifoItemsEl.replaceChildren();

        if (fifoItems.length === 0) {
            const empty = document.createElement("span");

            empty.className = "empty-text";
            empty.textContent = "Queue is empty";

            fifoItemsEl.appendChild(empty);
            return;
        }

        fifoItems.forEach((label, index) => {
            const chip = makeChip(label, "chip queue-chip");

            if (index === 0) {
                chip.classList.add("is-front");
                chip.appendChild(makeTag("FRONT"));
            }

            fifoItemsEl.appendChild(chip);
        });
    }

    function fifoEnqueue() {
        if (fifoItems.length >= FIFO_MAX) {
            if (fifoMessage) {
                fifoMessage.textContent =
                    "The demo queue is full. Try Dequeue to remove the front item.";
            }
            return;
        }

        const label = String.fromCharCode(65 + (fifoCounter % 26));

        fifoCounter++;
        fifoItems.push(label);

        if (fifoMessage) {
            fifoMessage.textContent =
                `${label} joined the BACK of the queue.`;
        }

        renderFifo();
    }

    function fifoDequeue() {
        if (fifoItems.length === 0) {
            if (fifoMessage) {
                fifoMessage.textContent =
                    "Nothing to remove yet. Press Enqueue first.";
            }
            return;
        }

        const removed = fifoItems.shift();

        if (fifoMessage) {
            fifoMessage.textContent =
                `${removed} left from the FRONT: it was the first one in, so it is the first one out.`;
        }

        renderFifo();
    }

    if (fifoEnqueueBtn) fifoEnqueueBtn.addEventListener("click", fifoEnqueue);
    if (fifoDequeueBtn) fifoDequeueBtn.addEventListener("click", fifoDequeue);

    // =====================================================
    // PSEUDOCODE LINE EXPLANATION
    // =====================================================

    const codeLines = document.querySelectorAll(".bfs-code-line");
    const lineExplanation = document.getElementById("bfs-line-explanation");

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
    // BFS DATA
    // =====================================================

    let nodes = [];
    let edges = [];
    let adjacency = {};

    let startNode = "";

    let queue = [];
    let visited = [];
    let currentNode = null;

    let bfsStarted = false;
    let bfsFinished = false;
    let stepCount = 0;

    // =====================================================
    // DESCRIPTION HELPER
    // facts = [{ label, value, tone }]  (tone: current | queue | visited)
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
                row.className = `fact-row fact-${fact.tone || "queue"}`;

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

    function formatQueue() {
        return `[${queue.join(", ")}]`;
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

        // Parse edges into temporary variables first, so invalid input
        // never leaves the visualizer in a half-updated state.
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

        // Keep neighbour order predictable.
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
            `${nodes.length} nodes and ${edges.length} edges. BFS will start from ${startNode}. Press Start BFS to begin.`,
            [{ label: "Start node", value: startNode, tone: "visited" }]
        );

        updateInformation();
        updateGraphVisuals();
        updateProgress();
        updateStepCounter();

        if (startBtn) startBtn.disabled = false;
        if (nextBtn) nextBtn.disabled = true;

        // Scroll only after Generate Graph.
        // Start BFS, Next Step and Reset never change the page scroll.
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
    // RESET BFS DATA
    // =====================================================

    function resetState() {
        queue = [];
        visited = [];
        currentNode = null;

        bfsStarted = false;
        bfsFinished = false;
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
        svg.setAttribute("aria-label", "BFS graph visualization");

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
    // START BFS
    // =====================================================

    function startBFS() {
        clearError();

        if (nodes.length === 0) {
            showError("Generate a graph first.");
            return;
        }

        resetState();

        // Initialize Queue and Visited.
        queue = [startNode];
        visited = [startNode];

        bfsStarted = true;

        updateInformation();
        updateGraphVisuals();
        updateProgress();
        updateStepCounter();

        setStatus(`BFS Started from ${startNode}`, "active");

        showDescription(
            "Step 0 · Initialize",
            `${startNode} is added to the queue and marked visited. Next Step will take it from the front.`,
            [
                { label: "Queue", value: formatQueue(), tone: "queue" },
                { label: "Visited", value: `[${visited.join(", ")}]`, tone: "visited" }
            ]
        );

        if (startBtn) startBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = false;
    }

    // =====================================================
    // NEXT BFS STEP
    // =====================================================

    function nextStep() {
        clearError();

        if (!bfsStarted) {
            showError("Click Start BFS first.");
            return;
        }

        if (bfsFinished) {
            return;
        }

        if (queue.length === 0) {
            finishBFS();
            return;
        }

        // Remove the first node from Queue.
        currentNode = queue.shift();

        stepCount++;

        // Find unvisited neighbours.
        const neighbors = adjacency[currentNode] || [];
        const newlyDiscovered = [];

        neighbors.forEach(neighbor => {
            if (!visited.includes(neighbor)) {
                // Mark visited immediately to avoid duplicates.
                visited.push(neighbor);

                // Add to the back of Queue.
                queue.push(neighbor);

                newlyDiscovered.push(neighbor);
            }
        });

        updateInformation();
        updateGraphVisuals();
        updateProgress();
        updateStepCounter();

        const done = queue.length === 0;

        if (done) {
            bfsFinished = true;

            if (nextBtn) nextBtn.disabled = true;

            setStatus("BFS Completed", "complete");
        } else {
            setStatus(`Processing ${currentNode}`, "active");
        }

        // Short, beginner-friendly explanation of exactly this step.
        let message;

        if (newlyDiscovered.length > 0) {
            message =
                `${currentNode} left the front of the queue. ` +
                `Its new neighbours (${newlyDiscovered.join(", ")}) were marked visited and added to the back.`;
        } else {
            message =
                `${currentNode} left the front of the queue. ` +
                `All its neighbours were already visited, so nothing new was added.`;
        }

        if (done) {
            message += " The queue is empty, so BFS is complete.";
        }

        showDescription(
            done
                ? `Step ${stepCount} · Complete`
                : `Step ${stepCount} · Visit ${currentNode}`,
            message,
            [
                { label: "Current", value: currentNode, tone: "current" },
                {
                    label: "Discovered",
                    value: newlyDiscovered.length ? newlyDiscovered.join(", ") : "none",
                    tone: "visited"
                },
                { label: "Queue now", value: formatQueue(), tone: "queue" }
            ]
        );
    }

    // =====================================================
    // FINISH BFS
    // =====================================================

    function finishBFS() {
        bfsFinished = true;
        currentNode = null;

        updateInformation();
        updateGraphVisuals();
        updateProgress();

        setStatus("BFS Completed", "complete");

        showDescription(
            "BFS complete",
            `The queue is empty. BFS has explored every node reachable from ${startNode}.`,
            [{ label: "Visited", value: `[${visited.join(", ")}]`, tone: "visited" }]
        );

        if (nextBtn) nextBtn.disabled = true;
    }

    // =====================================================
    // RESET BUTTON
    // =====================================================

    function resetBFS() {
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
            "BFS reset",
            `Traversal cleared. Press Start BFS to begin again from ${startNode}.`,
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
    // UPDATE QUEUE / CURRENT / VISITED
    // =====================================================

    function updateInformation() {
        // ---------------- QUEUE ----------------

        if (queueDisplay) {
            queueDisplay.replaceChildren();

            if (queue.length === 0) {
                showEmpty(
                    queueDisplay,
                    bfsStarted ? "Queue is empty" : "Press Start BFS"
                );
            } else {
                queue.forEach((node, index) => {
                    const chip = makeChip(
                        node,
                        index === 0
                            ? "chip queue-chip is-front"
                            : "chip queue-chip"
                    );

                    if (index === 0) {
                        chip.appendChild(makeTag("FRONT"));
                    }

                    queueDisplay.appendChild(chip);
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
                showEmpty(currentDisplay, "No node yet");
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
    // UPDATE GRAPH NODE COLORS
    // =====================================================

    function updateGraphVisuals() {
        const graphNodes = document.querySelectorAll(".graph-node");

        graphNodes.forEach(circle => {
            const node = circle.dataset.node;

            circle.classList.remove(
                "node-start",
                "node-current",
                "node-visited",
                "node-queued"
            );

            // Start node (distinct amber ring, set in CSS)
            if (node === startNode) {
                circle.classList.add("node-start");
            }

            // Visited nodes
            if (visited.includes(node)) {
                circle.classList.add("node-visited");
            }

            // Queue nodes
            if (queue.includes(node)) {
                circle.classList.add("node-queued");
            }

            // Current node gets the highest priority.
            if (node === currentNode) {
                circle.classList.add("node-current");
            }
        });

        // Highlight edges connected to Current Node.
        const graphEdges = document.querySelectorAll(".graph-edge");

        graphEdges.forEach(edge => {
            edge.classList.remove("edge-active");

            if (
                currentNode &&
                (
                    edge.dataset.from === currentNode ||
                    edge.dataset.to === currentNode
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
        startBtn.addEventListener("click", startBFS);
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", nextStep);
    }

    if (resetBtn) {
        resetBtn.addEventListener("click", resetBFS);
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
    renderFifo();
    updateInformation();
    updateProgress();
    updateStepCounter();

    if (startBtn) startBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    setStatus("Ready", "ready");

});