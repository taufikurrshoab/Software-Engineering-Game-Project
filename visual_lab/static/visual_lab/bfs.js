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


    // =====================================================
    // GRAPH GENERATION
    // =====================================================

    function generateGraph() {

        clearError();

        const nodeText = nodesInput.value.trim();
        const edgeText = edgesInput.value.trim();
        const startText = startInput.value.trim().toUpperCase();


        // -----------------------------
        // Validate nodes
        // -----------------------------

        if (!nodeText) {
            showError("Please enter nodes.");
            return;
        }


        nodes = nodeText
            .split(/[\s,]+/)
            .map(node => node.trim().toUpperCase())
            .filter(node => node !== "");


        // Remove duplicate nodes

        nodes = [...new Set(nodes)];


        if (nodes.length === 0) {
            showError("Please enter at least one node.");
            return;
        }


        // -----------------------------
        // Start node
        // -----------------------------

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


        // -----------------------------
        // Create adjacency list
        // -----------------------------

        adjacency = {};

        nodes.forEach(node => {
            adjacency[node] = [];
        });


        edges = [];


        // -----------------------------
        // Parse edges
        // -----------------------------

        if (edgeText) {

            const edgeLines = edgeText
                .split("\n")
                .map(line => line.trim())
                .filter(line => line !== "");


            for (const line of edgeLines) {

                let parts;


                // Supports:
                // A-B
                // A B

                if (line.includes("-")) {

                    parts = line
                        .split("-")
                        .map(x => x.trim().toUpperCase());

                } else {

                    parts = line
                        .split(/\s+/)
                        .map(x => x.trim().toUpperCase());

                }


                if (parts.length !== 2) {
                    showError(
                        `Invalid edge: "${line}". Use A-B format.`
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
                    continue;
                }


                // Avoid duplicate edges

                const alreadyExists = edges.some(edge =>
                    (edge.from === from && edge.to === to) ||
                    (edge.from === to && edge.to === from)
                );


                if (alreadyExists) {
                    continue;
                }


                edges.push({
                    from: from,
                    to: to
                });


                // Undirected graph

                adjacency[from].push(to);
                adjacency[to].push(from);
            }
        }


        // Sort neighbors for predictable BFS

        nodes.forEach(node => {
            adjacency[node].sort();
        });


        // -----------------------------
        // Reset BFS
        // -----------------------------

        queue = [];
        visited = [];
        currentNode = null;

        bfsStarted = false;
        bfsFinished = false;


        updateInformation();


        // -----------------------------
        // Draw graph
        // -----------------------------

        renderGraph();


        graphStatus.textContent = "Graph Ready";

        graphStatus.style.color = "#4ade80";

        graphStatus.style.borderColor =
            "rgba(34, 197, 94, 0.25)";

        graphStatus.style.background =
            "rgba(34, 197, 94, 0.1)";
    }


    // =====================================================
    // RENDER GRAPH
    // =====================================================

    function renderGraph() {

        graphContainer.innerHTML = "";


        if (nodes.length === 0) {
            return;
        }


        const width = graphContainer.clientWidth || 600;
        const height = graphContainer.clientHeight || 600;


        const centerX = width / 2;
        const centerY = height / 2;


        // Radius changes according to number of nodes

        const radius = Math.min(
            width,
            height
        ) * 0.32;


        const positions = {};


        // -----------------------------
        // Calculate node positions
        // -----------------------------

        nodes.forEach((node, index) => {

            const angle =
                (2 * Math.PI * index / nodes.length)
                - Math.PI / 2;


            positions[node] = {

                x: centerX + radius * Math.cos(angle),

                y: centerY + radius * Math.sin(angle)
            };
        });


        // -----------------------------
        // SVG
        // -----------------------------

        const svgNS = "http://www.w3.org/2000/svg";

        const svg = document.createElementNS(
            svgNS,
            "svg"
        );


        svg.setAttribute(
            "viewBox",
            `0 0 ${width} ${height}`
        );


        svg.setAttribute(
            "preserveAspectRatio",
            "xMidYMid meet"
        );


        // =================================================
        // EDGES
        // =================================================

        edges.forEach(edge => {

            const line = document.createElementNS(
                svgNS,
                "line"
            );


            line.setAttribute(
                "x1",
                positions[edge.from].x
            );

            line.setAttribute(
                "y1",
                positions[edge.from].y
            );

            line.setAttribute(
                "x2",
                positions[edge.to].x
            );

            line.setAttribute(
                "y2",
                positions[edge.to].y
            );


            line.classList.add("graph-edge");


            line.dataset.from = edge.from;
            line.dataset.to = edge.to;


            svg.appendChild(line);
        });


        // =================================================
        // NODES
        // =================================================

        nodes.forEach(node => {

            const group = document.createElementNS(
                svgNS,
                "g"
            );


            group.classList.add("graph-node-group");

            group.dataset.node = node;


            // Circle

            const circle = document.createElementNS(
                svgNS,
                "circle"
            );


            circle.setAttribute(
                "cx",
                positions[node].x
            );

            circle.setAttribute(
                "cy",
                positions[node].y
            );

            circle.setAttribute(
                "r",
                "30"
            );


            circle.classList.add("graph-node");


            circle.dataset.node = node;


            // Text

            const text = document.createElementNS(
                svgNS,
                "text"
            );


            text.setAttribute(
                "x",
                positions[node].x
            );

            text.setAttribute(
                "y",
                positions[node].y
            );


            text.textContent = node;


            text.classList.add(
                "graph-node-text"
            );


            group.appendChild(circle);
            group.appendChild(text);


            svg.appendChild(group);
        });


        graphContainer.appendChild(svg);


        // Mark start node

        updateGraphVisuals();
    }


    // =====================================================
    // START BFS
    // =====================================================

    function startBFS() {

        clearError();


        if (nodes.length === 0) {
            showError(
                "Generate the graph first."
            );

            return;
        }


        // -----------------------------
        // Initialize BFS
        // -----------------------------

        queue = [startNode];

        visited = [startNode];

        currentNode = null;

        bfsStarted = true;

        bfsFinished = false;


        updateInformation();

        updateGraphVisuals();


        graphStatus.textContent =
            `BFS Started from ${startNode}`;


        graphStatus.style.color = "#60a5fa";

        graphStatus.style.borderColor =
            "rgba(96, 165, 250, 0.25)";

        graphStatus.style.background =
            "rgba(37, 99, 235, 0.12)";


        // Start button animation

        startBtn.classList.add(
            "button-active"
        );


        setTimeout(() => {

            startBtn.classList.remove(
                "button-active"
            );

        }, 300);
    }


    // =====================================================
    // NEXT BFS STEP
    // =====================================================

    function nextStep() {

        clearError();


        if (!bfsStarted) {

            showError(
                "Click Start BFS first."
            );

            return;
        }


        if (bfsFinished) {

            return;
        }


        // -----------------------------
        // BFS finished
        // -----------------------------

        if (queue.length === 0) {

            bfsFinished = true;

            currentNode = null;

            updateInformation();

            updateGraphVisuals();


            graphStatus.textContent =
                "BFS Completed";

            graphStatus.style.color =
                "#4ade80";

            graphStatus.style.borderColor =
                "rgba(34, 197, 94, 0.25)";

            graphStatus.style.background =
                "rgba(34, 197, 94, 0.1)";


            return;
        }


        // -----------------------------
        // Remove first node
        // -----------------------------

        currentNode = queue.shift();


        // -----------------------------
        // Find unvisited neighbors
        // -----------------------------

        const neighbors =
            adjacency[currentNode] || [];


        neighbors.forEach(neighbor => {

            if (!visited.includes(neighbor)) {

                visited.push(neighbor);

                queue.push(neighbor);
            }
        });


        // -----------------------------
        // Update UI
        // -----------------------------

        updateInformation();

        updateGraphVisuals();


        graphStatus.textContent =
            `Visiting ${currentNode}`;


        graphStatus.style.color =
            "#facc15";

        graphStatus.style.borderColor =
            "rgba(250, 204, 21, 0.25)";

        graphStatus.style.background =
            "rgba(250, 204, 21, 0.1)";


        // -----------------------------
        // Current node pulse
        // -----------------------------

        const currentElement =
            document.querySelector(
                `.graph-node[data-node="${currentNode}"]`
            );


        if (currentElement) {

            currentElement.classList.add(
                "node-pulse"
            );


            setTimeout(() => {

                currentElement.classList.remove(
                    "node-pulse"
                );

            }, 700);
        }
    }


    // =====================================================
    // RESET
    // =====================================================

    function resetBFS() {

        queue = [];

        visited = [];

        currentNode = null;

        bfsStarted = false;

        bfsFinished = false;


        updateInformation();

        updateGraphVisuals();


        graphStatus.textContent =
            "Ready";

        graphStatus.style.color =
            "#4ade80";

        graphStatus.style.borderColor =
            "rgba(34, 197, 94, 0.25)";

        graphStatus.style.background =
            "rgba(34, 197, 94, 0.1)";


        clearError();
    }


    // =====================================================
    // UPDATE INFORMATION
    // =====================================================

    function updateInformation() {

        queueDisplay.textContent =
            `[${queue.join(", ")}]`;


        currentDisplay.textContent =
            currentNode || "-";


        visitedDisplay.textContent =
            `[${visited.join(", ")}]`;
    }


    // =====================================================
    // UPDATE GRAPH VISUALS
    // =====================================================

    function updateGraphVisuals() {

        const graphNodes =
            document.querySelectorAll(
                ".graph-node"
            );


        graphNodes.forEach(circle => {

            const node =
                circle.dataset.node;


            // Remove old states

            circle.classList.remove(
                "node-start",
                "node-current",
                "node-visited",
                "node-queued"
            );


            // -----------------------------
            // Start
            // -----------------------------

            if (node === startNode) {

                circle.classList.add(
                    "node-start"
                );
            }


            // -----------------------------
            // Visited
            // -----------------------------

            if (visited.includes(node)) {

                circle.classList.add(
                    "node-visited"
                );
            }


            // -----------------------------
            // Queue
            // -----------------------------

            if (queue.includes(node)) {

                circle.classList.add(
                    "node-queued"
                );
            }


            // -----------------------------
            // Current
            // -----------------------------

            if (node === currentNode) {

                circle.classList.add(
                    "node-current"
                );
            }
        });


        // -----------------------------
        // Highlight current edges
        // -----------------------------

        const graphEdges =
            document.querySelectorAll(
                ".graph-edge"
            );


        graphEdges.forEach(edge => {

            edge.classList.remove(
                "edge-active"
            );


            if (
                currentNode &&
                (
                    edge.dataset.from === currentNode ||
                    edge.dataset.to === currentNode
                )
            ) {

                edge.classList.add(
                    "edge-active"
                );
            }
        });
    }


    // =====================================================
    // ERROR
    // =====================================================

    function showError(message) {

        errorMessage.textContent =
            message;
    }


    function clearError() {

        errorMessage.textContent = "";
    }


    // =====================================================
    // EVENTS
    // =====================================================

    generateBtn.addEventListener(
        "click",
        generateGraph
    );


    startBtn.addEventListener(
        "click",
        startBFS
    );


    nextBtn.addEventListener(
        "click",
        nextStep
    );


    resetBtn.addEventListener(
        "click",
        resetBFS
    );


    // =====================================================
    // INITIAL GRAPH
    // =====================================================

    generateGraph();

});