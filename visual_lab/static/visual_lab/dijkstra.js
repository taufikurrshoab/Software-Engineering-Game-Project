
const nodesInput = document.getElementById("nodes-input");
const edgesInput = document.getElementById("edges-input");
const sourceInput = document.getElementById("source-input");
const targetInput = document.getElementById("target-input");

const generateBtn = document.getElementById("generate-btn");
const startBtn = document.getElementById("start-btn");
const nextBtn = document.getElementById("next-btn");
const resetBtn = document.getElementById("reset-btn");
const pathBtn = document.getElementById("path-btn");

const graphSvg = document.getElementById("graph-svg");
const errorElement = document.getElementById("error-message");
const statusElement = document.getElementById("status");
const stepCounter = document.getElementById("step-counter");
const stepDescription = document.getElementById("step-description");
const currentNodeElement = document.getElementById("current-node");
const currentDistanceElement = document.getElementById("current-distance");
const visitedCountElement = document.getElementById("visited-count");
const distanceList = document.getElementById("distance-list");
const pathResult = document.getElementById("path-result");

const SVG_NS = "http://www.w3.org/2000/svg";
const INF = Infinity;

let nodes = [];
let edges = [];
let adjacency = new Map();
let distances = {};
let previous = {};
let visited = new Set();
let currentNode = null;
let sourceNode = null;
let step = 0;
let generated = false;
let started = false;
let finished = false;
let shortestPath = [];
let shortestPathEdges = new Set();

function svgElement(tag, attrs = {}) {
    const element = document.createElementNS(SVG_NS, tag);

    Object.entries(attrs).forEach(([key, value]) => {
        element.setAttribute(key, String(value));
    });

    return element;
}

function showError(message) {
    errorElement.textContent = message;
}

function clearError() {
    errorElement.textContent = "";
}

function parseGraph() {
    const rawNodes = nodesInput.value
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean);

    if (rawNodes.length < 2) {
        throw new Error("Please enter at least 2 nodes.");
    }

    if (rawNodes.length > 20) {
        throw new Error("For this visualizer, use at most 20 nodes.");
    }

    if (new Set(rawNodes).size !== rawNodes.length) {
        throw new Error("Node names must be unique.");
    }

    if (rawNodes.some(n => !/^[A-Za-z0-9]+$/.test(n))) {
        throw new Error("Use simple node names, such as A, B, C or N1.");
    }

    const nodeSet = new Set(rawNodes);
    const parsedEdges = [];
    const edgeKeys = new Set();

    const lines = edgesInput.value
        .split(/\n/)
        .map(line => line.trim())
        .filter(Boolean);

    if (!lines.length) {
        throw new Error("Please enter at least one edge.");
    }

    for (const line of lines) {
        const match = line.match(
            /^([A-Za-z0-9]+)\s*-\s*([A-Za-z0-9]+)\s*:\s*(\d+(?:\.\d+)?)$/
        );

        if (!match) {
            throw new Error(
                `Invalid edge "${line}". Use format A-B:4.`
            );
        }

        const [, from, to, rawWeight] = match;
        const weight = Number(rawWeight);

        if (!nodeSet.has(from) || !nodeSet.has(to)) {
            throw new Error(
                `Edge ${from}-${to} uses a node not listed above.`
            );
        }

        if (from === to) {
            throw new Error("Self-loops are not supported.");
        }

        if (!Number.isFinite(weight) || weight < 0) {
            throw new Error("Edge weights must be non-negative.");
        }

        const pair = [from, to].sort().join("|");

        if (edgeKeys.has(pair)) {
            throw new Error(
                `Duplicate edge between ${from} and ${to}.`
            );
        }

        edgeKeys.add(pair);
        parsedEdges.push({ from, to, weight });
    }

    return { nodes: rawNodes, edges: parsedEdges };
}

function updateSelectOptions() {
    const oldSource = sourceInput.value;
    const oldTarget = targetInput.value;

    sourceInput.replaceChildren();
    targetInput.replaceChildren();

    nodes.forEach(node => {
        const sourceOption = document.createElement("option");
        sourceOption.value = node;
        sourceOption.textContent = node;
        sourceInput.appendChild(sourceOption);

        const targetOption = document.createElement("option");
        targetOption.value = node;
        targetOption.textContent = node;
        targetInput.appendChild(targetOption);
    });

    sourceInput.value = nodes.includes(oldSource)
        ? oldSource
        : nodes[0];

    targetInput.value = nodes.includes(oldTarget)
        ? oldTarget
        : nodes[nodes.length - 1];
}

function initializeAlgorithm() {
    distances = {};
    previous = {};
    visited = new Set();
    currentNode = null;
    step = 0;
    started = false;
    finished = false;
    shortestPath = [];
    shortestPathEdges = new Set();

    nodes.forEach(node => {
        distances[node] = INF;
        previous[node] = null;
    });

    sourceNode = sourceInput.value;
    distances[sourceNode] = 0;

    currentNodeElement.textContent = "—";
    currentDistanceElement.textContent = "—";
    visitedCountElement.textContent = "0";
    stepCounter.textContent = "Step 0";

    stepDescription.textContent =
        "Click Start to begin Dijkstra's algorithm.";

    statusElement.textContent =
        `Source node: ${sourceNode}. Initial distance is 0.`;

    pathResult.textContent =
        "Run the algorithm, then choose a destination.";

    pathBtn.disabled = true;
    nextBtn.disabled = true;
    startBtn.disabled = !generated;

    renderGraph();
    renderDistances();
}

function generateGraph() {
    clearError();

    try {
        const graph = parseGraph();

        nodes = graph.nodes;
        edges = graph.edges;

        adjacency = new Map(
            nodes.map(node => [node, []])
        );

        edges.forEach(edge => {
            adjacency.get(edge.from).push({
                node: edge.to,
                weight: edge.weight
            });

            adjacency.get(edge.to).push({
                node: edge.from,
                weight: edge.weight
            });
        });

        generated = true;
        updateSelectOptions();
        initializeAlgorithm();

        statusElement.textContent =
            `Graph generated: ${nodes.length} nodes, ${edges.length} edges.`;

        startBtn.disabled = false;
    } catch (error) {
        showError(error.message);
    }
}

function positionNodes() {
    const width = Math.max(650, nodes.length * 105);
    const height = 420;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width * 0.39, height * 0.36);

    const positions = {};

    nodes.forEach((node, index) => {
        const angle = -Math.PI / 2 +
            (2 * Math.PI * index / nodes.length);

        positions[node] = {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
        };
    });

    graphSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    graphSvg.setAttribute("width", width);
    graphSvg.setAttribute("height", height);

    return positions;
}

function renderGraph() {
    graphSvg.replaceChildren();

    if (!nodes.length) {
        graphSvg.setAttribute("viewBox", "0 0 650 420");
        graphSvg.setAttribute("width", "650");
        graphSvg.setAttribute("height", "420");
        return;
    }

    const positions = positionNodes();

    // Draw weighted edges first.
    edges.forEach(edge => {
        const a = positions[edge.from];
        const b = positions[edge.to];

        const pair1 = `${edge.from}|${edge.to}`;
        const pair2 = `${edge.to}|${edge.from}`;

        const line = svgElement("line", {
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            class: shortestPathEdges.has(pair1) ||
                   shortestPathEdges.has(pair2)
                ? "edge path-edge"
                : "edge"
        });

        graphSvg.appendChild(line);

        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;

        const labelBg = svgElement("rect", {
            x: midX - 15,
            y: midY - 11,
            width: 30,
            height: 22,
            rx: 7,
            class: "edge-label-bg"
        });

        const label = svgElement("text", {
            x: midX,
            y: midY,
            class: "edge-label"
        });

        label.textContent = edge.weight;

        graphSvg.append(labelBg, label);
    });

    // Draw nodes and their current tentative distances.
    nodes.forEach(node => {
        const pos = positions[node];

        let nodeClass = "node normal";

        if (node === sourceNode) nodeClass = "node source";
        if (visited.has(node)) nodeClass = "node visited";
        if (node === currentNode && !finished) {
            nodeClass = "node current";
        }
        if (shortestPath.includes(node)) {
            nodeClass = "node path-node";
        }
        if (node === sourceNode && shortestPath.length === 1) {
            nodeClass = "node path-node";
        }

        const circle = svgElement("circle", {
            cx: pos.x,
            cy: pos.y,
            r: 29,
            class: nodeClass
        });

        const label = svgElement("text", {
            x: pos.x,
            y: pos.y - 2,
            class: "node-label"
        });

        label.textContent = node;

        const distance = svgElement("text", {
            x: pos.x,
            y: pos.y + 45,
            class: "node-distance"
        });

        distance.textContent = Number.isFinite(distances[node])
            ? `d = ${distances[node]}`
            : "d = ∞";

        graphSvg.append(circle, label, distance);
    });
}

function renderDistances() {
    distanceList.replaceChildren();

    nodes.forEach(node => {
        const item = document.createElement("div");

        item.className = "distance-item";

        if (node === currentNode) item.classList.add("current");
        if (visited.has(node)) item.classList.add("final");

        const name = document.createElement("div");
        name.className = "name";
        name.textContent = `Node ${node}`;

        const value = document.createElement("strong");
        value.textContent = Number.isFinite(distances[node])
            ? String(distances[node])
            : "∞";

        const note = document.createElement("small");
        note.textContent = visited.has(node)
            ? "Finalized"
            : node === currentNode
                ? "Current"
                : "Tentative";

        item.append(name, value, note);
        distanceList.appendChild(item);
    });
}

function startAlgorithm() {
    clearError();

    if (!generated) {
        showError("Generate a graph first.");
        return;
    }

    initializeAlgorithm();
    started = true;
    startBtn.disabled = true;
    nextBtn.disabled = false;

    statusElement.textContent =
        `Dijkstra started from ${sourceNode}.`;

    stepDescription.textContent =
        `Initialize dist(${sourceNode}) = 0; all other distances are infinity.`;

    renderGraph();
    renderDistances();
}

function nextStep() {
    clearError();

    if (!started || finished) return;

    // Select the unvisited node with the smallest tentative distance.
    let bestNode = null;
    let bestDistance = INF;

    for (const node of nodes) {
        if (!visited.has(node) && distances[node] < bestDistance) {
            bestDistance = distances[node];
            bestNode = node;
        }
    }

    // No remaining reachable node.
    if (bestNode === null) {
        finished = true;
        nextBtn.disabled = true;
        pathBtn.disabled = false;

        currentNode = null;

        statusElement.textContent =
            "Algorithm complete. All reachable nodes are finalized.";

        stepDescription.textContent =
            "No unvisited reachable node remains. Unreachable nodes keep distance ∞.";

        renderGraph();
        renderDistances();
        return;
    }

    currentNode = bestNode;
    visited.add(bestNode);
    step++;

    const updates = [];

    for (const neighbor of adjacency.get(bestNode)) {
        if (visited.has(neighbor.node)) continue;

        const candidate = distances[bestNode] + neighbor.weight;

        if (candidate < distances[neighbor.node]) {
            const oldDistance = distances[neighbor.node];

            distances[neighbor.node] = candidate;
            previous[neighbor.node] = bestNode;

            updates.push(
                `${neighbor.node}: ${oldDistance === INF ? "∞" : oldDistance} → ${candidate}`
            );
        }
    }

    currentNodeElement.textContent = bestNode;
    currentDistanceElement.textContent = String(distances[bestNode]);
    visitedCountElement.textContent = String(visited.size);
    stepCounter.textContent = `Step ${step}`;

    stepDescription.textContent = updates.length
        ? `Finalize ${bestNode} (distance ${distances[bestNode]}). Updated: ${updates.join("; ")}.`
        : `Finalize ${bestNode} (distance ${distances[bestNode]}). No shorter distance found for its unvisited neighbors.`;

    statusElement.textContent =
        `Visited ${bestNode}; relaxed its outgoing edges.`;

    renderGraph();
    renderDistances();

    // Check whether another reachable unvisited node remains.
    const hasReachableUnvisited = nodes.some(
        node => !visited.has(node) && Number.isFinite(distances[node])
    );

    if (!hasReachableUnvisited) {
        finished = true;
        nextBtn.disabled = true;
        pathBtn.disabled = false;

        statusElement.textContent =
            "Algorithm complete. All reachable nodes are finalized.";

        stepDescription.textContent +=
            " Dijkstra's algorithm has finished.";
    }
}

function showShortestPath() {
    clearError();

    if (!finished) {
        showError("Complete the algorithm before requesting a path.");
        return;
    }

    const target = targetInput.value;

    if (!Number.isFinite(distances[target])) {
        shortestPath = [];
        shortestPathEdges = new Set();

        pathResult.textContent =
            `No path exists from ${sourceNode} to ${target}.`;

        renderGraph();
        return;
    }

    const path = [];
    let node = target;

    while (node !== null) {
        path.unshift(node);

        if (node === sourceNode) break;

        node = previous[node];
    }

    if (path[0] !== sourceNode) {
        pathResult.textContent = "No path exists.";
        return;
    }

    shortestPath = path;
    shortestPathEdges = new Set();

    for (let i = 0; i < path.length - 1; i++) {
        shortestPathEdges.add(`${path[i]}|${path[i + 1]}`);
    }

    pathResult.textContent =
        `${path.join(" → ")} | Total cost: ${distances[target]}`;

    renderGraph();
    renderDistances();
}

function resetAlgorithm() {
    clearError();

    if (generated) {
        initializeAlgorithm();
        statusElement.textContent =
            "Graph reset. Click Start to run the algorithm again.";
    } else {
        statusElement.textContent = "Generate a graph to begin.";
    }
}

generateBtn.addEventListener("click", generateGraph);
startBtn.addEventListener("click", startAlgorithm);
nextBtn.addEventListener("click", nextStep);
resetBtn.addEventListener("click", resetAlgorithm);
pathBtn.addEventListener("click", showShortestPath);

sourceInput.addEventListener("change", () => {
    if (generated) initializeAlgorithm();
});

targetInput.addEventListener("change", () => {
    pathResult.textContent = "Click Show Shortest Path to view the selected destination.";
});

generateGraph();
