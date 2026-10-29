
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


    // =====================================================
    // DFS DATA
    // =====================================================

    let nodes = [];
    let edges = [];
    let adjacency = {};
    let positions = {};

    let startNode = "";

    let stack = [];
    let visited = [];
    let currentNode = null;
    let previousNode = null;

    let dfsStarted = false;
    let dfsFinished = false;


    // =====================================================
    // GRAPH GENERATION
    // =====================================================

    function generateGraph() {

        clearError();

        const nodeText = nodesInput.value.trim();
        const edgeText = edgesInput.value.trim();
        const startText = startInput.value.trim().toUpperCase();

        // Validate nodes

        if (!nodeText) {
            showError("Please enter nodes.");
            return;
        }

        const parsedNodes = nodeText
            .split(/[\s,]+/)
            .map(node => node.trim().toUpperCase())
            .filter(Boolean);

        if (parsedNodes.some(node => node.length !== 1)) {
            showError("Each node must be a single character.");
            return;
        }

        if (new Set(parsedNodes).size !== parsedNodes.length) {
            showError("Duplicate nodes are not allowed.");
            return;
        }

        nodes = parsedNodes;

        // Validate start node

        startNode = startText;

        if (!startNode) {
            showError("Please enter a start node.");
            return;
        }

        if (!nodes.includes(startNode)) {
            showError(
                `Start node "${startNode}" does not exist in the graph.`
            );
            return;
        }

        // Create adjacency list

        adjacency = {};

        nodes.forEach(node => {
            adjacency[node] = [];
        });

        edges = [];

        // Parse edges

        if (edgeText) {

            const edgeLines = edgeText
                .split(/[\n,]+/)
                .map(line => line.trim())
                .filter(Boolean);

            for (const line of edgeLines) {

                let parts;

                if (line.includes("-")) {
                    parts = line
                        .split("-")
                        .map(value => value.trim().toUpperCase());
                } else {
                    parts = line
                        .split(/\s+/)
                        .map(value => value.trim().toUpperCase());
                }

                if (parts.length !== 2 || !parts[0] || !parts[1]) {
                    showError(
                        `Invalid edge "${line}". Use A-B format.`
                    );
                    return;
                }

                const [from, to] = parts;

                if (!nodes.includes(from) || !nodes.includes(to)) {
                    showError(
                        `Edge "${line}" contains a node that does not exist.`
                    );
                    return;
                }

                if (from === to) {
                    showError(
                        `Self-loop "${line}" is not supported.`
                    );
                    return;
                }

                // Avoid duplicate undirected edges

                const exists = edges.some(edge =>
                    (edge.from === from && edge.to === to) ||
                    (edge.from === to && edge.to === from)
                );

                if (exists) {
                    continue;
                }

                edges.push({ from, to });

                // Undirected graph

                adjacency[from].push(to);
                adjacency[to].push(from);
            }
        }

        // Sort neighbors for predictable traversal

        nodes.forEach(node => {
            adjacency[node].sort();
        });

        // Reset DFS state

        stack = [];
        visited = [];
        currentNode = null;
        previousNode = null;

        dfsStarted = false;
        dfsFinished = false;

        startBtn.disabled = false;
        nextBtn.disabled = true;

        updateInformation();
        renderGraph();

        setStatus("Graph Ready", "ready");
    }


    // =====================================================
    // RENDER GRAPH
    // =====================================================

    function renderGraph() {

        graphContainer.innerHTML = "";

        if (nodes.length === 0) {
            return;
        }

        const width = Math.max(graphContainer.clientWidth, 350);
        const height = Math.max(graphContainer.clientHeight, 350);

        const centerX = width / 2;
        const centerY = height / 2;

        const radius = Math.max(
            0,
            Math.min(width, height) * 0.32
        );

        positions = {};

        // Calculate node positions

        nodes.forEach((node, index) => {

            const angle =
                (2 * Math.PI * index / nodes.length) -
                Math.PI / 2;

            positions[node] = {
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle)
            };
        });

        const svgNS = "http://www.w3.org/2000/svg";

        const svg = document.createElementNS(svgNS, "svg");

        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "DFS graph visualization");

        // Draw edges first

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

        // Draw nodes

        nodes.forEach(node => {

            const group = document.createElementNS(svgNS, "g");

            group.classList.add("graph-node-group");
            group.dataset.node = node;

            const circle = document.createElementNS(
                svgNS,
                "circle"
            );

            circle.setAttribute("cx", positions[node].x);
            circle.setAttribute("cy", positions[node].y);
            circle.setAttribute("r", "30");

            circle.classList.add("graph-node");
            circle.dataset.node = node;

            const label = document.createElementNS(
                svgNS,
                "text"
            );

            label.setAttribute("x", positions[node].x);
            label.setAttribute("y", positions[node].y);
            label.textContent = node;

            label.classList.add("graph-node-text");

            group.appendChild(circle);
            group.appendChild(label);

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
            showError("Generate the graph first.");
            return;
        }

        // Initialize the stack with the start node

        stack = [startNode];
        visited = [];

        currentNode = null;
        previousNode = null;

        dfsStarted = true;
        dfsFinished = false;

        startBtn.disabled = true;
        nextBtn.disabled = false;

        updateInformation();
        updateGraphVisuals();

        setStatus(`DFS Started from ${startNode}`, "running");

        startBtn.classList.add("button-active");

        setTimeout(() => {
            startBtn.classList.remove("button-active");
        }, 300);
    }


    // =====================================================
    // NEXT DFS STEP
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

        // Find the next unvisited node from the top of the stack

        let nextNode = null;

        while (stack.length > 0) {

            const candidate = stack.pop();

            if (!visited.includes(candidate)) {
                nextNode = candidate;
                break;
            }
        }

        // No nodes remain

        if (nextNode === null) {

            dfsFinished = true;
            currentNode = null;
            previousNode = null;

            nextBtn.disabled = true;
            startBtn.disabled = false;

            updateInformation();
            updateGraphVisuals();

            setStatus("DFS Completed", "ready");

            return;
        }

        previousNode = currentNode;
        currentNode = nextNode;

        // Mark current node as visited

        visited.push(currentNode);

        // Push neighbors in reverse order.
        // Stack is LIFO, so the alphabetically first
        // neighbor will be explored first.

        const neighbors = [...adjacency[currentNode]].sort().reverse();

        neighbors.forEach(neighbor => {

            if (
                !visited.includes(neighbor) &&
                !stack.includes(neighbor)
            ) {
                stack.push(neighbor);
            }
        });

        // Check whether any unvisited node remains in the stack

        const hasUnvisited = stack.some(
            node => !visited.includes(node)
        );

        if (!hasUnvisited) {
            dfsFinished = true;
            nextBtn.disabled = true;
            startBtn.disabled = false;
        }

        updateInformation();
        updateGraphVisuals();

        if (dfsFinished) {
            setStatus(
                `DFS Completed: ${visited.join(" → ")}`,
                "ready"
            );
        } else {
            setStatus(`Visiting ${currentNode}`, "running");
        }

        // Current node animation

        const currentElement = document.querySelector(
            `.graph-node[data-node="${currentNode}"]`
        );

        if (currentElement) {

            currentElement.classList.add("node-pulse");

            setTimeout(() => {
                currentElement.classList.remove("node-pulse");
            }, 700);
        }
    }


    // =====================================================
    // RESET DFS
    // =====================================================

    function resetDFS() {

        stack = [];
        visited = [];

        currentNode = null;
        previousNode = null;

        dfsStarted = false;
        dfsFinished = false;

        startBtn.disabled = false;
        nextBtn.disabled = true;

        updateInformation();
        updateGraphVisuals();

        setStatus("Ready", "ready");
        clearError();
    }


    // =====================================================
    // UPDATE INFORMATION
    // =====================================================

    function updateInformation() {

        stackDisplay.textContent =
            `[${stack.join(", ")}]`;

        currentDisplay.textContent =
            currentNode || "-";

        visitedDisplay.textContent =
            `[${visited.join(", ")}]`;
    }


    // =====================================================
    // UPDATE GRAPH VISUALS
    // =====================================================

    function updateGraphVisuals() {

        const graphNodes = graphContainer.querySelectorAll(
            ".graph-node"
        );

        graphNodes.forEach(circle => {

            const node = circle.dataset.node;

            circle.classList.remove(
                "node-start",
                "node-current",
                "node-visited",
                "node-queued"
            );

            if (node === startNode) {
                circle.classList.add("node-start");
            }

            if (stack.includes(node)) {
                circle.classList.add("node-queued");
            }

            if (visited.includes(node)) {
                circle.classList.add("node-visited");
            }

            if (node === currentNode) {
                circle.classList.add("node-current");
            }
        });

        // Highlight edges connected to the current node

        const graphEdges = graphContainer.querySelectorAll(
            ".graph-edge"
        );

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
    // STATUS
    // =====================================================

    function setStatus(message, type) {

        graphStatus.textContent = message;

        if (type === "running") {
            graphStatus.style.color = "#60a5fa";
            graphStatus.style.borderColor =
                "rgba(96, 165, 250, 0.25)";
            graphStatus.style.background =
                "rgba(37, 99, 235, 0.12)";
        } else {
            graphStatus.style.color = "#4ade80";
            graphStatus.style.borderColor =
                "rgba(34, 197, 94, 0.25)";
            graphStatus.style.background =
                "rgba(34, 197, 94, 0.1)";
        }
    }


    // =====================================================
    // ERROR HANDLING
    // =====================================================

    function showError(message) {
        errorMessage.textContent = message;
    }

    function clearError() {
        errorMessage.textContent = "";
    }


    // =====================================================
    // EVENT LISTENERS
    // =====================================================

    generateBtn.addEventListener("click", generateGraph);
    startBtn.addEventListener("click", startDFS);
    nextBtn.addEventListener("click", nextStep);
    resetBtn.addEventListener("click", resetDFS);


    // =====================================================
    // INITIAL STATE
    // =====================================================

    nextBtn.disabled = true;

    generateGraph();

});
