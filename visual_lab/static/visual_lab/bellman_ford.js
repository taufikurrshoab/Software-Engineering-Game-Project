
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
const currentEdgeElement = document.getElementById("current-edge");
const candidateElement = document.getElementById("candidate-distance");
const relaxCountElement = document.getElementById("relax-count");
const distanceList = document.getElementById("distance-list");
const pathResult = document.getElementById("path-result");

const SVG_NS = "http://www.w3.org/2000/svg";
const INF = Infinity;

let nodes = [];
let edges = [];
let distances = {};
let previous = {};

let sourceNode = null;
let edgeIndex = 0;
let pass = 1;
let successfulRelaxations = 0;
let currentEdge = null;
let lastUpdatedNode = null;

let generated = false;
let started = false;
let finished = false;
let negativeCycle = false;
let cycleNodes = new Set();

let shortestPath = [];
let shortestPathEdges = new Set();
let pathCost = null;

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
    const parsedNodes = nodesInput.value
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean);

    if (parsedNodes.length < 2 || parsedNodes.length > 20) {
        throw new Error("Enter between 2 and 20 nodes.");
    }

    if (new Set(parsedNodes).size !== parsedNodes.length) {
        throw new Error("Node names must be unique.");
    }

    if (parsedNodes.some(n => !/^[A-Za-z0-9]+$/.test(n))) {
        throw new Error("Use simple node names such as A, B, C or N1.");
    }

    const nodeSet = new Set(parsedNodes);
    const parsedEdges = [];

    const lines = edgesInput.value
        .split(/\n/)
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        throw new Error("Enter at least one directed edge.");
    }

    for (const line of lines) {
        const match = line.match(
            /^([A-Za-z0-9]+)\s*->\s*([A-Za-z0-9]+)\s*:\s*(-?\d+(?:\.\d+)?)$/
        );

        if (!match) {
            throw new Error(`Invalid edge "${line}". Use A->B:4.`);
        }

        const [, from, to, rawWeight] = match;
        const weight = Number(rawWeight);

        if (!nodeSet.has(from) || !nodeSet.has(to)) {
            throw new Error(`Edge ${from}->${to} contains an unknown node.`);
        }

        if (from === to) {
            throw new Error("Self-loops are not supported in this visualizer.");
        }

        if (!Number.isFinite(weight)) {
            throw new Error("Every edge must have a valid numeric weight.");
        }

        parsedEdges.push({
            from,
            to,
            weight,
            id: parsedEdges.length
        });
    }

    return { nodes: parsedNodes, edges: parsedEdges };
}

function updateSelectOptions() {
    const oldSource = sourceInput.value;
    const oldTarget = targetInput.value;

    sourceInput.replaceChildren();
    targetInput.replaceChildren();

    for (const node of nodes) {
        const sourceOption = document.createElement("option");
        sourceOption.value = node;
        sourceOption.textContent = node;
        sourceInput.appendChild(sourceOption);

        const targetOption = document.createElement("option");
        targetOption.value = node;
        targetOption.textContent = node;
        targetInput.appendChild(targetOption);
    }

    sourceInput.value = nodes.includes(oldSource) ? oldSource : nodes[0];
    targetInput.value = nodes.includes(oldTarget)
        ? oldTarget
        : nodes[nodes.length - 1];
}

function initializeAlgorithm() {
    distances = {};
    previous = {};

    for (const node of nodes) {
        distances[node] = INF;
        previous[node] = null;
    }

    sourceNode = sourceInput.value;
    distances[sourceNode] = 0;

    edgeIndex = 0;
    pass = 1;
    successfulRelaxations = 0;
    lastPassRelaxations = 0;
    currentEdge = null;
    lastUpdatedNode = null;

    started = false;
    finished = false;
    negativeCycle = false;
    cycleNodes = new Set();

    shortestPath = [];
    shortestPathEdges = new Set();
    pathCost = null;

    currentEdgeElement.textContent = "—";
    candidateElement.textContent = "—";
    relaxCountElement.textContent = "0";
    stepCounter.textContent = "Pass 0 · Edge 0";

    stepDescription.textContent =
        `Initialise d(${sourceNode}) = 0; all other distances = ∞.`;

    statusElement.textContent =
        "Graph generated. Press Start to begin edge relaxation.";

    pathResult.textContent = "Complete the algorithm to find a path.";
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
        generated = true;

        updateSelectOptions();
        initializeAlgorithm();

        statusElement.textContent =
            `Graph generated: ${nodes.length} nodes, ${edges.length} directed edges.`;

        startBtn.disabled = false;
    } catch (error) {
        showError(error.message);
    }
}

function positionNodes() {
    const width = Math.max(650, nodes.length * 110);
    const height = 430;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width * 0.37, height * 0.35);
    const positions = {};

    nodes.forEach((node, index) => {
        const angle = -Math.PI / 2 +
            2 * Math.PI * index / nodes.length;

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

    if (!nodes.length) return;

    const positions = positionNodes();

    const defs = svgElement("defs");
    const marker = svgElement("marker", {
        id: "arrowhead",
        markerWidth: 8,
        markerHeight: 8,
        refX: 7,
        refY: 3,
        orient: "auto",
        markerUnits: "strokeWidth"
    });

    marker.appendChild(svgElement("path", {
        d: "M0,0 L0,6 L8,3 z",
        fill: "#7890b5"
    }));

    defs.appendChild(marker);
    graphSvg.appendChild(defs);

    // Draw directed edges and their weights.
    for (const edge of edges) {
        const a = positions[edge.from];
        const b = positions[edge.to];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy) || 1;
        const ux = dx / length;
        const uy = dy / length;

        const startX = a.x + ux * 31;
        const startY = a.y + uy * 31;
        const endX = b.x - ux * 36;
        const endY = b.y - uy * 36;

        let edgeClass = "edge";

        if (cycleNodes.has(edge.from) && cycleNodes.has(edge.to)) {
            edgeClass = "edge cycle-edge";
        } else if (
            currentEdge && currentEdge.id === edge.id && !finished
        ) {
            edgeClass = "edge current-edge";
        } else if (shortestPathEdges.has(edge.id)) {
            edgeClass = "edge path-edge";
        }

        const line = svgElement("line", {
            x1: startX,
            y1: startY,
            x2: endX,
            y2: endY,
            class: edgeClass,
            "marker-end": "url(#arrowhead)"
        });

        graphSvg.appendChild(line);

        const midX = (startX + endX) / 2 - uy * 12;
        const midY = (startY + endY) / 2 + ux * 12;

        const bg = svgElement("rect", {
            x: midX - 16,
            y: midY - 11,
            width: 32,
            height: 22,
            rx: 6,
            class: "edge-label-bg"
        });

        const label = svgElement("text", {
            x: midX,
            y: midY,
            class: "edge-label"
        });

        label.textContent = edge.weight;
        graphSvg.append(bg, label);
    }

    for (const node of nodes) {
        const pos = positions[node];

        let className = "node normal";

        if (cycleNodes.has(node)) {
            className = "node cycle-node";
        } else if (shortestPath.includes(node)) {
            className = "node path-node";
        } else if (node === lastUpdatedNode) {
            className = "node updated";
        } else if (node === sourceNode) {
            className = "node source";
        }

        const circle = svgElement("circle", {
            cx: pos.x,
            cy: pos.y,
            r: 28,
            class: className
        });

        const label = svgElement("text", {
            x: pos.x,
            y: pos.y - 3,
            class: "node-label"
        });
        label.textContent = node;

        const distance = svgElement("text", {
            x: pos.x,
            y: pos.y + 43,
            class: "node-distance"
        });

        distance.textContent = Number.isFinite(distances[node])
            ? `d = ${distances[node]}`
            : "d = ∞";

        graphSvg.append(circle, label, distance);
    }
}

function renderDistances() {
    distanceList.replaceChildren();

    for (const node of nodes) {
        const item = document.createElement("div");
        item.className = "distance-item";

        if (node === lastUpdatedNode) {
            item.classList.add("updated");
        }

        const name = document.createElement("div");
        name.className = "name";
        name.textContent = `Node ${node}`;

        const value = document.createElement("strong");
        value.textContent = Number.isFinite(distances[node])
            ? String(distances[node])
            : "∞";

        const note = document.createElement("small");
        note.textContent = node === sourceNode
            ? "Source"
            : node === lastUpdatedNode
                ? "Just updated"
                : previous[node] !== null
                    ? `From ${previous[node]}`
                    : "No predecessor";

        item.append(name, value, note);
        distanceList.appendChild(item);
    }
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
        `Bellman–Ford started from ${sourceNode}.`;

    stepDescription.textContent =
        `Pass 1 begins. Each Next Step examines one directed edge.`;

    renderGraph();
    renderDistances();
}

function finishWithNegativeCycle() {
    negativeCycle = true;
    finished = true;
    nextBtn.disabled = true;
    pathBtn.disabled = true;

    // Find nodes affected by a reachable negative cycle.
    const affected = new Set();

    for (const edge of edges) {
        if (
            Number.isFinite(distances[edge.from]) &&
            distances[edge.from] + edge.weight < distances[edge.to]
        ) {
            affected.add(edge.to);
        }
    }

    // Propagate the affected status through outgoing edges.
    let changed = true;

    while (changed) {
        changed = false;

        for (const edge of edges) {
            if (
                affected.has(edge.from) &&
                !affected.has(edge.to)
            ) {
                affected.add(edge.to);
                changed = true;
            }
        }
    }

    cycleNodes = affected;

    statusElement.textContent =
        "Reachable negative-weight cycle detected. Shortest paths to affected nodes are undefined.";

    stepDescription.textContent =
        "After V − 1 passes, an edge can still be relaxed. This proves a reachable negative-weight cycle exists.";

    pathResult.textContent =
        "A finite shortest path cannot be guaranteed for nodes affected by this negative cycle.";

    renderGraph();
    renderDistances();
}

function nextStep() {
    clearError();

    if (!started || finished) return;

    // After V-1 complete passes, make one extra pass for cycle detection.
    if (pass > nodes.length - 1) {
        const relaxable = edges.some(edge =>
            Number.isFinite(distances[edge.from]) &&
            distances[edge.from] + edge.weight < distances[edge.to]
        );

        if (relaxable) {
            finishWithNegativeCycle();
        } else {
            finished = true;
            nextBtn.disabled = true;
            pathBtn.disabled = false;

            currentEdge = null;
            lastUpdatedNode = null;

            statusElement.textContent =
                "Algorithm complete. No reachable negative-weight cycle was found.";

            stepDescription.textContent =
                "The extra pass found no further relaxation, so the computed shortest distances are final.";

            renderGraph();
            renderDistances();
        }

        return;
    }

    if (edgeIndex >= edges.length) {
        pass++;
        edgeIndex = 0;

        // A pass with no successful relaxation can finish early.
        if (lastPassRelaxations === 0) {
            pass = nodes.length;
        }

        lastPassRelaxations = 0;

        if (pass > nodes.length - 1) {
            stepCounter.textContent = `Pass ${nodes.length} · Cycle check`;
            stepDescription.textContent =
                "All normal passes are complete. Press Next Step to check for a negative cycle.";
            return;
        }
    }

    currentEdge = edges[edgeIndex];
    lastUpdatedNode = null;

    const edge = currentEdge;
    const fromDistance = distances[edge.from];

    let candidate = INF;
    let updated = false;

    if (Number.isFinite(fromDistance)) {
        candidate = fromDistance + edge.weight;

        if (candidate < distances[edge.to]) {
            distances[edge.to] = candidate;
            previous[edge.to] = edge.from;
            successfulRelaxations++;
            lastPassRelaxations++;
            lastUpdatedNode = edge.to;
            updated = true;
        }
    }

    stepCounter.textContent = `Pass ${pass} · Edge ${edgeIndex + 1}/${edges.length}`;
    currentEdgeElement.textContent =
        `${edge.from} → ${edge.to} (${edge.weight})`;

    candidateElement.textContent = Number.isFinite(candidate)
        ? String(candidate)
        : "∞";

    relaxCountElement.textContent = String(successfulRelaxations);

    stepDescription.textContent = !Number.isFinite(fromDistance)
        ? `${edge.from} is unreachable so far. This edge cannot update ${edge.to}.`
        : updated
            ? `Relax ${edge.from} → ${edge.to}: ${fromDistance} + (${edge.weight}) = ${candidate}. Distance updated.`
            : `Check ${edge.from} → ${edge.to}: ${fromDistance} + (${edge.weight}) = ${candidate}. No improvement over ${Number.isFinite(distances[edge.to]) ? distances[edge.to] : "∞"}.`;

    statusElement.textContent = updated
        ? `Distance to ${edge.to} updated to ${candidate}.`
        : `Examined edge ${edge.from} → ${edge.to}.`;

    edgeIndex++;

    renderGraph();
    renderDistances();
}

let lastPassRelaxations = 0;

function showShortestPath() {
    clearError();

    if (!finished || negativeCycle) {
        showError(
            "A valid shortest path can only be displayed after the algorithm finishes without a reachable negative cycle."
        );
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
    const seen = new Set();
    let node = target;

    while (node !== null) {
        if (seen.has(node)) {
            showError("Could not reconstruct the path safely.");
            return;
        }

        seen.add(node);
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
        const edge = edges.find(e =>
            e.from === path[i] && e.to === path[i + 1]
        );

        if (edge) shortestPathEdges.add(edge.id);
    }

    pathCost = distances[target];

    pathResult.textContent =
        `${path.join(" → ")} | Total cost: ${pathCost}`;

    renderGraph();
    renderDistances();
}

function resetAlgorithm() {
    clearError();

    if (generated) {
        initializeAlgorithm();
        statusElement.textContent =
            "Algorithm reset. Press Start to run it again.";
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
    pathResult.textContent =
        "Press Show Shortest Path after the algorithm finishes.";
});

generateGraph();
