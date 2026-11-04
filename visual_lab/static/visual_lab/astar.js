/* A* Search visualizer.
   Part 1 is pure algorithm code (also loadable in Node for tests).
   Part 2 is the page UI and only runs in the browser. */
(function (root) {
    "use strict";

    /* =====================================================
       Part 1: algorithm core
    ===================================================== */

    var EPS = 1e-9;
    var STRAIGHT = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    var DIAGONAL = [[-1, 1], [1, 1], [1, -1], [-1, -1]];

    function heuristicValue(kind, r, c, goalR, goalC) {
        var dr = Math.abs(r - goalR);
        var dc = Math.abs(c - goalC);
        if (kind === "euclidean") { return Math.sqrt(dr * dr + dc * dc); }
        if (kind === "chebyshev") { return Math.max(dr, dc); }
        return dr + dc; // manhattan
    }

    // Manhattan overestimates a diagonal move (2 > 1.41), so it is not admissible there.
    function isHeuristicValid(kind, diagonal) {
        return !(kind === "manhattan" && diagonal);
    }

    function fmt(x) {
        return Number.isInteger(x) ? String(x) : x.toFixed(2);
    }

    // Binary min-heap. Order: lowest f, then lowest h, then earliest inserted.
    function entryLess(a, b) {
        if (Math.abs(a.f - b.f) > EPS) { return a.f < b.f; }
        if (Math.abs(a.h - b.h) > EPS) { return a.h < b.h; }
        return a.seq < b.seq;
    }

    function MinHeap() { this.items = []; }
    MinHeap.prototype.push = function (item) {
        var a = this.items;
        a.push(item);
        var i = a.length - 1;
        while (i > 0) {
            var p = (i - 1) >> 1;
            if (!entryLess(a[i], a[p])) { break; }
            var t = a[i]; a[i] = a[p]; a[p] = t;
            i = p;
        }
    };
    MinHeap.prototype.pop = function () {
        var a = this.items;
        if (!a.length) { return null; }
        var top = a[0];
        var last = a.pop();
        if (a.length) {
            a[0] = last;
            var i = 0;
            for (;;) {
                var l = 2 * i + 1, r = l + 1, m = i;
                if (l < a.length && entryLess(a[l], a[m])) { m = l; }
                if (r < a.length && entryLess(a[r], a[m])) { m = r; }
                if (m === i) { break; }
                var t = a[i]; a[i] = a[m]; a[m] = t;
                i = m;
            }
        }
        return top;
    };
    Object.defineProperty(MinHeap.prototype, "size", {
        get: function () { return this.items.length; }
    });

    /* cfg: { rows, cols, walls (Uint8Array), start, goal, heuristic, diagonal }
       Returns every step as a snapshot, so the UI can move backward and forward. */
    function runAStar(cfg) {
        var rows = cfg.rows, cols = cfg.cols, walls = cfg.walls;
        var start = cfg.start, goal = cfg.goal;
        var diagonal = !!cfg.diagonal;
        var n = rows * cols;
        var goalR = Math.floor(goal / cols), goalC = goal % cols;

        var hArr = new Float64Array(n);
        for (var i = 0; i < n; i++) {
            hArr[i] = heuristicValue(cfg.heuristic, Math.floor(i / cols), i % cols, goalR, goalC);
        }

        var g = new Float64Array(n).fill(Infinity);
        var f = new Float64Array(n).fill(Infinity);
        var state = new Uint8Array(n);          // 0 unseen, 1 open, 2 closed
        var parent = new Int32Array(n).fill(-1);
        var seq = new Int32Array(n);
        var closedOrder = [];
        var heap = new MinHeap();
        var steps = [];
        var counter = 0, selected = 0, generated = 0, iteration = 0;

        function label(id) { return "(" + (Math.floor(id / cols) + 1) + ", " + (id % cols + 1) + ")"; }

        function openSorted() {
            var open = [];
            for (var k = 0; k < n; k++) { if (state[k] === 1) { open.push(k); } }
            open.sort(function (a, b) {
                if (Math.abs(f[a] - f[b]) > EPS) { return f[a] - f[b]; }
                if (Math.abs(hArr[a] - hArr[b]) > EPS) { return hArr[a] - hArr[b]; }
                return seq[a] - seq[b];
            });
            return open;
        }

        function snapshot(extra) {
            var s = {
                g: g.slice(), f: f.slice(), state: state.slice(), parent: parent.slice(),
                open: openSorted(), closed: closedOrder.slice(),
                iteration: iteration, current: -1, neighbors: [], details: [], path: null,
                visited: selected, generated: generated
            };
            for (var key in extra) { s[key] = extra[key]; }
            steps.push(s);
            return s;
        }

        function push(id) {
            seq[id] = counter++;
            heap.push({ id: id, f: f[id], h: hArr[id], seq: seq[id] });
        }

        // Initialization
        g[start] = 0;
        f[start] = hArr[start];
        state[start] = 1;
        push(start);
        generated = 1;
        snapshot({
            type: "init", line: 4, running: [2, 3, 4, 5],
            text: "A* begins by placing the start node " + label(start) + " in the Open Set. Its g is 0, so f = g + h = 0 + " +
                fmt(hArr[start]) + " = " + fmt(f[start]) + "."
        });

        var result = { found: false, path: [], cost: null, visited: 0, generated: 0 };

        for (;;) {
            var entry = null;
            while (heap.size) {
                var e = heap.pop();
                if (state[e.id] === 1 && e.seq === seq[e.id]) { entry = e; break; }  // skip stale entries
            }

            if (!entry) {
                snapshot({
                    type: "fail", line: 19, running: [19],
                    text: "The Open Set is empty and the goal was never selected, so no path exists between " +
                        label(start) + " and " + label(goal) + "."
                });
                break;
            }

            var cur = entry.id;
            selected++;
            iteration++;

            var tied = 0, openCount = 0;
            for (var k = 0; k < n; k++) {
                if (state[k] === 1) {
                    openCount++;
                    if (k !== cur && Math.abs(f[k] - f[cur]) < EPS) { tied++; }
                }
            }
            var selectText = "The Open Set holds " + openCount + " node" + (openCount === 1 ? "" : "s") + ". " +
                label(cur) + " has the lowest f = " + fmt(f[cur]) + " (g = " + fmt(g[cur]) + ", h = " +
                fmt(hArr[cur]) + "), so A* selects it.";
            if (tied > 0) {
                selectText += " " + tied + " other node" + (tied === 1 ? " has" : "s have") +
                    " the same f. The tie goes to the lowest h, then to the node added earlier.";
            }
            if (cur === goal) { selectText += " This is the goal."; }
            snapshot({ type: "select", current: cur, line: 7, running: [6, 7], text: selectText });

            if (cur === goal) {
                state[cur] = 2;
                closedOrder.push(cur);
                var path = [];
                for (var p = goal; p !== -1; p = parent[p]) { path.push(p); }
                path.reverse();
                result = { found: true, path: path, cost: g[goal], visited: selected, generated: generated };
                snapshot({
                    type: "found", current: cur, line: 9, running: [8, 9], path: path,
                    text: "The goal " + label(goal) + " was selected, so the best path is final. Following parent links back to the start gives " +
                        path.length + " nodes with a total cost of " + fmt(g[goal]) + "."
                });
                break;
            }

            state[cur] = 2;
            closedOrder.push(cur);

            var cr = Math.floor(cur / cols), cc = cur % cols;
            var dirs = diagonal ? STRAIGHT.concat(DIAGONAL) : STRAIGHT;
            var neighbors = [], details = [];
            var cNew = 0, cImproved = 0, cKept = 0, cClosed = 0, cBlocked = 0;

            for (var d = 0; d < dirs.length; d++) {
                var dr = dirs[d][0], dc = dirs[d][1];
                var nr = cr + dr, nc = cc + dc;
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) { continue; }
                var nid = nr * cols + nc;
                var isDiag = dr !== 0 && dc !== 0;

                if (walls[nid]) { cBlocked++; continue; }
                if (isDiag && (walls[cr * cols + nc] || walls[nr * cols + cc])) {
                    cBlocked++;
                    details.push(label(nid) + " is skipped: a diagonal move cannot cut the corner of a wall.");
                    continue;
                }
                if (state[nid] === 2) {
                    cClosed++;
                    neighbors.push(nid);
                    details.push(label(nid) + " is already in the Closed Set. Skipped.");
                    continue;
                }

                var tentative = g[cur] + (isDiag ? Math.SQRT2 : 1);
                neighbors.push(nid);

                if (state[nid] === 0) {
                    g[nid] = tentative;
                    f[nid] = tentative + hArr[nid];
                    parent[nid] = cur;
                    state[nid] = 1;
                    push(nid);
                    generated++;
                    cNew++;
                    details.push(label(nid) + " is new: g = " + fmt(g[nid]) + ", h = " + fmt(hArr[nid]) +
                        ", f = " + fmt(f[nid]) + ". Added to the Open Set.");
                } else if (tentative < g[nid] - EPS) {
                    var oldG = g[nid];
                    g[nid] = tentative;
                    f[nid] = tentative + hArr[nid];
                    parent[nid] = cur;
                    push(nid);
                    cImproved++;
                    details.push(label(nid) + " has a cheaper route: g went from " + fmt(oldG) + " to " + fmt(g[nid]) +
                        ", so f = " + fmt(f[nid]) + ". Parent updated.");
                } else {
                    cKept++;
                    details.push(label(nid) + " already has g = " + fmt(g[nid]) + ". The new route costs " +
                        fmt(tentative) + ", which is not better.");
                }
            }

            snapshot({
                type: "expand", current: cur, line: 11, running: [10, 11, 12, 13, 14, 15, 16, 17, 18],
                neighbors: neighbors, details: details,
                text: label(cur) + " moves to the Closed Set. Its neighbors: " + cNew + " new, " + cImproved +
                    " improved, " + cKept + " unchanged, " + cClosed + " already closed, " + cBlocked + " blocked."
            });
        }

        return {
            steps: steps,
            found: result.found,
            path: result.path,
            cost: result.cost,
            visited: selected,
            generated: generated
        };
    }

    function pathCostOf(cfg, path) {
        var total = 0;
        for (var i = 1; i < path.length; i++) {
            var a = path[i - 1], b = path[i];
            var dr = Math.abs(Math.floor(a / cfg.cols) - Math.floor(b / cfg.cols));
            var dc = Math.abs((a % cfg.cols) - (b % cfg.cols));
            total += (dr && dc) ? Math.SQRT2 : 1;
        }
        return total;
    }

    var EXAMPLES = {
        open: [
            "..............",
            "..............",
            "..............",
            ".S..........G.",
            "..............",
            "..............",
            "..............",
            ".............."
        ],
        gap: [
            ".......#........",
            ".......#........",
            "..S....#......G.",
            ".......#........",
            ".......#........",
            ".......#........",
            ".......#........",
            ".......#........",
            "................",
            "................"
        ],
        trap: [
            "................",
            "................",
            ".........#####..",
            ".........#......",
            "..S......#..G...",
            ".........#......",
            ".........#......",
            ".........#####..",
            "................",
            "................"
        ],
        maze: [
            "S..#...........",
            ".#.#.#########.",
            ".#...#.......#.",
            ".#####.#####.#.",
            ".......#...#.#.",
            "######.#.#.#.#.",
            ".......#.#...#.",
            ".########.#####",
            "..............G"
        ],
        blocked: [
            "..............",
            "..............",
            "..........###.",
            "..S.......#G#.",
            "..........###.",
            "..............",
            "..............",
            ".............."
        ]
    };

    function parseExample(lines) {
        var rows = lines.length, cols = lines[0].length;
        var walls = new Uint8Array(rows * cols);
        var start = 0, goal = rows * cols - 1;
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var ch = lines[r].charAt(c);
                if (ch === "#") { walls[r * cols + c] = 1; }
                if (ch === "S") { start = r * cols + c; }
                if (ch === "G") { goal = r * cols + c; }
            }
        }
        return { rows: rows, cols: cols, walls: walls, start: start, goal: goal };
    }

    var core = {
        runAStar: runAStar, heuristicValue: heuristicValue, isHeuristicValid: isHeuristicValid,
        pathCostOf: pathCostOf, parseExample: parseExample, EXAMPLES: EXAMPLES, fmt: fmt
    };

    if (typeof module !== "undefined" && module.exports) { module.exports = core; }

    if (typeof document === "undefined" || !document.getElementById("as-root")) { return; }

    /* =====================================================
       Part 2: page UI
    ===================================================== */

    var $ = function (id) { return document.getElementById(id); };
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- Theory content ---------- */

    var CONCEPTS = [
        { tab: "What is A*?", title: "What is A* Search?",
          body: "A* is a best-first graph search that finds a lowest-cost path from a start node to a goal node. It always expands the open node that looks cheapest overall, using the cost so far plus an estimate of the cost still to go.",
          example: "Example: on a map, A* picks the road junction that is both cheap to reach and close to the destination." },
        { tab: "Why use it?", title: "Why is A* used?",
          body: "Dijkstra explores in every direction. A* uses knowledge about the goal to explore fewer nodes while still returning an optimal path. That matters in games, maps and robots, where time is limited.",
          example: "Try the U-shaped trap example below, then compare how many nodes are visited with different heuristics." },
        { tab: "Heuristic", title: "What is a heuristic?",
          body: "A heuristic is an educated guess. Here it estimates how far a node is from the goal. It must be cheap to compute, and it should never promise more than is possible.",
          example: "On a grid, \"how many blocks away is the goal?\" is a heuristic." },
        { tab: "g(n)", title: "What is g(n)?",
          body: "g(n) is the exact cost of the best path found so far from the start to node n. Each straight move costs 1. A diagonal move costs 1.41 when 8-direction movement is on.",
          example: "Three steps right from the start gives g = 3 for that cell." },
        { tab: "h(n)", title: "What is h(n)?",
          body: "h(n) is the estimated cost from node n to the goal. With Manhattan distance, h = |row difference| + |column difference|. At the goal, h is 0.",
          example: "A node 2 rows and 5 columns from the goal has h = 7 with Manhattan distance." },
        { tab: "f(n)", title: "What is f(n) = g(n) + h(n)?",
          body: "f(n) is the estimated total cost of the cheapest path from the start to the goal that goes through n. It joins what you already paid (g) with what you expect to pay (h).",
          example: "g = 4 and h = 6 give f = 10. Use the calculator on the right to try other values." },
        { tab: "Open and closed", title: "Open Set and Closed Set",
          body: "The Open Set holds nodes that have been discovered but not yet expanded. The Closed Set holds nodes that A* has already expanded, so their best cost is settled.",
          visual: "sets" },
        { tab: "Choosing next", title: "How A* selects the next node",
          body: "A* removes the node with the lowest f from the Open Set. This visualizer breaks ties by choosing the lowest h first, then the node that was added earlier, so runs are repeatable.",
          example: "Two nodes with f = 8: the one closer to the goal (smaller h) goes first." },
        { tab: "Shortest path", title: "How A* finds the shortest path",
          body: "Each node remembers the neighbor it was reached from (its parent). When the goal is selected, A* follows parents back to the start. With an admissible heuristic no cheaper path can exist, so that path is optimal.",
          example: "The final path is drawn in violet in the visualization." },
        { tab: "Admissible", title: "Admissible and consistent heuristics",
          body: "A heuristic is admissible if h(n) never exceeds the true cost to the goal. It is consistent if h(n) is at most the cost of a move to a neighbor m plus h(m). Consistent heuristics are admissible, and they let A* expand each node at most once.",
          visual: "heuristics" },
        { tab: "Complexity", title: "Time and space complexity",
          body: "In the worst case A* may expand every node. With a binary heap that is O(E log V) time and O(V) space for a graph with V nodes and E edges. A good heuristic expands far fewer nodes in practice.",
          example: "With h = 0, A* is Dijkstra. The better h is, the fewer nodes are visited." },
        { tab: "Pros and cons", title: "Advantages and limitations",
          body: "Advantages: optimal when h is admissible, usually much faster than Dijkstra, and flexible because you choose the heuristic. Limitations: it needs a good heuristic, it stores every open and closed node in memory, and a poor heuristic gives little speed-up.",
          example: "Overestimating heuristics can be faster but may return a path that is not the shortest." }
    ];

    var APPS = [
        { tab: "GPS navigation", title: "GPS navigation and route planning",
          body: "Road maps are graphs. A* uses the straight-line distance to the destination as h(n), so it finds a fast route without searching the whole country." },
        { tab: "Robotics", title: "Robotics and autonomous navigation",
          body: "A robot plans over a map of free space and obstacles. A* gives it a short, collision-free route, and the plan is recomputed when the map changes." },
        { tab: "Game pathfinding", title: "Video game pathfinding",
          body: "Characters in strategy and role-playing games use A* on grids or navigation meshes to walk around walls and each other in real time." },
        { tab: "Maze solving", title: "Maze solving",
          body: "A maze is a grid with walls. A* heads toward the exit first and only backtracks when it hits a dead end, which beats exploring blindly." },
        { tab: "Network routing", title: "Network routing and search problems",
          body: "Any problem with states, moves and costs can use A*: routing packets, planning tasks, or solving puzzles such as the 8 Puzzle with a misplaced-tiles heuristic." }
    ];

    var PSEUDO = [
        ["function AStar(start, goal):", 0],
        ["open \u2190 priority queue ordered by f", 1],
        ["closed \u2190 empty set", 1],
        ["g[start] \u2190 0;  f[start] \u2190 h(start)", 1],
        ["insert start into open", 1],
        ["while open is not empty:", 1],
        ["current \u2190 node in open with lowest f", 2],
        ["if current = goal:", 2],
        ["return reconstruct_path(parent, goal)", 3],
        ["move current from open to closed", 2],
        ["for each neighbor of current:", 2],
        ["if neighbor is a wall or in closed: continue", 3],
        ["tentative_g \u2190 g[current] + cost(current, neighbor)", 3],
        ["if neighbor not in open or tentative_g < g[neighbor]:", 3],
        ["parent[neighbor] \u2190 current", 4],
        ["g[neighbor] \u2190 tentative_g", 4],
        ["f[neighbor] \u2190 g[neighbor] + h(neighbor)", 4],
        ["if neighbor not in open: insert into open", 4],
        ["return failure   // open is empty, no path", 1]
    ];

    var LINE_EXPLAIN = [
        "Defines the search. It takes a start node and a goal node and returns the cheapest path.",
        "The Open Set is a priority queue. The node with the smallest f(n) always comes out first.",
        "The Closed Set remembers nodes that were already expanded so they are not processed twice.",
        "The start costs nothing to reach, so g = 0. Its f is just the heuristic estimate h(start).",
        "The start node is the first node waiting to be expanded.",
        "Keep searching while there are discovered nodes that have not been expanded.",
        "Pick the open node with the lowest f = g + h. Ties go to the lowest h, then the earliest added.",
        "Check whether the selected node is the goal.",
        "The goal was selected, so follow parent links back to the start. That path is the answer.",
        "The node is now being expanded, so it moves from the Open Set to the Closed Set.",
        "Look at every neighbor that can be reached in one move.",
        "Walls cannot be entered and closed nodes are already settled, so skip them.",
        "The cost to reach the neighbor through the current node is g[current] plus the move cost.",
        "Use this route if the neighbor is new, or if the route is cheaper than the best one found before.",
        "Remember that the best route to the neighbor comes through the current node.",
        "Store the new, cheaper cost to reach the neighbor.",
        "Recalculate the neighbor's priority: cost so far plus estimate to go.",
        "New nodes join the Open Set. Nodes already in it just get their new f value.",
        "The Open Set ran out before the goal was selected, so the goal cannot be reached."
    ];

    var HEURISTIC_NOTES = {
        "4:manhattan": "Manhattan is exact on an open 4-direction grid. It is admissible and consistent here.",
        "4:euclidean": "Euclidean never overestimates on a 4-direction grid. It is admissible and consistent, but explores more nodes than Manhattan.",
        "4:chebyshev": "Chebyshev never overestimates on a 4-direction grid. It is admissible and consistent, but is a weaker guide than Manhattan.",
        "8:euclidean": "Euclidean never overestimates when diagonals cost 1.41. It is admissible and consistent.",
        "8:chebyshev": "Chebyshev never overestimates when diagonals cost 1.41. It is admissible and consistent."
    };

    /* ---------- Small helpers ---------- */

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text !== undefined) { node.textContent = text; }
        return node;
    }

    function labelOf(id, cols) {
        return "(" + (Math.floor(id / cols) + 1) + ", " + (id % cols + 1) + ")";
    }

    function clampInt(value, min, max) {
        var n = parseInt(value, 10);
        if (isNaN(n)) { return null; }
        return n < min || n > max ? null : n;
    }

    /* ---------- Tabs (used by theory and applications) ---------- */

    function buildTabs(container, items, onSelect, idPrefix) {
        var buttons = items.map(function (item, i) {
            var b = el("button", "as-tab", item.tab);
            b.type = "button";
            b.id = idPrefix + i;
            b.setAttribute("role", "tab");
            b.addEventListener("click", function () { select(i); });
            b.addEventListener("keydown", function (e) {
                var next = null;
                if (e.key === "ArrowRight" || e.key === "ArrowDown") { next = (i + 1) % items.length; }
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") { next = (i - 1 + items.length) % items.length; }
                if (next !== null) { e.preventDefault(); select(next); buttons[next].focus(); }
            });
            container.appendChild(b);
            return b;
        });

        function select(index) {
            buttons.forEach(function (b, j) {
                b.classList.toggle("is-active", j === index);
                b.setAttribute("aria-selected", j === index ? "true" : "false");
                b.tabIndex = j === index ? 0 : -1;
            });
            onSelect(items[index]);
        }
        select(0);
    }

    function buildVisual(kind) {
        var box = el("div", "as-visual");
        if (kind === "sets") {
            var open = el("div", "as-visual__col");
            open.appendChild(el("strong", "", "Open Set"));
            open.appendChild(el("span", "as-mini as-mini--open", "(2, 3)  f = 5"));
            open.appendChild(el("span", "as-mini as-mini--open", "(3, 2)  f = 7"));
            var closed = el("div", "as-visual__col");
            closed.appendChild(el("strong", "", "Closed Set"));
            closed.appendChild(el("span", "as-mini as-mini--closed", "(1, 1)  start"));
            closed.appendChild(el("span", "as-mini as-mini--closed", "(1, 2)"));
            box.append(open, closed);
        } else if (kind === "heuristics") {
            var table = el("table", "as-table");
            var head = el("tr");
            ["Heuristic", "4 directions", "8 directions"].forEach(function (t) { head.appendChild(el("th", "", t)); });
            table.appendChild(el("thead")).appendChild(head);
            var body = el("tbody");
            [["Manhattan", "valid", "not admissible"],
             ["Euclidean", "valid", "valid"],
             ["Chebyshev", "valid", "valid"]].forEach(function (row) {
                var tr = el("tr");
                row.forEach(function (t, i) { tr.appendChild(el(i === 0 ? "th" : "td", "", t)); });
                body.appendChild(tr);
            });
            table.appendChild(body);
            box.appendChild(table);
        }
        return box;
    }

    function initTheory() {
        var title = $("as-concept-title"), body = $("as-concept-body"), panel = $("as-concept-panel");
        buildTabs($("as-concept-tabs"), CONCEPTS, function (item) {
            title.textContent = item.title;
            body.textContent = item.body;
            Array.prototype.slice.call(panel.querySelectorAll(".as-example, .as-visual")).forEach(function (n) { n.remove(); });
            if (item.example) { panel.appendChild(el("p", "as-example", item.example)); }
            if (item.visual) { panel.appendChild(buildVisual(item.visual)); }
        }, "as-ctab-");

        var g = $("as-calc-g"), h = $("as-calc-h");
        function update() {
            var gv = Number(g.value), hv = Number(h.value), total = gv + hv;
            $("as-calc-gv").textContent = gv;
            $("as-calc-hv").textContent = hv;
            $("as-calc-f").textContent = total;
            var scale = total === 0 ? 1 : 100 / 40;
            $("as-bar-g").style.width = (gv * scale) + "%";
            $("as-bar-h").style.width = (hv * scale) + "%";
        }
        g.addEventListener("input", update);
        h.addEventListener("input", update);
        update();

        var appTitle = $("as-app-title"), appBody = $("as-app-body");
        buildTabs($("as-app-tabs"), APPS, function (item) {
            appTitle.textContent = item.title;
            appBody.textContent = item.body;
        }, "as-atab-");
    }

    /* ---------- Pseudocode ---------- */

    var pseudoItems = [];
    var pickedLine = -1;

    function initPseudocode() {
        var list = $("as-pseudo");
        PSEUDO.forEach(function (line, i) {
            var li = el("li", "as-line");
            var btn = el("button", "as-line__btn");
            btn.type = "button";
            btn.setAttribute("aria-label", "Line " + (i + 1) + ": " + line[0]);
            btn.appendChild(el("span", "as-line__no", String(i + 1)));
            var code = el("span", "as-line__code", line[0]);
            code.style.paddingLeft = (line[1] * 1.6) + "ch";
            btn.appendChild(code);
            btn.addEventListener("click", function () { pickLine(i, true); });
            li.appendChild(btn);
            list.appendChild(li);
            pseudoItems.push(li);
        });
    }

    function pickLine(index, byUser) {
        pickedLine = byUser ? index : -1;
        pseudoItems.forEach(function (li, i) { li.classList.toggle("is-picked", byUser && i === index); });
        $("as-line-label").textContent = "Line " + (index + 1);
        $("as-line-explain").textContent = LINE_EXPLAIN[index];
    }

    function markRunning(active, running) {
        pseudoItems.forEach(function (li, i) {
            li.classList.toggle("is-running", running.indexOf(i + 1) !== -1);
            li.classList.toggle("is-active", active === i + 1);
        });
        if (active) { pickLine(active - 1, false); }
    }

    /* ---------- Grids ---------- */

    function cellSize(scrollBox, cols) {
        var width = scrollBox.clientWidth || 520;
        return Math.max(22, Math.min(42, Math.floor((width - (cols - 1) * 2 - 8) / cols)));
    }

    function buildGrid(grid, scrollBox, rows, cols, editable) {
        grid.textContent = "";
        grid.style.setProperty("--as-cols", cols);
        grid.style.setProperty("--as-cell", cellSize(scrollBox, cols) + "px");
        var cells = [];
        var frag = document.createDocumentFragment();
        for (var r = 0; r < rows; r++) {
            var row = el("div", "as-row");
            row.setAttribute("role", "row");
            for (var c = 0; c < cols; c++) {
                var cell = el("div", "as-cell");
                cell.setAttribute("role", "gridcell");
                cell.dataset.id = String(r * cols + c);
                cell.dataset.r = String(r);
                cell.dataset.c = String(c);
                if (editable) { cell.tabIndex = (r === 0 && c === 0) ? 0 : -1; }
                row.appendChild(cell);
                cells.push(cell);
            }
            frag.appendChild(row);
        }
        grid.appendChild(frag);
        return cells;
    }

    /* ---------- Editor (section 03) ---------- */

    var editor = { rows: 10, cols: 16, walls: null, start: 0, goal: 0, cells: [], tool: "wall" };
    var run = { cfg: null, cells: [], steps: [], idx: -1, started: false, playing: false, timer: null, outcome: null };

    function setError(message) { $("as-config-error").textContent = message || ""; }

    function renderEditor() {
        editor.cells.forEach(function (cell, id) {
            var cls = "as-cell";
            if (editor.walls[id]) { cls += " is-wall"; }
            if (id === editor.start) { cls += " is-start"; }
            if (id === editor.goal) { cls += " is-goal"; }
            cell.className = cls;
            cell.textContent = id === editor.start ? "S" : id === editor.goal ? "G" : "";
            cell.setAttribute("aria-label", "Row " + (Number(cell.dataset.r) + 1) + ", column " + (Number(cell.dataset.c) + 1) +
                (id === editor.start ? ", start" : id === editor.goal ? ", goal" : editor.walls[id] ? ", wall" : ", open"));
        });
    }

    function rebuildEditor() {
        editor.cells = buildGrid($("as-editor"), $("as-editor-scroll"), editor.rows, editor.cols, true);
        renderEditor();
    }

    function defaultPositions() {
        var row = Math.floor(editor.rows / 2);
        editor.start = row * editor.cols + 1;
        editor.goal = row * editor.cols + editor.cols - 2;
    }

    function loadLayout(layout) {
        editor.rows = layout.rows;
        editor.cols = layout.cols;
        editor.walls = layout.walls.slice();
        editor.start = layout.start;
        editor.goal = layout.goal;
        $("as-rows").value = editor.rows;
        $("as-cols").value = editor.cols;
        setError("");
        rebuildEditor();
        markStale();
    }

    function markStale() { $("as-stale").hidden = !run.cfg; }

    var painting = false, paintMode = "wall";

    function applyTool(id, first) {
        var tool = editor.tool;
        setError("");
        if (tool === "start" || tool === "goal") {
            if (!first) { return; }
            if (tool === "start" && id === editor.goal) { setError("Start and goal must be different cells."); return; }
            if (tool === "goal" && id === editor.start) { setError("Start and goal must be different cells."); return; }
            editor.walls[id] = 0;
            editor[tool] = id;
        } else {
            if (id === editor.start || id === editor.goal) {
                if (first) { setError("The start and goal cells cannot be walls. Move them with the Start or Goal tool."); }
                return;
            }
            if (first) { paintMode = tool === "erase" ? "erase" : (editor.walls[id] ? "erase" : "wall"); }
            editor.walls[id] = paintMode === "wall" ? 1 : 0;
        }
        renderEditor();
        markStale();
    }

    function initEditor() {
        var host = $("as-editor");
        editor.walls = new Uint8Array(editor.rows * editor.cols);

        host.addEventListener("pointerdown", function (e) {
            var cell = e.target.closest(".as-cell");
            if (!cell) { return; }
            e.preventDefault();
            painting = true;
            applyTool(Number(cell.dataset.id), true);
        });
        host.addEventListener("pointermove", function (e) {
            if (!painting) { return; }
            var target = document.elementFromPoint(e.clientX, e.clientY);
            var cell = target && target.closest ? target.closest("#as-editor .as-cell") : null;
            if (cell) { applyTool(Number(cell.dataset.id), false); }
        });
        function stop() { painting = false; }
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);

        host.addEventListener("keydown", function (e) {
            var cell = e.target.closest(".as-cell");
            if (!cell) { return; }
            var r = Number(cell.dataset.r), c = Number(cell.dataset.c);
            var moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
            if (moves[e.key]) {
                e.preventDefault();
                var nr = Math.min(editor.rows - 1, Math.max(0, r + moves[e.key][0]));
                var nc = Math.min(editor.cols - 1, Math.max(0, c + moves[e.key][1]));
                var next = editor.cells[nr * editor.cols + nc];
                editor.cells.forEach(function (x) { x.tabIndex = -1; });
                next.tabIndex = 0;
                next.focus();
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                applyTool(Number(cell.dataset.id), true);
            }
        });

        Array.prototype.forEach.call(document.querySelectorAll('input[name="as-tool"]'), function (radio) {
            radio.addEventListener("change", function () { editor.tool = radio.value; });
        });

        $("as-apply-size").addEventListener("click", function () {
            var rows = clampInt($("as-rows").value, 4, 20);
            var cols = clampInt($("as-cols").value, 4, 30);
            if (rows === null || cols === null) {
                setError("Rows must be a whole number from 4 to 20, and columns from 4 to 30.");
                return;
            }
            var old = { rows: editor.rows, cols: editor.cols, walls: editor.walls };
            editor.rows = rows;
            editor.cols = cols;
            editor.walls = new Uint8Array(rows * cols);
            for (var r = 0; r < Math.min(rows, old.rows); r++) {
                for (var c = 0; c < Math.min(cols, old.cols); c++) {
                    editor.walls[r * cols + c] = old.walls[r * old.cols + c];
                }
            }
            defaultPositions();
            editor.walls[editor.start] = 0;
            editor.walls[editor.goal] = 0;
            setError("");
            rebuildEditor();
            markStale();
        });

        $("as-load-example").addEventListener("click", function () {
            loadLayout(core.parseExample(core.EXAMPLES[$("as-example").value]));
        });

        $("as-random").addEventListener("click", function () {
            var density = Number($("as-density").value);
            for (var i = 0; i < editor.walls.length; i++) {
                editor.walls[i] = (i !== editor.start && i !== editor.goal && Math.random() < density) ? 1 : 0;
            }
            setError("");
            renderEditor();
            markStale();
        });

        $("as-clear").addEventListener("click", function () {
            editor.walls.fill(0);
            setError("");
            renderEditor();
            markStale();
        });

        var movement = $("as-movement"), heuristic = $("as-heuristic");
        function syncRules() {
            var diagonal = movement.value === "8";
            var manhattan = heuristic.querySelector('option[value="manhattan"]');
            manhattan.disabled = diagonal;
            if (diagonal && heuristic.value === "manhattan") { heuristic.value = "euclidean"; }
            $("as-heuristic-note").textContent = (diagonal && manhattan ? "Manhattan is turned off with diagonals: it overestimates diagonal moves, so A* could miss the shortest path. " : "") +
                HEURISTIC_NOTES[movement.value + ":" + heuristic.value];
            markStale();
        }
        movement.addEventListener("change", syncRules);
        heuristic.addEventListener("change", syncRules);
        syncRules();
        $("as-stale").hidden = true;

        $("as-generate").addEventListener("click", generateSearch);
    }

    /* ---------- Workspace (section 04) ---------- */

    function generateSearch() {
        setError("");
        if (editor.start === editor.goal) { setError("Start and goal must be different cells."); return; }
        if (editor.walls[editor.start] || editor.walls[editor.goal]) { setError("Start and goal cannot be on a wall."); return; }

        stopPlayback();
        run.cfg = {
            rows: editor.rows, cols: editor.cols, walls: editor.walls.slice(),
            start: editor.start, goal: editor.goal,
            heuristic: $("as-heuristic").value, diagonal: $("as-movement").value === "8"
        };
        if (!core.isHeuristicValid(run.cfg.heuristic, run.cfg.diagonal)) {
            setError("Manhattan distance is not valid with diagonal movement. Choose Euclidean or Chebyshev.");
            run.cfg = null;
            return;
        }

        $("as-placeholder").hidden = true;
        $("as-work").hidden = false;
        $("as-stale").hidden = true;

        run.cells = buildGrid($("as-grid"), $("as-grid-scroll"), run.cfg.rows, run.cfg.cols, false);
        resetRun();

        $("as-workspace").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }

    function stopPlayback() {
        run.playing = false;
        if (run.timer) { clearTimeout(run.timer); run.timer = null; }
        $("as-play").textContent = "Auto Play";
    }

    function resetRun() {
        stopPlayback();
        run.started = false;
        run.idx = -1;
        run.steps = [];
        run.outcome = null;
        $("as-desc-text").textContent = "Press Start to run A* on this grid. The search uses " +
            (run.cfg.heuristic === "manhattan" ? "Manhattan" : run.cfg.heuristic === "euclidean" ? "Euclidean" : "Chebyshev") +
            " distance with " + (run.cfg.diagonal ? "8" : "4") + "-direction movement.";
        renderRun();
    }

    function startRun() {
        if (!run.cfg || run.started) { return; }
        run.outcome = core.runAStar(run.cfg);
        run.steps = run.outcome.steps;
        run.started = true;
        run.idx = 0;
        renderRun();
    }

    function go(delta) {
        if (!run.started) { return; }
        var next = run.idx + delta;
        if (next < 0 || next >= run.steps.length) { return; }
        run.idx = next;
        if (run.idx === run.steps.length - 1) { stopPlayback(); }
        renderRun();
    }

    function playDelay() { return Math.round(1000 / Number($("as-speed").value)); }

    function tick() {
        if (!run.playing) { return; }
        if (run.idx >= run.steps.length - 1) { stopPlayback(); renderRun(); return; }
        go(1);
        if (run.playing) { run.timer = setTimeout(tick, playDelay()); }
    }

    function togglePlay() {
        if (!run.started) { return; }
        if (run.playing) { stopPlayback(); return; }
        if (run.idx >= run.steps.length - 1) { return; }
        run.playing = true;
        $("as-play").textContent = "Pause";
        run.timer = setTimeout(tick, playDelay());
    }

    function chip(text, className) { return el("li", "as-chip" + (className ? " " + className : ""), text); }

    function renderLists(snap, cols) {
        var open = $("as-open-list"), closed = $("as-closed-list");
        open.textContent = "";
        closed.textContent = "";
        var LIMIT = 40;
        var openIds = snap ? snap.open : [];
        openIds.slice(0, LIMIT).forEach(function (id, i) {
            open.appendChild(chip(labelOf(id, cols) + "  f " + core.fmt(snap.f[id]), i === 0 ? "is-next" : ""));
        });
        if (openIds.length > LIMIT) { open.appendChild(chip("+" + (openIds.length - LIMIT) + " more", "is-more")); }
        if (!openIds.length) { open.appendChild(chip("empty", "is-more")); }

        var closedIds = snap ? snap.closed : [];
        closedIds.slice(-LIMIT).forEach(function (id) { closed.appendChild(chip(labelOf(id, cols))); });
        if (closedIds.length > LIMIT) { closed.insertBefore(chip("first " + (closedIds.length - LIMIT) + " hidden", "is-more"), closed.firstChild); }
        if (!closedIds.length) { closed.appendChild(chip("empty", "is-more")); }

        $("as-open-count").textContent = openIds.length;
        $("as-closed-count").textContent = closedIds.length;
    }

    function renderRun() {
        var cfg = run.cfg;
        if (!cfg) { return; }
        var snap = run.started ? run.steps[run.idx] : null;
        var neighborSet = {}, pathSet = {};
        if (snap) {
            snap.neighbors.forEach(function (id) { neighborSet[id] = true; });
            if (snap.path) { snap.path.forEach(function (id) { pathSet[id] = true; }); }
        }

        run.cells.forEach(function (cell, id) {
            var cls = "as-cell";
            var text = "";
            if (cfg.walls[id]) { cls += " is-wall"; }
            if (snap) {
                if (snap.state[id] === 1) { cls += " is-open"; }
                if (snap.state[id] === 2) { cls += " is-closed"; }
                if (neighborSet[id]) { cls += " is-neighbor"; }
                if (pathSet[id]) { cls += " is-path"; }
                if (snap.state[id] !== 0) { text = core.fmt(Math.round(snap.f[id] * 10) / 10); }
            }
            if (id === cfg.start) { cls += " is-start"; text = "S"; }
            if (id === cfg.goal) { cls += " is-goal"; text = "G"; }
            if (snap && id === snap.current) { cls += " is-current"; }
            cell.className = cls;
            cell.textContent = text;
        });

        // State cards
        var cur = snap ? snap.current : -1;
        if (cur >= 0) {
            var hv = core.heuristicValue(cfg.heuristic, Math.floor(cur / cfg.cols), cur % cfg.cols,
                Math.floor(cfg.goal / cfg.cols), cfg.goal % cfg.cols);
            $("as-cur-node").textContent = labelOf(cur, cfg.cols);
            $("as-cur-g").textContent = core.fmt(snap.g[cur]);
            $("as-cur-h").textContent = core.fmt(hv);
            $("as-cur-f").textContent = core.fmt(snap.f[cur]);
        } else {
            $("as-cur-node").textContent = "none";
            $("as-cur-g").textContent = "-";
            $("as-cur-h").textContent = "-";
            $("as-cur-f").textContent = "-";
        }
        renderLists(snap, cfg.cols);

        // Progress
        var total = run.steps.length;
        var percent = run.started ? Math.round(((run.idx + 1) / total) * 100) : 0;
        $("as-progress-bar").style.width = percent + "%";
        $("as-progress").setAttribute("aria-valuenow", String(percent));
        $("as-progress-text").textContent = run.started ? "Step " + (run.idx + 1) + " of " + total : "Not started";

        // Description
        if (snap) {
            var prefix = snap.type === "init" ? "Initialization. " :
                (snap.type === "found" || snap.type === "fail") ? "Result. " : "Iteration " + snap.iteration + ". ";
            $("as-desc-text").textContent = prefix + snap.text;
            var list = $("as-desc-list");
            list.textContent = "";
            snap.details.forEach(function (d) { list.appendChild(el("li", "", d)); });
            markRunning(snap.line, snap.running);
        } else {
            $("as-desc-list").textContent = "";
            markRunning(0, []);
        }

        // Summary
        var done = run.started && run.idx === total - 1;
        var out = run.outcome;
        $("as-sum-result").textContent = done ? (out.found ? "Path found" : "No path") : "-";
        $("as-sum-cost").textContent = done && out.found ? core.fmt(out.cost) : "-";
        $("as-sum-length").textContent = done && out.found ? out.path.length + " nodes" : "-";
        $("as-sum-visited").textContent = snap ? snap.visited : "-";
        $("as-sum-generated").textContent = snap ? snap.generated : "-";

        // Buttons
        $("as-start").disabled = run.started;
        $("as-prev").disabled = !run.started || run.idx <= 0;
        $("as-next").disabled = !run.started || run.idx >= total - 1;
        $("as-play").disabled = !run.started || run.idx >= total - 1;
    }

    function initWorkspace() {
        $("as-start").addEventListener("click", startRun);
        $("as-next").addEventListener("click", function () { go(1); });
        $("as-prev").addEventListener("click", function () { go(-1); });
        $("as-play").addEventListener("click", togglePlay);
        $("as-reset").addEventListener("click", function () { if (run.cfg) { resetRun(); } });

        var speed = $("as-speed");
        speed.addEventListener("input", function () {
            $("as-speed-label").textContent = speed.value + (speed.value === "1" ? " step per second" : " steps per second");
            if (run.playing) { clearTimeout(run.timer); run.timer = setTimeout(tick, playDelay()); }
        });

        var inspector = $("as-inspector");
        function inspect(e) {
            var cell = e.target.closest ? e.target.closest(".as-cell") : null;
            if (!cell || !run.cfg) { return; }
            var id = Number(cell.dataset.id), cfg = run.cfg;
            var name = "Cell " + labelOf(id, cfg.cols);
            if (cfg.walls[id]) { inspector.textContent = name + ": wall."; return; }
            var snap = run.started ? run.steps[run.idx] : null;
            var hv = core.heuristicValue(cfg.heuristic, Math.floor(id / cfg.cols), id % cfg.cols,
                Math.floor(cfg.goal / cfg.cols), cfg.goal % cfg.cols);
            if (!snap || snap.state[id] === 0) {
                inspector.textContent = name + ": not discovered yet. h = " + core.fmt(hv) + ".";
                return;
            }
            var where = snap.state[id] === 1 ? "in the Open Set" : "in the Closed Set";
            var par = snap.parent[id] >= 0 ? ", parent " + labelOf(snap.parent[id], cfg.cols) : "";
            inspector.textContent = name + ": " + where + ". g = " + core.fmt(snap.g[id]) + ", h = " + core.fmt(hv) +
                ", f = " + core.fmt(snap.f[id]) + par + ".";
        }
        $("as-grid").addEventListener("pointerover", inspect);
        $("as-grid").addEventListener("click", inspect);

        var resizeTimer = null;
        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                $("as-editor").style.setProperty("--as-cell", cellSize($("as-editor-scroll"), editor.cols) + "px");
                if (run.cfg) { $("as-grid").style.setProperty("--as-cell", cellSize($("as-grid-scroll"), run.cfg.cols) + "px"); }
            }, 150);
        });
    }

    /* ---------- Start ---------- */

    initTheory();
    initPseudocode();
    pickLine(0, false);
    initEditor();
    initWorkspace();
    loadLayout(core.parseExample(core.EXAMPLES.gap));
    $("as-stale").hidden = true;

})(typeof window !== "undefined" ? window : globalThis);