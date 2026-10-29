
const depthInput = document.getElementById("depth");
const leafInput = document.getElementById("leaf-values");
const leafHint = document.getElementById("leaf-hint");

const generateBtn = document.getElementById("generate-btn");
const startBtn = document.getElementById("start-btn");
const nextBtn = document.getElementById("next-btn");
const resetBtn = document.getElementById("reset-btn");

const treeSvg = document.getElementById("tree-svg");
const treeScroll = document.getElementById("tree-scroll");
const errorMessage = document.getElementById("error-message");
const graphStatus = document.getElementById("graph-status");

const stepCounter = document.getElementById("step-counter");
const stepDescription = document.getElementById("step-description");
const currentNodeText = document.getElementById("current-node");
const currentValueText = document.getElementById("current-value");
const rootValueText = document.getElementById("root-value");

let nodes = [];
let edges = [];
let treeDepth = 2;
let evaluationOrder = [];
let currentStep = 0;
let treeGenerated = false;
let algorithmStarted = false;
let algorithmFinished = false;
let activeNodeId = null;

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);

    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });

    return element;
}

function clearMessage() {
    errorMessage.textContent = "";
}

function showError(message) {
    errorMessage.textContent = message;
}

function updateLeafHint() {
    const depth = Number(depthInput.value);
    const count = 2 ** depth;

    leafHint.textContent =
        `Enter exactly ${count} numbers for depth ${depth}.`;
}

function resetProgress() {
    currentStep = 0;
    algorithmStarted = false;
    algorithmFinished = false;
    activeNodeId = null;
    evaluationOrder = [];

    startBtn.disabled = !treeGenerated;
    nextBtn.disabled = true;

    currentNodeText.textContent = "—";
    currentValueText.textContent = "—";
    rootValueText.textContent = "Not calculated";
    stepCounter.textContent = "Step 0";

    stepDescription.textContent =
        "Click Start, then Next Step to evaluate the tree.";

    graphStatus.textContent =
        "Tree generated. Ready to start Minimax.";

    renderTree();
}

function generateTree() {
    clearMessage();

    treeDepth = Number(depthInput.value);

    const expectedLeaves = 2 ** treeDepth;
    const rawValues = leafInput.value
        .split(",")
        .map(value => value.trim());

    if (
        rawValues.length !== expectedLeaves ||
        rawValues.some(value => value === "")
    ) {
        showError(
            `Depth ${treeDepth} requires exactly ${expectedLeaves} leaf values.`
        );
        return;
    }

    const leafValues = rawValues.map(Number);

    if (leafValues.some(value => !Number.isFinite(value))) {
        showError("Please enter valid numbers separated by commas.");
        return;
    }

    const totalNodes = 2 ** (treeDepth + 1) - 1;
    const firstLeafIndex = 2 ** treeDepth - 1;

    nodes = [];
    edges = [];

    for (let i = 0; i < totalNodes; i++) {
        const level = Math.floor(Math.log2(i + 1));
        const isLeaf = level === treeDepth;
        const isMax = level % 2 === 0;

        nodes.push({
            id: i,
            level,
            isLeaf,
            role: isMax ? "MAX" : "MIN",
            value: isLeaf ? leafValues[i - firstLeafIndex] : null,
            x: 0,
            y: 0
        });

        if (i > 0) {
            edges.push({
                from: Math.floor((i - 1) / 2),
                to: i
            });
        }
    }

    treeGenerated = true;
    resetProgress();

    graphStatus.textContent =
        `Tree generated with ${totalNodes} nodes and ${expectedLeaves} leaves.`;

    startBtn.disabled = false;
    nextBtn.disabled = true;
}

function positionNodes() {
    const width = Math.max(600, 180 * (2 ** treeDepth));
    const height = 105 + treeDepth * 115;
    const topPadding = 45;
    const bottomPadding = 45;

    nodes.forEach(node => {
        const slots = 2 ** node.level;
        const positionInLevel = node.id - (slots - 1);

        node.x = width * (positionInLevel + 0.5) / slots;
        node.y = topPadding +
            (height - topPadding - bottomPadding) *
            node.level / treeDepth;
    });

    treeSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    treeSvg.setAttribute("width", width);
    treeSvg.setAttribute("height", height);
    treeSvg.style.minWidth = `${Math.min(width, 520)}px`;
}

function renderTree() {
    treeSvg.replaceChildren();

    if (!nodes.length) {
        treeSvg.setAttribute("viewBox", "0 0 600 180");
        treeSvg.setAttribute("width", "600");
        treeSvg.setAttribute("height", "180");
        return;
    }

    positionNodes();

    // Draw edges first so nodes appear on top.
    edges.forEach(edge => {
        const parent = nodes[edge.from];
        const child = nodes[edge.to];

        const line = createSvgElement("line", {
            x1: parent.x,
            y1: parent.y,
            x2: child.x,
            y2: child.y,
            class:
                activeNodeId === child.id ||
                activeNodeId === parent.id
                    ? "tree-edge edge-active"
                    : "tree-edge"
        });

        treeSvg.appendChild(line);
    });

    nodes.forEach(node => {
        const group = createSvgElement("g");

        const classNames = [
            "tree-node",
            node.isLeaf
                ? "leaf-node"
                : node.role === "MAX"
                    ? "max-node"
                    : "min-node"
        ];

        if (node.id === activeNodeId) {
            classNames.push("current-node");
        }

        const circle = createSvgElement("circle", {
            cx: node.x,
            cy: node.y,
            r: 23,
            class: classNames.join(" ")
        });

        const valueText = createSvgElement("text", {
            x: node.x,
            y: node.y,
            class: "tree-node-text"
        });

        valueText.textContent =
            node.value === null ? "?" : String(node.value);

        const roleText = createSvgElement("text", {
            x: node.x,
            y: node.y + 38,
            class: "tree-role-text"
        });

        roleText.textContent = node.isLeaf ? "LEAF" : node.role;

        group.append(circle, valueText, roleText);
        treeSvg.appendChild(group);
    });
}

function startMinimax() {
    clearMessage();

    if (!treeGenerated) {
        showError("Please generate the tree first.");
        return;
    }

    // Reverse index order ensures children are evaluated before parents.
    evaluationOrder = nodes
        .filter(node => !node.isLeaf)
        .map(node => node.id)
        .sort((a, b) => b - a);

    currentStep = 0;
    algorithmStarted = true;
    algorithmFinished = false;
    activeNodeId = null;

    startBtn.disabled = true;
    nextBtn.disabled = false;

    currentNodeText.textContent = "—";
    currentValueText.textContent = "—";
    rootValueText.textContent = "Calculating...";
    stepCounter.textContent = "Step 0";

    stepDescription.textContent =
        "Start from the deepest parent nodes and move toward the root.";

    graphStatus.textContent =
        "Minimax started. Click Next Step to evaluate a node.";

    renderTree();
}

function nextStep() {
    clearMessage();

    if (!algorithmStarted || algorithmFinished) {
        return;
    }

    if (currentStep >= evaluationOrder.length) {
        finishAlgorithm();
        return;
    }

    const nodeId = evaluationOrder[currentStep];
    const node = nodes[nodeId];

    const leftChild = nodes[2 * nodeId + 1];
    const rightChild = nodes[2 * nodeId + 2];

    if (
        !leftChild ||
        !rightChild ||
        leftChild.value === null ||
        rightChild.value === null
    ) {
        showError("A child node is missing a value.");
        return;
    }

    node.value = node.role === "MAX"
        ? Math.max(leftChild.value, rightChild.value)
        : Math.min(leftChild.value, rightChild.value);

    activeNodeId = nodeId;
    currentStep++;

    currentNodeText.textContent = `${node.role} node ${node.id}`;
    currentValueText.textContent = String(node.value);

    stepCounter.textContent =
        `Step ${currentStep} / ${evaluationOrder.length}`;

    stepDescription.textContent =
        `${node.role} node ${node.id}: ` +
        `${node.role === "MAX" ? "max" : "min"}(` +
        `${leftChild.value}, ${rightChild.value}) = ${node.value}`;

    graphStatus.textContent =
        `Evaluated ${node.role} node ${node.id}.`;

    renderTree();

    if (currentStep === evaluationOrder.length) {
        finishAlgorithm();
    }
}

function finishAlgorithm() {
    algorithmFinished = true;
    nextBtn.disabled = true;

    rootValueText.textContent = String(nodes[0].value);
    currentNodeText.textContent = "Root (MAX)";
    currentValueText.textContent = String(nodes[0].value);

    stepDescription.textContent =
        `Minimax complete! The best guaranteed value for MAX is ${nodes[0].value}.`;

    graphStatus.textContent =
        `Finished. Root Minimax value = ${nodes[0].value}.`;

    activeNodeId = 0;
    renderTree();
}

function resetTree() {
    clearMessage();

    nodes = [];
    edges = [];
    treeGenerated = false;

    resetProgress();

    startBtn.disabled = true;
    nextBtn.disabled = true;

    graphStatus.textContent = "Generate a tree to begin.";

    stepDescription.textContent =
        "Set the leaf values, then click Generate Tree.";

    treeSvg.replaceChildren();
}

depthInput.addEventListener("change", () => {
    updateLeafHint();
    treeGenerated = false;
    resetTree();
});

generateBtn.addEventListener("click", generateTree);
startBtn.addEventListener("click", startMinimax);
nextBtn.addEventListener("click", nextStep);
resetBtn.addEventListener("click", resetTree);

updateLeafHint();
resetTree();
