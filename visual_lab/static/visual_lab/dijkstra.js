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

    const distanceDisplay = document.getElementById("distance");
    const currentDisplay = document.getElementById("current-node");
    const visitedDisplay = document.getElementById("visited");

    const errorMessage = document.getElementById("error-message");
    const graphStatus = document.getElementById("graph-status");

    const nodeCount = document.getElementById("node-count");
    const edgeCount = document.getElementById("edge-count");

    const descriptionTitle = document.getElementById("description-title");
    const stepDescription = document.getElementById("step-description");
    const pathBox = document.getElementById("path-box");
    const descriptionFacts = document.getElementById("description-facts");

    const progressBar = document.getElementById("progress-bar");
    const progressPercent = document.getElementById("progress-percent");
    const progressText = document.getElementById("progress-text");

    // Scroll target after Generate Graph: the visualization workspace.
    const visualizerSection = document.getElementById("dj-workspace");

    // =====================================================
    // THEORY: CLICKABLE CONCEPT CARDS
    // =====================================================

    const conceptCards = document.querySelectorAll(".dj-concept-card");
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
    // THEORY: MINI PRIORITY QUEUE DEMO
    // =====================================================

    const pqAddBtn = document.getElementById("pq-add");
    const pqPopBtn = document.getElementById("pq-pop");
    const pqItemsEl = document.getElementById("pq-items");
    const pqMessage = document.getElementById("pq-message");

    const PQ_MAX = 6;

    let pqDemo = [];      // kept sorted by cost, smallest first
    let pqCounter = 0;

    function renderPqDemo() {
        if (!pqItemsEl) return;

        pqItemsEl.replaceChildren();

        if (pqDemo.length === 0) {
            const empty = document.createElement("span");

            empty.className = "empty-text";
            empty.textContent = "Priority queue is empty";

            pqItemsEl.appendChild(empty);
            return;
        }

        pqDemo.forEach((item, index) => {
            const chip = makeChip(
                `${item.label} : ${item.cost}`,
                index === 0 ? "chip pq-chip is-min" : "chip pq-chip"
            );

            if (index === 0) {
                chip.appendChild(makeTag("MIN"));
            }

            pqItemsEl.appendChild(chip);
        });
    }

    function pqAdd() {
        if (pqDemo.length >= PQ_MAX) {
            if (pqMessage) {
                pqMessage.textContent =
                    "The demo queue is full. Try Pop smallest.";
            }
            return;
        }

        const label = String.fromCharCode(65 + (pqCounter % 26));
        const cost = 1 + Math.floor(Math.random() * 9);

        pqCounter++;

        pqDemo.push({ label, cost });

        // Keep the smallest cost at the front (ties: older item first).
        pqDemo.sort((a, b) => a.cost - b.cost);

        if (pqMessage) {
            pqMessage.textContent =
                `${label} was added with cost ${cost}. The queue stays ordered by cost.`;
        }

        renderPqDemo();
    }

    function pqPop() {
        if (pqDemo.length === 0) {
            if (pqMessage) {
                pqMessage.textContent = "Nothing to pop yet. Add an item first.";
            }
            return;
        }

        const removed = pqDemo.shift();

        if (pqMessage) {
            pqMessage.textContent =
                `${removed.label} (cost ${removed.cost}) left first because it has the smallest cost.`;
        }

        renderPqDemo();
    }

    if (pqAddBtn) pqAddBtn.addEventListener("click", pqAdd);
    if (pqPopBtn) pqPopBtn.addEventListener("click", pqPop);

    // =====================================================
    // PSEUDOCODE LINE EXPLANATION
    // =====================================================

    const codeLines = document.querySelectorAll(".dj-code-line");
    const lineExplanation = document.getElementById("dj-line-explanation");

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
    // BINARY MIN-HEAP (the priority queue used by Dijkstra)
    // Ordered by distance, ties broken by node name.
    // =====================================================

    class MinHeap {
        constructor() {
            this.items = [];
        }

        get size() {
            return this.items.length;
        }

        less(a, b) {
            return a.dist < b.dist || (a.dist === b.dist && a.node < b.node);
        }

        push(item) {
            const items = this.items;

            items.push(item);

            let i = items.length - 1;

            while (i > 0) {
                const parentIndex = (i - 1) >> 1;

                if (!this.less(items[i], items[parentIndex])) break;

                [items[i], items[parentIndex]] = [items[parentIndex], items[i]];
                i = parentIndex;
            }
        }

        pop() {
            const items = this.items;

            if (items.length === 0) return null;

            const top = items[0];
            const last = items.pop();

            if (items.length > 0) {
                items[0] = last;

                let i = 0;

                while (true) {
                    const left = 2 * i + 1;
                    const right = 2 * i + 2;
                    let smallest = i;

                    if (left < items.length && this.less(items[left], items[smallest])) {
                        smallest = left;
                    }

                    if (right < items.length && this.less(items[right], items[smallest])) {
                        smallest = right;
                    }

                    if (smallest === i) break;

                    [items[i], items[smallest]] = [items[smallest], items[i]];
                    i = smallest;
                }
            }

            return top;
        }
    }

    // =====================================================
    // DIJKSTRA DATA
    // =====================================================

    let nodes = [];
    let edges = [];            // { from, to, weight }
    let adjacency = {};        // node -> [{ node, weight }]
    let weightOf = {};         // "A|B" (sorted) -> weight

    let startNode = "";

    let dist = {};             // node -> shortest known distance
    let prev = {};             // node -> previous node on the best path
    let visited = [];          // finalized nodes, in order
    let heap = new MinHeap();

    let currentNode = null;
    let pending = [];          // neighbours of currentNode still to relax
    let lastUpdated = null;    // node whose distance changed in the latest step
    let activeEdge = null;     // edge used in the latest step
    let highlightPath = [];    // path drawn on the graph

    let algoStarted = false;
    let algoFinished = false;

    // =====================================================
    // SMALL HELPERS
    // =====================================================

    function edgeKey(a, b) {
        return a < b ? `${a}|${b}` : `${b}|${a}`;
    }

    // Avoid floating point noise such as 0.30000000000000004.
    function clean(value) {
        return Number.isFinite(value) ? parseFloat(value.toFixed(6)) : value;
    }

    // Long form for sentences, short form for compact chips.
    function fmt(value) {
        return value === Infinity ? "Infinity" : String(clean(value));
    }

    function fmtShort(value) {
        return value === Infinity ? "∞" : String(clean(value));
    }

    // Path from the source to a node, following prev links.
    function pathTo(node) {
        const path = [];
        let cursor = node;
        let guard = 0;

        while (cursor !== null && cursor !== undefined && guard <= nodes.length) {
            path.unshift(cursor);
            cursor = prev[cursor];
            guard++;
        }

        return path;
    }

    function pathText(path) {
        return path.join(" → ");
    }

    // =====================================================
    // DESCRIPTION RENDERING
    // opts: { title, message, pathLabel, path, cost, facts, result }
    // =====================================================

    function showDescription(opts) {
        if (descriptionTitle) {
            descriptionTitle.textContent = opts.title;
        }

        if (stepDescription) {
            stepDescription.textContent = opts.message;
        }

        // ---- Path box: current path and total cost ----
        if (pathBox) {
            pathBox.replaceChildren();

            if (opts.path && opts.path.length > 0) {
                pathBox.hidden = false;

                const label = document.createElement("span");
                label.className = "path-label";
                label.textContent = opts.pathLabel || "Current path";
                pathBox.appendChild(label);

                const row = document.createElement("div");
                row.className = "path-row";

                opts.path.forEach((node, index) => {
                    if (index > 0) {
                        const arrow = document.createElement("span");
                        arrow.className = "path-arrow";
                        arrow.textContent = "→";
                        row.appendChild(arrow);
                    }

                    const chip = document.createElement("span");
                    chip.className = "path-chip";
                    chip.textContent = node;
                    row.appendChild(chip);
                });

                pathBox.appendChild(row);

                if (opts.cost !== undefined) {
                    const cost = document.createElement("span");
                    cost.className = "path-cost";
                    cost.textContent = `Total cost: ${fmt(opts.cost)}`;
                    pathBox.appendChild(cost);
                }
            } else {
                pathBox.hidden = true;
            }
        }

        // ---- Fact rows ----
        if (descriptionFacts) {
            descriptionFacts.replaceChildren();

            (opts.facts || []).forEach(fact => {
                descriptionFacts.appendChild(makeFactRow(fact));
            });

            if (opts.result) {
                const banner = document.createElement("div");

                banner.className = `result-banner result-${opts.result.tone}`;

                const label = document.createElement("span");
                label.textContent = "Result";

                const value = document.createElement("strong");
                value.textContent = opts.result.text;

                banner.appendChild(label);
                banner.appendChild(value);
                descriptionFacts.appendChild(banner);
            }
        }
    }

    function makeFactRow(fact) {
        const row = document.createElement(fact.onClick ? "button" : "div");

        row.className = `fact-row fact-${fact.tone || "info"}`;

        if (fact.onClick) {
            row.type = "button";
            row.classList.add("is-clickable");
            row.addEventListener("click", fact.onClick);
        }

        const label = document.createElement("span");
        label.className = "fact-label";
        label.textContent = fact.label;

        const value = document.createElement("strong");
        value.className = "fact-value";
        value.textContent = fact.value;

        row.appendChild(label);
        row.appendChild(value);

        return row;
    }

    // =====================================================
    // STATUS HELPER
    // =====================================================

    function setStatus(message, type = "ready") {
        if (!graphStatus) return;

        graphStatus.textContent = message;

        const styles = {
            ready: { color: "#a9c9ff", background: "#1b3151", border: "#36527c" },
            active: { color: "#c8b5ff", background: "#382d61", border: "#7655b9" },
            complete: { color: "#6be2bd", background: "#104538", border: "#176e5b" }
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

        // ---------- nodes ----------

        if (!nodeText) {
            showError("Please enter at least one node.");
            return;
        }

        const rawNodes = nodeText
            .split(/[\s,]+/)
            .map(node => node.trim().toUpperCase())
            .filter(Boolean);

        const badNode = rawNodes.find(node => !/^[A-Z0-9_]+$/.test(node));

        if (badNode) {
            showError(
                `Invalid node name "${badNode}". Use letters, numbers or underscores only.`
            );
            return;
        }

        const uniqueNodes = [...new Set(rawNodes)];

        if (uniqueNodes.length === 0) {
            showError("Please enter valid nodes.");
            return;
        }

        // ---------- source ----------

        if (!startText) {
            showError("Please enter a starting node.");
            return;
        }

        if (!uniqueNodes.includes(startText)) {
            showError(`Starting node "${startText}" does not exist in the node list.`);
            return;
        }

        // ---------- weighted edges (parsed into temporary variables) ----------

        const newAdjacency = {};
        const newWeightOf = {};
        const newEdges = [];

        uniqueNodes.forEach(node => {
            newAdjacency[node] = [];
        });

        const lines = edgeText
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean);

        for (const line of lines) {
            // Accepted: A-B:4   A-B 4   A-B,4   A B 4
            let match = line.match(
                /^([A-Za-z0-9_]+)\s*-\s*([A-Za-z0-9_]+)\s*[:,\s]\s*(\S+)$/
            );

            if (!match) {
                match = line.match(
                    /^([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)\s+(\S+)$/
                );
            }

            if (!match) {
                if (/^[A-Za-z0-9_]+\s*-\s*[A-Za-z0-9_]+\s*:?$/.test(line)) {
                    showError(
                        `Edge "${line}" is missing a weight. Use NODE-NODE:WEIGHT, for example A-B:4.`
                    );
                } else {
                    showError(
                        `Invalid edge "${line}". Use NODE-NODE:WEIGHT, for example A-B:4.`
                    );
                }
                return;
            }

            const from = match[1].toUpperCase();
            const to = match[2].toUpperCase();
            const weightText = match[3];

            if (!uniqueNodes.includes(from) || !uniqueNodes.includes(to)) {
                const unknown = !uniqueNodes.includes(from) ? from : to;

                showError(
                    `Edge "${line}" uses node "${unknown}", which is not in the node list.`
                );
                return;
            }

            if (from === to) {
                showError(`Edge "${line}" connects a node to itself.`);
                return;
            }

            const weight = Number(weightText);

            if (!Number.isFinite(weight)) {
                showError(
                    `Edge "${line}" has an invalid weight "${weightText}". Use a number such as 4 or 2.5.`
                );
                return;
            }

            if (weight < 0) {
                showError(
                    `Edge "${line}" has a negative weight. Dijkstra only works with weights of 0 or more.`
                );
                return;
            }

            const key = edgeKey(from, to);

            if (key in newWeightOf) {
                showError(
                    `Edge "${from}-${to}" appears more than once. Each connection can be listed only once.`
                );
                return;
            }

            newWeightOf[key] = weight;
            newEdges.push({ from, to, weight });

            // Undirected graph
            newAdjacency[from].push({ node: to, weight });
            newAdjacency[to].push({ node: from, weight });
        }

        // ---------- input is valid: commit it ----------

        nodes = uniqueNodes;
        edges = newEdges;
        adjacency = newAdjacency;
        weightOf = newWeightOf;
        startNode = startText;

        // Predictable neighbour order (alphabetical).
        nodes.forEach(node => {
            adjacency[node].sort((a, b) => a.node.localeCompare(b.node));
        });

        resetState();

        renderGraph();

        if (nodeCount) nodeCount.textContent = `${nodes.length} Nodes`;
        if (edgeCount) edgeCount.textContent = `${edges.length} Edges`;

        setStatus("Graph Ready", "ready");

        showDescription({
            title: "Graph generated",
            message:
                `${nodes.length} nodes and ${edges.length} weighted edges. ` +
                `Paths will be calculated from ${startNode}. Press Start Dijkstra to begin.`,
            path: [startNode],
            pathLabel: "Source",
            cost: 0
        });

        updateInformation();
        updateGraphVisuals();
        updateProgress();

        if (startBtn) startBtn.disabled = false;
        if (nextBtn) nextBtn.disabled = true;

        // Scroll only after Generate Graph.
        // Start, Next Step and Reset never change the page scroll.
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
    // RESET ALGORITHM DATA
    // =====================================================

    function resetState() {
        dist = {};
        prev = {};

        nodes.forEach(node => {
            dist[node] = Infinity;
            prev[node] = null;
        });

        visited = [];
        heap = new MinHeap();

        currentNode = null;
        pending = [];
        lastUpdated = null;
        activeEdge = null;
        highlightPath = [];

        algoStarted = false;
        algoFinished = false;
    }

    // =====================================================
    // RENDER GRAPH (weighted)
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

        const nodeRadius = nodes.length > 12 ? 20 : 25;

        // Keep nodes and their distance labels inside the container.
        const radius = Math.max(
            40,
            Math.min(width, height) / 2 - nodeRadius - 30
        );

        const positions = {};

        nodes.forEach((node, index) => {
            const angle =
                (2 * Math.PI * index / nodes.length) - Math.PI / 2;

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
        svg.setAttribute("aria-label", "Weighted graph for Dijkstra's algorithm");

        // ---- edges ----
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

        // ---- edge weights (drawn after edges, before nodes) ----
        edges.forEach(edge => {
            const midX = (positions[edge.from].x + positions[edge.to].x) / 2;
            const midY = (positions[edge.from].y + positions[edge.to].y) / 2;

            const text = String(clean(edge.weight));

            const boxWidth = 14 + text.length * 8;
            const boxHeight = 20;

            const group = document.createElementNS(svgNS, "g");

            group.classList.add("graph-weight");
            group.dataset.from = edge.from;
            group.dataset.to = edge.to;

            const rect = document.createElementNS(svgNS, "rect");

            rect.setAttribute("x", midX - boxWidth / 2);
            rect.setAttribute("y", midY - boxHeight / 2);
            rect.setAttribute("width", boxWidth);
            rect.setAttribute("height", boxHeight);
            rect.setAttribute("rx", 6);
            rect.classList.add("graph-weight-box");

            const label = document.createElementNS(svgNS, "text");

            label.setAttribute("x", midX);
            label.setAttribute("y", midY);
            label.classList.add("graph-weight-text");
            label.textContent = text;

            group.appendChild(rect);
            group.appendChild(label);
            svg.appendChild(group);
        });

        // ---- nodes ----
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

            // Small distance label above the node.
            const distLabel = document.createElementNS(svgNS, "text");

            distLabel.setAttribute("x", positions[node].x);
            distLabel.setAttribute("y", positions[node].y - nodeRadius - 7);
            distLabel.classList.add("graph-dist-label");
            distLabel.dataset.node = node;
            distLabel.textContent = "∞";

            group.appendChild(circle);
            group.appendChild(text);
            group.appendChild(distLabel);

            // Label that keeps the source easy to identify.
            if (node === startNode) {
                const label = document.createElementNS(svgNS, "text");

                label.setAttribute("x", positions[node].x);
                label.setAttribute("y", positions[node].y + nodeRadius + 13);
                label.classList.add("graph-start-label");
                label.textContent = "SOURCE";

                group.appendChild(label);
            }

            svg.appendChild(group);
        });

        graphContainer.appendChild(svg);

        updateGraphVisuals();
    }

    // =====================================================
    // START DIJKSTRA
    // =====================================================

    function startDijkstra() {
        clearError();

        if (nodes.length === 0) {
            showError("Generate a graph first.");
            return;
        }

        resetState();

        dist[startNode] = 0;
        heap.push({ node: startNode, dist: 0 });

        algoStarted = true;

        highlightPath = [startNode];

        updateInformation();
        updateGraphVisuals();
        updateProgress();

        setStatus(`Started from ${startNode}`, "active");

        showDescription({
            title: "Initialize",
            message:
                `The source ${startNode} gets distance 0. Every other node starts at ` +
                `Infinity because no route to it is known yet. ${startNode} is added to the priority queue.`,
            path: [startNode],
            pathLabel: "Source",
            cost: 0,
            facts: [
                { label: "Distance to " + startNode, value: "0", tone: "visited" },
                { label: "All other nodes", value: "Infinity", tone: "muted" }
            ]
        });

        if (startBtn) startBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = false;
    }

    // =====================================================
    // NEXT STEP
    // One click is one operation: select a node OR relax one edge.
    // =====================================================

    function nextStep() {
        clearError();

        if (!algoStarted) {
            showError("Click Start Dijkstra first.");
            return;
        }

        if (algoFinished) {
            return;
        }

        if (pending.length > 0) {
            relaxNextEdge();
        } else {
            selectNextNode();
        }
    }

    // -----------------------------------------------------
    // SELECT the unvisited node with the smallest distance
    // -----------------------------------------------------

    function selectNextNode() {
        let entry = null;

        // Pop from the min-heap, skipping outdated entries.
        while (heap.size > 0) {
            const candidate = heap.pop();

            if (visited.includes(candidate.node)) continue;
            if (candidate.dist > dist[candidate.node]) continue;

            entry = candidate;
            break;
        }

        if (!entry) {
            finishAlgorithm();
            return;
        }

        const u = entry.node;

        visited.push(u);

        currentNode = u;
        lastUpdated = null;
        activeEdge = null;

        pending = adjacency[u]
            .filter(neighbor => !visited.includes(neighbor.node))
            .map(neighbor => neighbor.node);

        highlightPath = pathTo(u);

        setStatus(`Processing ${u}`, "active");

        const path = pathTo(u);

        let nextText;

        if (pending.length > 0) {
            nextText = `Next, its edges to ${pending.join(", ")} will be checked.`;
        } else {
            nextText = "It has no unvisited neighbours to update.";
        }

        showDescription({
            title: `Select node ${u}`,
            message:
                `${u} has the smallest tentative distance (${fmt(dist[u])}) among the unvisited nodes, ` +
                `so its shortest path is now final. ${nextText}`,
            pathLabel: "Shortest path",
            path,
            cost: dist[u],
            facts: [
                { label: "Final distance", value: fmt(dist[u]), tone: "visited" },
                {
                    label: "Edges to check",
                    value: pending.length ? pending.join(", ") : "none",
                    tone: "info"
                }
            ]
        });

        updateInformation();
        updateGraphVisuals();
        updateProgress();
    }

    // -----------------------------------------------------
    // RELAX one edge from the current node
    // -----------------------------------------------------

    function relaxNextEdge() {
        const u = currentNode;
        const v = pending.shift();

        const w = weightOf[edgeKey(u, v)];

        const newCost = clean(dist[u] + w);
        const previousCost = dist[v];

        const previousPath = previousCost === Infinity ? [] : pathTo(v);
        const candidatePath = pathTo(u).concat(v);

        const improved = newCost < previousCost;

        activeEdge = { from: u, to: v };
        highlightPath = candidatePath;

        let message;
        let result;

        if (improved) {
            dist[v] = newCost;
            prev[v] = u;
            heap.push({ node: v, dist: newCost });

            lastUpdated = v;

            message =
                `A shorter path to ${v} has been found through ${u}. ` +
                `The distance is updated from ${fmt(previousCost)} to ${fmt(newCost)}.`;

            result = { text: "Distance updated", tone: "updated" };

            setStatus(`Updated ${v}`, "active");
        } else {
            lastUpdated = null;

            if (newCost === previousCost) {
                message =
                    `The path through ${u} costs ${fmt(newCost)}, the same as the best known path to ${v}. ` +
                    `It is not cheaper, so the distance stays ${fmt(previousCost)}.`;
            } else {
                message =
                    `The path through ${u} costs ${fmt(newCost)}, which is more than the best known ` +
                    `${fmt(previousCost)} to ${v}. The distance stays ${fmt(previousCost)}.`;
            }

            result = { text: "No change", tone: "same" };

            setStatus(`Checked ${u} to ${v}`, "active");
        }

        showDescription({
            title: `Check edge ${u} to ${v}`,
            message,
            pathLabel: "Path being checked",
            path: candidatePath,
            cost: newCost,
            facts: [
                {
                    label: "Calculation",
                    value: `dist[${u}] + w = ${fmt(dist[u])} + ${fmt(w)} = ${fmt(newCost)}`,
                    tone: "info"
                },
                {
                    label: "Previous distance",
                    value: previousCost === Infinity
                        ? "Infinity (no path yet)"
                        : `${fmt(previousCost)} via ${pathText(previousPath)}`,
                    tone: "muted"
                },
                {
                    label: "New distance",
                    value: fmt(dist[v]),
                    tone: improved ? "visited" : "warn"
                }
            ],
            result
        });

        updateInformation();
        updateGraphVisuals();
        updateProgress();
    }

    // =====================================================
    // FINISH
    // =====================================================

    function finishAlgorithm() {
        algoFinished = true;

        currentNode = null;
        pending = [];
        lastUpdated = null;
        activeEdge = null;
        highlightPath = [];

        setStatus("Dijkstra Completed", "complete");

        // One row per destination: shortest path and total cost, or "no path".
        const rows = nodes
            .filter(node => node !== startNode)
            .map(node => {
                if (dist[node] === Infinity) {
                    return {
                        label: node,
                        value: "no path exists",
                        tone: "muted"
                    };
                }

                const path = pathTo(node);

                return {
                    label: node,
                    value: `${pathText(path)}  (cost ${fmt(dist[node])})`,
                    tone: "visited",
                    onClick: () => {
                        highlightPath = path;
                        updateGraphVisuals();
                    }
                };
            });

        const unreachable = nodes.filter(node => dist[node] === Infinity);

        let message =
            `The priority queue is empty, so every reachable node has its shortest path from ${startNode}.`;

        if (unreachable.length > 0) {
            message += ` ${unreachable.join(", ")} cannot be reached.`;
        }

        if (rows.length > 0) {
            message += " Click a row to show that path on the graph.";
        }

        showDescription({
            title: "Complete",
            message,
            facts: rows.length > 0
                ? rows
                : [{ label: "Result", value: "Only the source exists", tone: "muted" }]
        });

        if (nextBtn) nextBtn.disabled = true;

        updateInformation();
        updateGraphVisuals();
        updateProgress();
    }

    // =====================================================
    // RESET BUTTON
    // =====================================================

    function resetDijkstra() {
        if (nodes.length === 0) {
            showError("Generate a graph first.");
            return;
        }

        resetState();

        updateInformation();
        updateGraphVisuals();
        updateProgress();

        setStatus("Ready", "ready");

        showDescription({
            title: "Reset",
            message: `Everything is cleared. Press Start Dijkstra to begin again from ${startNode}.`,
            path: [startNode],
            pathLabel: "Source",
            cost: 0
        });

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
    // UPDATE DISTANCE / CURRENT / VISITED CARDS
    // =====================================================

    function updateInformation() {
        // ---------------- DISTANCE ----------------

        if (distanceDisplay) {
            distanceDisplay.replaceChildren();

            if (nodes.length === 0) {
                showEmpty(distanceDisplay, "Generate a graph");
            } else {
                nodes.forEach(node => {
                    let state = "dist-unknown";

                    if (visited.includes(node)) {
                        state = "dist-final";
                    } else if (node === lastUpdated) {
                        state = "dist-updated";
                    } else if (dist[node] !== Infinity) {
                        state = "dist-tentative";
                    }

                    const chip = document.createElement("span");
                    chip.className = `chip dist-chip ${state}`;

                    const name = document.createElement("b");
                    name.textContent = node;

                    const value = document.createElement("em");
                    value.textContent = fmtShort(dist[node]);

                    chip.appendChild(name);
                    chip.appendChild(value);
                    distanceDisplay.appendChild(chip);
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
                showEmpty(currentDisplay, algoFinished ? "Done" : "No node yet");
            }
        }

        // ---------------- VISITED (finalized) ----------------

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
    // UPDATE GRAPH COLORS, DISTANCES AND PATHS
    // =====================================================

    function updateGraphVisuals() {
        const graphNodes = document.querySelectorAll(".graph-node");

        graphNodes.forEach(circle => {
            const node = circle.dataset.node;

            circle.classList.remove(
                "node-start",
                "node-current",
                "node-visited",
                "node-tentative",
                "node-updated"
            );

            if (node === startNode) {
                circle.classList.add("node-start");
            }

            if (visited.includes(node)) {
                circle.classList.add("node-visited");
            } else if (dist[node] !== undefined && dist[node] !== Infinity) {
                circle.classList.add("node-tentative");
            }

            if (node === lastUpdated) {
                circle.classList.add("node-updated");
            }

            if (node === currentNode) {
                circle.classList.add("node-current");
            }
        });

        // Distance labels above nodes.
        document.querySelectorAll(".graph-dist-label").forEach(label => {
            const node = label.dataset.node;
            const value = dist[node];

            label.textContent = value === undefined ? "∞" : fmtShort(value);

            label.classList.toggle(
                "is-final",
                visited.includes(node)
            );
        });

        // Edge sets
        const pathEdges = new Set();

        for (let i = 0; i < highlightPath.length - 1; i++) {
            pathEdges.add(edgeKey(highlightPath[i], highlightPath[i + 1]));
        }

        const treeEdges = new Set();

        visited.forEach(node => {
            if (prev[node]) {
                treeEdges.add(edgeKey(node, prev[node]));
            }
        });

        const activeKey = activeEdge
            ? edgeKey(activeEdge.from, activeEdge.to)
            : null;

        document.querySelectorAll(".graph-edge").forEach(edge => {
            const key = edgeKey(edge.dataset.from, edge.dataset.to);

            edge.classList.toggle("edge-tree", treeEdges.has(key));
            edge.classList.toggle("edge-path", pathEdges.has(key));
            edge.classList.toggle("edge-active", key === activeKey);
        });

        document.querySelectorAll(".graph-weight").forEach(group => {
            const key = edgeKey(group.dataset.from, group.dataset.to);

            group.classList.toggle("weight-path", pathEdges.has(key));
            group.classList.toggle("weight-active", key === activeKey);
        });
    }

    // =====================================================
    // UPDATE PROGRESS (finalized nodes)
    // =====================================================

    function updateProgress() {
        const total = nodes.length;
        const done = visited.length;

        const percent = total > 0
            ? Math.round((done / total) * 100)
            : 0;

        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }

        if (progressPercent) {
            progressPercent.textContent = `${percent}%`;
        }

        if (progressText) {
            progressText.textContent = `${done}/${total} finalized`;
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

    if (generateBtn) generateBtn.addEventListener("click", generateGraph);
    if (startBtn) startBtn.addEventListener("click", startDijkstra);
    if (nextBtn) nextBtn.addEventListener("click", nextStep);
    if (resetBtn) resetBtn.addEventListener("click", resetDijkstra);

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
    renderPqDemo();
    updateInformation();
    updateProgress();

    if (startBtn) startBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    setStatus("Ready", "ready");

});