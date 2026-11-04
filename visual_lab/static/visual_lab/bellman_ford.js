/* ==========================================================================
   ThinkSphere - Bellman-Ford Visualizer
   File: static/js/visual_lab/bellman_ford.js

   Structure:
   1. Helpers
   2. Theory section (concept cards, relaxation demo, cycle demo)
   3. Pseudocode section
   4. Input parsing and validation
   5. Bellman-Ford simulation (pre-computes every step)
   6. Graph rendering (SVG)
   7. Step rendering (state cards, description, progress, results)
   8. Controls and initialization
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     1. HELPERS
     ------------------------------------------------------------------------ */
  const root = document.getElementById('bellmanFordPage');
  if (!root) { return; }

  const $ = (id) => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const EPS = 1e-9;
  const MAX_NODES = 12;
  const MAX_EDGES = 40;
  const MAX_NAME_LENGTH = 6;
  const MAX_ABS_WEIGHT = 1000000;
  const NODE_RADIUS = 26;
  const NAME_PATTERN = /^[A-Za-z0-9_]+$/;
  const WEIGHT_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const EDGE_PATTERN = /^([A-Za-z0-9_]+)\s*-\s*([A-Za-z0-9_]+)\s*:\s*(.+)$/;

  const EXAMPLES = {
    standard: {
      nodes: 'A B C D E F',
      start: 'A',
      edges: 'A-B:4\nA-C:2\nB-C:1\nB-D:5\nC-D:8\nC-E:10\nD-E:2\nE-F:3',
      undirected: false
    },
    negativeCycle: {
      nodes: 'A B C D E F',
      start: 'A',
      edges: 'A-B:1\nB-C:-3\nC-D:1\nD-B:1\nD-E:2\nF-A:1',
      undirected: false
    }
  };

  const round9 = (x) => Math.round(x * 1e9) / 1e9;
  const fmtVal = (x) => (x === Infinity ? '\u221E' : x === -Infinity ? '-\u221E' : String(round9(x)));
  const fmtProse = (x) => (x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : String(round9(x)));
  const fmtWeight = (w) => String(round9(w));
  const weightTerm = (w) => (w < 0 ? '(' + fmtWeight(w) + ')' : fmtWeight(w));
  const ARROW = ' \u2192 ';

  function svgEl(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        if (attrs[key] !== null && attrs[key] !== undefined) {
          node.setAttribute(key, attrs[key]);
        }
      });
    }
    return node;
  }

  function htmlEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function clearChildren(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  /* ------------------------------------------------------------------------
     2. THEORY SECTION
     ------------------------------------------------------------------------ */
  function initConceptCards() {
    const cards = Array.prototype.slice.call(root.querySelectorAll('.bf-concept-card'));
    const panels = Array.prototype.slice.call(root.querySelectorAll('[data-concept-panel]'));

    function select(name) {
      cards.forEach((card) => {
        const active = card.dataset.concept === name;
        card.classList.toggle('is-active', active);
        card.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.conceptPanel !== name;
      });
    }

    cards.forEach((card) => {
      card.addEventListener('click', () => select(card.dataset.concept));
    });
  }

  function initRelaxationDemo() {
    const inU = $('relaxDistU');
    const inW = $('relaxWeight');
    const inV = $('relaxDistV');
    const equation = $('relaxEquation');
    const result = $('relaxResult');
    if (!inU || !inW || !inV) { return; }

    function update() {
      const a = parseFloat(inU.value);
      const b = parseFloat(inW.value);
      const c = parseFloat(inV.value);
      clearChildren(equation);
      if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) {
        equation.appendChild(htmlEl('span', 'bf-demo-line', 'Enter a number in every field.'));
        result.textContent = 'Waiting for valid numbers.';
        result.className = 'bf-demo-result';
        return null;
      }
      const sum = round9(a + b);
      const improves = sum < c;
      equation.appendChild(htmlEl('span', 'bf-demo-line', 'dist[u] + w = ' + a + ' + ' + weightTerm(b) + ' = ' + sum));
      equation.appendChild(htmlEl('span', 'bf-demo-line', sum + ' < ' + c + ' is ' + (improves ? 'true' : 'false')));
      if (improves) {
        result.textContent = 'Relaxation succeeds: dist[v] becomes ' + sum + ' and prev[v] becomes u.';
        result.className = 'bf-demo-result is-success';
      } else {
        result.textContent = 'No update: ' + sum + ' is not smaller than ' + c + ', so dist[v] stays ' + c + '.';
        result.className = 'bf-demo-result';
      }
      return { improves: improves, sum: sum };
    }

    [inU, inW, inV].forEach((input) => input.addEventListener('input', update));

    $('relaxDemoRun').addEventListener('click', () => {
      const outcome = update();
      if (outcome && outcome.improves) {
        inV.value = outcome.sum;
        update();
      }
    });

    $('relaxDemoReset').addEventListener('click', () => {
      inU.value = 3;
      inW.value = 4;
      inV.value = 10;
      update();
    });

    update();
  }

  function initCycleDemo() {
    const result = $('cycleResult');
    if (!result) { return; }
    let laps = 0;
    const CYCLE_WEIGHT = -2;

    function update() {
      if (laps === 0) {
        result.textContent = 'Before the first lap: dist[A] = 0.';
        result.className = 'bf-demo-result';
      } else {
        result.textContent = 'After ' + laps + (laps === 1 ? ' lap' : ' laps') + ': dist[A] = ' +
          (laps * CYCLE_WEIGHT) + '. It can always be lowered again, so no shortest path exists.';
        result.className = 'bf-demo-result is-danger';
      }
    }

    $('cycleDemoRun').addEventListener('click', () => {
      if (laps < 50) { laps += 1; }
      update();
    });
    $('cycleDemoReset').addEventListener('click', () => {
      laps = 0;
      update();
    });
    update();
  }

  /* ------------------------------------------------------------------------
     3. PSEUDOCODE SECTION
     ------------------------------------------------------------------------ */
  const codeLines = Array.prototype.slice.call(root.querySelectorAll('.bf-code-line'));

  function initPseudocode() {
    const title = $('pseudoExplainTitle');
    const text = $('pseudoExplainText');
    const chip = $('pseudoLineChip');

    codeLines.forEach((button) => {
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        codeLines.forEach((other) => {
          other.classList.remove('is-active');
          other.setAttribute('aria-pressed', 'false');
        });
        button.classList.add('is-active');
        button.setAttribute('aria-pressed', 'true');
        title.textContent = button.dataset.title || 'Line ' + button.dataset.line;
        text.textContent = button.dataset.text || '';
        chip.textContent = 'Line ' + button.dataset.line + ' of ' + codeLines.length;
      });
    });
  }

  function setRunningLines(lineNumbers) {
    codeLines.forEach((button) => {
      button.classList.toggle('is-running', lineNumbers.indexOf(Number(button.dataset.line)) !== -1);
    });
  }

  /* ------------------------------------------------------------------------
     4. INPUT PARSING AND VALIDATION
     ------------------------------------------------------------------------ */
  const nodesInput = $('nodesInput');
  const startInput = $('startNodeInput');
  const edgesInput = $('edgesInput');
  const undirectedToggle = $('undirectedToggle');

  function parseInputs() {
    const errors = [];
    const fail = (field, message) => errors.push({ field: field, message: message });

    // Nodes
    const rawNodes = nodesInput.value.split(/[\s,]+/).filter(Boolean);
    const nodes = [];
    const seen = new Set();
    const badNames = [];
    const longNames = [];
    const duplicates = [];

    rawNodes.forEach((name) => {
      if (!NAME_PATTERN.test(name)) { badNames.push(name); return; }
      if (name.length > MAX_NAME_LENGTH) { longNames.push(name); return; }
      if (seen.has(name)) { duplicates.push(name); return; }
      seen.add(name);
      nodes.push(name);
    });

    if (rawNodes.length === 0) {
      fail('nodes', 'Enter at least one node name, for example: A B C D.');
    }
    if (badNames.length) {
      fail('nodes', 'Invalid node name(s): ' + badNames.join(', ') + '. Use only letters, digits and underscores.');
    }
    if (longNames.length) {
      fail('nodes', 'Node name(s) too long: ' + longNames.join(', ') + '. Use at most ' + MAX_NAME_LENGTH + ' characters.');
    }
    if (duplicates.length) {
      fail('nodes', 'Duplicate node name(s): ' + duplicates.join(', ') + '. Each node must appear once.');
    }
    if (nodes.length > MAX_NODES) {
      fail('nodes', 'Too many nodes (' + nodes.length + '). The visualizer supports at most ' + MAX_NODES + ' nodes.');
    }

    // Starting node
    const start = startInput.value.trim();
    if (!start) {
      fail('start', 'Enter a starting node.');
    } else if (nodes.length && !seen.has(start)) {
      fail('start', 'Starting node "' + start + '" is not in the node list (' + nodes.join(', ') + ').');
    }

    // Edges
    const edges = [];
    const lines = edgesInput.value.split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === '#') { return; }
      const lineNo = index + 1;
      const match = trimmed.match(EDGE_PATTERN);
      if (!match) {
        fail('edges', 'Line ' + lineNo + ': "' + trimmed + '" does not match SOURCE-DESTINATION:WEIGHT, for example A-B:-2.');
        return;
      }
      const u = match[1];
      const v = match[2];
      const weightText = match[3].trim();
      let valid = true;
      if (!seen.has(u)) {
        fail('edges', 'Line ' + lineNo + ': node "' + u + '" is not in the node list.');
        valid = false;
      }
      if (!seen.has(v)) {
        fail('edges', 'Line ' + lineNo + ': node "' + v + '" is not in the node list.');
        valid = false;
      }
      if (!WEIGHT_PATTERN.test(weightText)) {
        fail('edges', 'Line ' + lineNo + ': weight "' + weightText + '" is not a number. Negative, zero and decimal weights are allowed.');
        valid = false;
      }
      if (!valid) { return; }
      const weight = parseFloat(weightText);
      if (Math.abs(weight) > MAX_ABS_WEIGHT) {
        fail('edges', 'Line ' + lineNo + ': weight ' + weightText + ' is too large. Use values between -' + MAX_ABS_WEIGHT + ' and ' + MAX_ABS_WEIGHT + '.');
        return;
      }
      edges.push({ u: u, v: v, w: weight });
    });

    if (edges.length === 0 && !errors.some((e) => e.field === 'edges')) {
      fail('edges', 'Enter at least one edge, for example A-B:4.');
    }
    if (edges.length > MAX_EDGES) {
      fail('edges', 'Too many edges (' + edges.length + '). The visualizer supports at most ' + MAX_EDGES + ' edges.');
    }

    return {
      errors: errors,
      nodes: nodes,
      start: start,
      edges: edges,
      undirected: undirectedToggle.checked
    };
  }

  function showErrors(errors) {
    const box = $('configError');
    const list = $('configErrorList');
    clearChildren(list);
    const shown = errors.slice(0, 8);
    shown.forEach((error) => list.appendChild(htmlEl('li', '', error.message)));
    if (errors.length > shown.length) {
      list.appendChild(htmlEl('li', '', '...and ' + (errors.length - shown.length) + ' more problem(s).'));
    }
    $('configErrorTitle').textContent = errors.length === 1 ? 'Please fix this problem' : 'Please fix these problems';
    box.hidden = false;
    nodesInput.classList.toggle('is-invalid', errors.some((e) => e.field === 'nodes'));
    startInput.classList.toggle('is-invalid', errors.some((e) => e.field === 'start'));
    edgesInput.classList.toggle('is-invalid', errors.some((e) => e.field === 'edges'));
  }

  function clearErrors() {
    $('configError').hidden = true;
    clearChildren($('configErrorList'));
    [nodesInput, startInput, edgesInput].forEach((input) => input.classList.remove('is-invalid'));
  }

  /* ------------------------------------------------------------------------
     5. GRAPH MODEL AND BELLMAN-FORD SIMULATION
     ------------------------------------------------------------------------ */
  function buildGraph(parsed) {
    const nodes = parsed.nodes;
    const edges = [];      // directed edges processed by the algorithm
    const drawEdges = [];  // edges drawn in the SVG

    if (!parsed.undirected) {
      const groupSize = new Map();
      parsed.edges.forEach((e) => {
        const key = e.u + '>' + e.v;
        groupSize.set(key, (groupSize.get(key) || 0) + 1);
      });
      const counters = new Map();
      parsed.edges.forEach((e) => {
        const key = e.u + '>' + e.v;
        const index = counters.get(key) || 0;
        counters.set(key, index + 1);
        drawEdges.push({
          u: e.u, v: e.v, w: e.w, directed: true,
          index: index, count: groupSize.get(key),
          anti: e.u !== e.v && groupSize.has(e.v + '>' + e.u)
        });
        edges.push({ u: e.u, v: e.v, w: e.w, draw: drawEdges.length - 1 });
      });
    } else {
      const groupSize = new Map();
      const pairKey = (a, b) => (nodes.indexOf(a) <= nodes.indexOf(b) ? a + '|' + b : b + '|' + a);
      parsed.edges.forEach((e) => {
        const key = pairKey(e.u, e.v);
        groupSize.set(key, (groupSize.get(key) || 0) + 1);
      });
      const counters = new Map();
      parsed.edges.forEach((e) => {
        const key = pairKey(e.u, e.v);
        const index = counters.get(key) || 0;
        counters.set(key, index + 1);
        const first = nodes.indexOf(e.u) <= nodes.indexOf(e.v) ? e.u : e.v;
        const second = first === e.u ? e.v : e.u;
        drawEdges.push({
          u: first, v: second, w: e.w, directed: false,
          index: index, count: groupSize.get(key), anti: false
        });
        const drawIndex = drawEdges.length - 1;
        edges.push({ u: e.u, v: e.v, w: e.w, draw: drawIndex });
        if (e.u !== e.v) {
          edges.push({ u: e.v, v: e.u, w: e.w, draw: drawIndex });
        }
      });
    }

    return {
      nodes: nodes,
      start: parsed.start,
      undirected: parsed.undirected,
      inputEdgeCount: parsed.edges.length,
      edges: edges,
      drawEdges: drawEdges
    };
  }

  function extractCycle(graph, prev, prevEdge, edgeIndex) {
    const V = graph.nodes.length;
    const parent = Object.assign({}, prev);
    const parentEdge = Object.assign({}, prevEdge);
    const trigger = graph.edges[edgeIndex];
    parent[trigger.v] = trigger.u;
    parentEdge[trigger.v] = edgeIndex;

    // Walking back V times guarantees we are standing on the cycle itself.
    let node = trigger.v;
    for (let k = 0; k < V; k += 1) {
      if (parent[node] === null) { return null; }
      node = parent[node];
    }

    const backward = [node];
    let current = parent[node];
    let guard = 0;
    while (current !== node) {
      if (current === null || guard > V) { return null; }
      backward.push(current);
      current = parent[current];
      guard += 1;
    }

    const cycleNodes = backward.slice().reverse();
    const cycleEdges = cycleNodes.map((n) => parentEdge[n]);
    if (cycleEdges.some((idx) => idx === null || idx === undefined)) { return null; }
    const total = round9(cycleEdges.reduce((sum, idx) => sum + graph.edges[idx].w, 0));
    if (total >= -EPS) { return null; }
    return { nodes: cycleNodes, edges: cycleEdges, total: total };
  }

  function computeAffected(graph, dist) {
    const V = graph.nodes.length;
    const d = Object.assign({}, dist);
    const affected = new Set();
    for (let k = 0; k < V; k += 1) {
      let changed = false;
      graph.edges.forEach((e) => {
        const du = d[e.u];
        if (du === Infinity) { return; }
        if (du === -Infinity) {
          if (d[e.v] !== -Infinity) {
            d[e.v] = -Infinity;
            affected.add(e.v);
            changed = true;
          }
        } else if (round9(du + e.w) < d[e.v] - EPS) {
          d[e.v] = -Infinity;
          affected.add(e.v);
          changed = true;
        }
      });
      if (!changed) { break; }
    }
    return affected;
  }

  function runBellmanFord(graph) {
    const V = graph.nodes.length;
    const dist = {};
    const prev = {};
    const prevEdge = {};
    graph.nodes.forEach((n) => {
      dist[n] = Infinity;
      prev[n] = null;
      prevEdge[n] = null;
    });
    dist[graph.start] = 0;

    const steps = [];
    const snapshot = () => ({
      dist: Object.assign({}, dist),
      prev: Object.assign({}, prev),
      prevEdge: Object.assign({}, prevEdge)
    });
    const push = (data) => steps.push(Object.assign(data, snapshot()));

    // Initialization
    push({ type: 'init', pass: 0, updated: [graph.start], passUpdates: 0 });

    // Up to V - 1 passes
    let passesDone = 0;
    let stoppedEarly = false;
    for (let pass = 1; pass <= V - 1; pass += 1) {
      let changes = 0;
      graph.edges.forEach((e, i) => {
        const du = dist[e.u];
        const old = dist[e.v];
        let result;
        let candidate = null;
        if (du === Infinity) {
          result = 'skipped';
        } else {
          candidate = round9(du + e.w);
          if (candidate < old - EPS) {
            result = 'relaxed';
            dist[e.v] = candidate;
            prev[e.v] = e.u;
            prevEdge[e.v] = i;
            changes += 1;
          } else {
            result = 'unchanged';
          }
        }
        push({
          type: 'edge', pass: pass, edge: i, edgeInPass: i + 1,
          result: result, candidate: candidate, du: du, old: old,
          passUpdates: changes, updated: result === 'relaxed' ? [e.v] : []
        });
      });
      passesDone = pass;
      if (changes === 0) {
        push({ type: 'early-stop', pass: pass, passUpdates: 0, updated: [] });
        stoppedEarly = true;
        break;
      }
      push({ type: 'pass-end', pass: pass, passUpdates: changes, updated: [] });
    }

    // Extra scan: negative cycle detection
    let cycleEdgeIndex = -1;
    for (let i = 0; i < graph.edges.length; i += 1) {
      const e = graph.edges[i];
      const du = dist[e.u];
      const dv = dist[e.v];
      let result;
      let candidate = null;
      if (du === Infinity) {
        result = 'skipped';
      } else {
        candidate = round9(du + e.w);
        result = candidate < dv - EPS ? 'cycle' : 'stable';
      }
      push({
        type: 'detect', pass: passesDone, edge: i, edgeInPass: i + 1,
        result: result, candidate: candidate, du: du, dv: dv, updated: []
      });
      if (result === 'cycle') {
        cycleEdgeIndex = i;
        break;
      }
    }

    // Final result
    const hasCycle = cycleEdgeIndex >= 0;
    const cycle = hasCycle ? extractCycle(graph, prev, prevEdge, cycleEdgeIndex) : null;
    const affected = hasCycle ? computeAffected(graph, dist) : new Set();

    const rows = [];
    const treeEdges = new Set();
    let reachableCount = 0;

    const buildPath = (target) => {
      const path = [target];
      let current = target;
      let guard = 0;
      while (current !== graph.start) {
        const parent = prev[current];
        if (parent === null || guard > V) { return null; }
        path.push(parent);
        current = parent;
        guard += 1;
      }
      return path.reverse();
    };

    graph.nodes.forEach((node) => {
      if (affected.has(node)) {
        rows.push({ node: node, dist: -Infinity, path: null, status: 'affected' });
        return;
      }
      if (dist[node] === Infinity) {
        rows.push({ node: node, dist: Infinity, path: null, status: 'unreachable' });
        return;
      }
      const path = buildPath(node);
      if (!path) {
        rows.push({ node: node, dist: dist[node], path: null, status: 'affected' });
        affected.add(node);
        return;
      }
      reachableCount += 1;
      if (node !== graph.start && prevEdge[node] !== null) {
        treeEdges.add(prevEdge[node]);
      }
      rows.push({ node: node, dist: dist[node], path: path, status: 'ok' });
    });

    push({ type: 'complete', pass: passesDone, passUpdates: 0, updated: [] });

    return {
      steps: steps,
      passesDone: passesDone,
      stoppedEarly: stoppedEarly,
      final: {
        hasCycle: hasCycle,
        cycle: cycle,
        cycleEdgeIndex: cycleEdgeIndex,
        affected: affected,
        rows: rows,
        treeEdges: treeEdges,
        reachableCount: reachableCount
      }
    };
  }

  /* ------------------------------------------------------------------------
     6. GRAPH RENDERING (SVG)
     ------------------------------------------------------------------------ */
  const svg = $('graphSvg');
  const edgesLayer = $('graphEdgesLayer');
  const labelsLayer = $('graphEdgeLabelsLayer');
  const nodesLayer = $('graphNodesLayer');

  const EDGE_STATE_CLASSES = ['is-current', 'is-updated', 'is-skipped', 'is-path', 'is-cycle', 'is-dim'];
  const NODE_STATE_CLASSES = ['is-source', 'is-current', 'is-updated', 'is-path', 'is-cycle', 'is-unreachable'];
  const MARKER_BY_STATE = {
    'is-current': 'arrowCurrent',
    'is-updated': 'arrowUpdated',
    'is-path': 'arrowPath',
    'is-cycle': 'arrowCycle'
  };

  let state = {
    graph: null,
    sim: null,
    index: -1,
    status: 'idle',
    positions: {},
    edgeEls: [],
    nodeEls: {},
    distEls: {}
  };

  function layoutNodes(nodes) {
    const positions = {};
    const cx = 350;
    const cy = 225;
    const n = nodes.length;
    if (n === 1) {
      positions[nodes[0]] = { x: cx, y: cy };
    } else if (n === 2) {
      positions[nodes[0]] = { x: 230, y: cy };
      positions[nodes[1]] = { x: 470, y: cy };
    } else {
      const rx = n <= 4 ? 210 : 260;
      const ry = n <= 4 ? 130 : 145;
      nodes.forEach((name, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
        positions[name] = { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
      });
    }
    return positions;
  }

  function edgeGeometry(drawEdge, positions) {
    const A = positions[drawEdge.u];
    const B = positions[drawEdge.v];
    const R = NODE_RADIUS;

    // Self loop, pointing away from the centre of the layout
    if (drawEdge.u === drawEdge.v) {
      const outward = state.graph.nodes.length === 1
        ? -Math.PI / 2
        : Math.atan2(A.y - 225, A.x - 350);
      const spread = 0.5;
      const reach = R + 46;
      const p1 = { x: A.x + R * Math.cos(outward - 0.45), y: A.y + R * Math.sin(outward - 0.45) };
      const p2 = { x: A.x + R * Math.cos(outward + 0.45), y: A.y + R * Math.sin(outward + 0.45) };
      const c1 = { x: A.x + reach * Math.cos(outward - spread), y: A.y + reach * Math.sin(outward - spread) };
      const c2 = { x: A.x + reach * Math.cos(outward + spread), y: A.y + reach * Math.sin(outward + spread) };
      const labelDistance = R + 40;
      return {
        d: 'M ' + p1.x + ' ' + p1.y + ' C ' + c1.x + ' ' + c1.y + ', ' + c2.x + ' ' + c2.y + ', ' + p2.x + ' ' + p2.y,
        lx: A.x + labelDistance * Math.cos(outward),
        ly: A.y + labelDistance * Math.sin(outward)
      };
    }

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = (drawEdge.anti ? 30 : 0) + (drawEdge.index - (drawEdge.count - 1) / 2) * 34;

    if (Math.abs(offset) < 0.5) {
      const ux = dx / len;
      const uy = dy / len;
      const sx = A.x + ux * R;
      const sy = A.y + uy * R;
      const ex = B.x - ux * R;
      const ey = B.y - uy * R;
      return {
        d: 'M ' + sx + ' ' + sy + ' L ' + ex + ' ' + ey,
        lx: (A.x + B.x) / 2,
        ly: (A.y + B.y) / 2
      };
    }

    const mx = (A.x + B.x) / 2;
    const my = (A.y + B.y) / 2;
    const cx = mx + nx * offset * 2;
    const cy = my + ny * offset * 2;
    const toStartX = cx - A.x;
    const toStartY = cy - A.y;
    const toStartLen = Math.sqrt(toStartX * toStartX + toStartY * toStartY) || 1;
    const toEndX = cx - B.x;
    const toEndY = cy - B.y;
    const toEndLen = Math.sqrt(toEndX * toEndX + toEndY * toEndY) || 1;
    const sx = A.x + (toStartX / toStartLen) * R;
    const sy = A.y + (toStartY / toStartLen) * R;
    const ex = B.x + (toEndX / toEndLen) * R;
    const ey = B.y + (toEndY / toEndLen) * R;
    return {
      d: 'M ' + sx + ' ' + sy + ' Q ' + cx + ' ' + cy + ' ' + ex + ' ' + ey,
      lx: 0.25 * sx + 0.5 * cx + 0.25 * ex,
      ly: 0.25 * sy + 0.5 * cy + 0.25 * ey
    };
  }

  function drawGraph() {
    const graph = state.graph;
    clearChildren(edgesLayer);
    clearChildren(labelsLayer);
    clearChildren(nodesLayer);

    state.positions = layoutNodes(graph.nodes);
    state.edgeEls = [];
    state.nodeEls = {};

    graph.drawEdges.forEach((drawEdge) => {
      const geometry = edgeGeometry(drawEdge, state.positions);
      const path = svgEl('path', {
        'class': 'bf-edge',
        d: geometry.d,
        'marker-end': drawEdge.directed ? 'url(#arrowNormal)' : null
      });
      edgesLayer.appendChild(path);

      const labelText = fmtWeight(drawEdge.w);
      const width = Math.max(26, labelText.length * 8 + 14);
      const group = svgEl('g');
      const bg = svgEl('rect', {
        'class': 'bf-edge-label-bg',
        x: geometry.lx - width / 2,
        y: geometry.ly - 10,
        width: width,
        height: 20,
        rx: 6
      });
      const label = svgEl('text', {
        'class': 'bf-edge-label' + (drawEdge.w < 0 ? ' is-negative' : ''),
        x: geometry.lx,
        y: geometry.ly
      });
      label.textContent = labelText;
      group.appendChild(bg);
      group.appendChild(label);
      labelsLayer.appendChild(group);

      state.edgeEls.push({ path: path, label: label, directed: drawEdge.directed, negative: drawEdge.w < 0 });
    });

    graph.nodes.forEach((name) => {
      const p = state.positions[name];
      const group = svgEl('g', { 'class': 'bf-node', 'data-node': name });
      const circle = svgEl('circle', { 'class': 'bf-node-circle', cx: p.x, cy: p.y, r: NODE_RADIUS });
      const label = svgEl('text', { 'class': 'bf-node-label', x: p.x, y: p.y - 7 });
      label.textContent = name;
      const dist = svgEl('text', {
        'class': 'bf-node-dist',
        x: p.x,
        y: p.y + 14,
        stroke: '#111a31',
        'stroke-width': 3,
        'stroke-linejoin': 'round',
        'paint-order': 'stroke'
      });
      dist.textContent = '-';
      group.appendChild(circle);
      group.appendChild(label);
      group.appendChild(dist);
      nodesLayer.appendChild(group);
      state.nodeEls[name] = { group: group, dist: dist };
    });

    $('graphPlaceholder').hidden = true;
    $('graphModeChip').textContent = graph.undirected ? 'Undirected' : 'Directed';
    svg.setAttribute('aria-label',
      (graph.undirected ? 'Undirected' : 'Directed') + ' weighted graph with ' +
      graph.nodes.length + ' nodes and ' + graph.inputEdgeCount + ' edges');
  }

  function paintEdge(drawIndex, stateClass) {
    const el = state.edgeEls[drawIndex];
    EDGE_STATE_CLASSES.forEach((cls) => el.path.classList.remove(cls));
    if (stateClass) { el.path.classList.add(stateClass); }
    if (el.directed) {
      const marker = MARKER_BY_STATE[stateClass] || 'arrowNormal';
      el.path.setAttribute('marker-end', 'url(#' + marker + ')');
    }
    el.label.classList.toggle('is-current', stateClass === 'is-current' || stateClass === 'is-updated');
  }

  function paintNode(name, classes) {
    const group = state.nodeEls[name].group;
    NODE_STATE_CLASSES.forEach((cls) => group.classList.remove(cls));
    classes.forEach((cls) => group.classList.add(cls));
  }

  function renderGraph(step) {
    const graph = state.graph;
    const final = state.sim.final;
    const edgeStates = graph.drawEdges.map(() => '');
    const nodeStates = {};
    graph.nodes.forEach((n) => { nodeStates[n] = []; });
    nodeStates[graph.start].push('is-source');

    if (step) {
      if (step.type === 'edge' || step.type === 'detect') {
        const e = graph.edges[step.edge];
        let edgeClass = 'is-current';
        let nodeClass = 'is-current';
        if (step.type === 'edge') {
          if (step.result === 'relaxed') { edgeClass = 'is-updated'; }
          if (step.result === 'skipped') { edgeClass = 'is-skipped'; }
        } else {
          if (step.result === 'skipped') { edgeClass = 'is-skipped'; }
          if (step.result === 'cycle') { edgeClass = 'is-cycle'; nodeClass = 'is-cycle'; }
        }
        edgeStates[e.draw] = edgeClass;
        nodeStates[e.u].push(nodeClass);
        nodeStates[e.v].push(nodeClass);
      }

      step.updated.forEach((name) => nodeStates[name].push('is-updated'));

      if (step.type === 'complete') {
        if (final.hasCycle) {
          final.affected.forEach((name) => nodeStates[name].push('is-cycle'));
          if (final.cycle) {
            final.cycle.nodes.forEach((name) => {
              if (nodeStates[name].indexOf('is-cycle') === -1) { nodeStates[name].push('is-cycle'); }
            });
            final.cycle.edges.forEach((edgeIdx) => { edgeStates[graph.edges[edgeIdx].draw] = 'is-cycle'; });
          } else if (final.cycleEdgeIndex >= 0) {
            edgeStates[graph.edges[final.cycleEdgeIndex].draw] = 'is-cycle';
          }
        }
        const treeDraw = new Set();
        final.treeEdges.forEach((edgeIdx) => treeDraw.add(graph.edges[edgeIdx].draw));
        graph.drawEdges.forEach((unused, drawIdx) => {
          if (treeDraw.has(drawIdx) && edgeStates[drawIdx] === '') { edgeStates[drawIdx] = 'is-path'; }
          else if (!final.hasCycle && edgeStates[drawIdx] === '') { edgeStates[drawIdx] = 'is-dim'; }
        });
        final.rows.forEach((row) => {
          if (row.status === 'ok' && row.node !== graph.start) { nodeStates[row.node].push('is-path'); }
          if (row.status === 'unreachable') { nodeStates[row.node].push('is-unreachable'); }
        });
      }
    }

    edgeStates.forEach((cls, idx) => paintEdge(idx, cls));
    graph.nodes.forEach((name) => paintNode(name, nodeStates[name]));

    graph.nodes.forEach((name) => {
      let text = '-';
      if (step) {
        const affected = step.type === 'complete' && final.affected.has(name);
        text = affected ? fmtVal(-Infinity) : fmtVal(step.dist[name]);
      }
      state.nodeEls[name].dist.textContent = text;
    });
  }

  /* ------------------------------------------------------------------------
     7. STEP RENDERING
     ------------------------------------------------------------------------ */
  function buildDistanceItems() {
    const list = $('distanceList');
    clearChildren(list);
    state.distEls = {};
    state.graph.nodes.forEach((name) => {
      const item = htmlEl('div', 'bf-distance-item');
      const label = htmlEl('span', 'bf-distance-node', name);
      const value = htmlEl('span', 'bf-distance-value', '-');
      item.appendChild(label);
      item.appendChild(value);
      list.appendChild(item);
      state.distEls[name] = { item: item, value: value };
    });
  }

  function renderDistances(step) {
    const graph = state.graph;
    const final = state.sim.final;
    graph.nodes.forEach((name) => {
      const el = state.distEls[name];
      const affected = !!step && step.type === 'complete' && final.affected.has(name);
      const value = step ? (affected ? -Infinity : step.dist[name]) : null;
      el.value.textContent = step ? fmtVal(value) : '-';
      el.item.classList.toggle('is-source', name === graph.start);
      el.item.classList.toggle('is-infinite', !step || value === Infinity);
      el.item.classList.toggle('is-updated', !!step && step.updated.indexOf(name) !== -1);
      el.item.classList.toggle('is-cycle', affected);
    });
  }

  function setEdgeResult(label, stateName) {
    const badge = $('currentEdgeResult');
    badge.textContent = label;
    badge.dataset.state = stateName;
  }

  function renderEdgeCard(step) {
    const graph = state.graph;
    let source = '-';
    let target = '-';
    let weight = '-';
    let label = 'Waiting';
    let stateName = 'idle';

    if (step && (step.type === 'edge' || step.type === 'detect')) {
      const e = graph.edges[step.edge];
      source = e.u;
      target = e.v;
      weight = fmtWeight(e.w);
      if (step.type === 'edge') {
        label = { relaxed: 'Relaxed', unchanged: 'No change', skipped: 'Skipped' }[step.result];
        stateName = step.result;
      } else {
        label = { stable: 'Stable', skipped: 'Ignored', cycle: 'Negative cycle' }[step.result];
        stateName = step.result === 'cycle' ? 'cycle' : (step.result === 'skipped' ? 'skipped' : 'unchanged');
      }
    } else if (step) {
      const labels = {
        init: 'Initialized',
        'pass-end': 'Pass done',
        'early-stop': 'Stopped early',
        complete: state.sim.final.hasCycle ? 'Cycle found' : 'Finished'
      };
      label = labels[step.type] || 'Idle';
      stateName = (step.type === 'complete' && state.sim.final.hasCycle) ? 'cycle' : 'idle';
    }

    $('currentEdgeSource').textContent = source;
    $('currentEdgeTarget').textContent = target;
    $('currentEdgeWeight').textContent = weight;
    setEdgeResult(label, stateName);
  }

  function renderPassCard(step) {
    const V = state.graph.nodes.length;
    const E = state.graph.edges.length;
    const maxPasses = Math.max(V - 1, 0);
    $('passMax').textContent = String(maxPasses);

    let current = 0;
    let note = 'Maximum passes: V - 1 = ' + maxPasses;
    let edgeCounter = 'Edge 0 of ' + E + ' in this pass';
    let updateCounter = 'Updates this pass: 0';

    if (step) {
      current = step.pass || 0;
      switch (step.type) {
        case 'init':
          break;
        case 'edge':
          edgeCounter = 'Edge ' + step.edgeInPass + ' of ' + E + ' in this pass';
          updateCounter = 'Updates this pass: ' + step.passUpdates;
          break;
        case 'pass-end':
          edgeCounter = 'All ' + E + ' edges scanned';
          updateCounter = 'Updates this pass: ' + step.passUpdates;
          break;
        case 'early-stop':
          note = 'Stopped early: no update in pass ' + step.pass;
          edgeCounter = 'All ' + E + ' edges scanned';
          updateCounter = 'Updates this pass: 0';
          break;
        case 'detect':
          note = 'Extra scan: negative cycle check';
          edgeCounter = 'Check edge ' + step.edgeInPass + ' of ' + E;
          updateCounter = 'No distances change in this scan';
          break;
        case 'complete':
          note = state.sim.stoppedEarly
            ? 'Stopped early after pass ' + state.sim.passesDone
            : 'All allowed passes completed';
          edgeCounter = 'Negative cycle check finished';
          updateCounter = state.sim.final.hasCycle ? 'Negative cycle found' : 'No negative cycle';
          break;
        default:
          break;
      }
    }

    $('passCurrent').textContent = String(current);
    $('passNote').textContent = note;
    $('passEdgeCounter').textContent = edgeCounter;
    $('passUpdateCounter').textContent = updateCounter;
  }

  function distanceSummary(dist) {
    return state.graph.nodes.map((n) => n + ' = ' + fmtProse(dist[n])).join(', ');
  }

  function describeStep(step) {
    const graph = state.graph;
    const sim = state.sim;
    const V = graph.nodes.length;
    const E = graph.edges.length;
    const src = graph.start;
    const facts = [];
    let lead = '';
    let text = '';
    let tone = '';

    if (!step) {
      const edgePreview = graph.drawEdges.slice(0, 12).map((de) => {
        const connector = de.directed ? ARROW : ' \u2194 ';
        return de.u + connector + de.v + ' (' + fmtWeight(de.w) + ')';
      }).join(', ');
      lead = 'Graph ready';
      text = 'Graph generated with ' + V + ' node' + (V === 1 ? '' : 's') + ' and ' + graph.inputEdgeCount +
        ' edge' + (graph.inputEdgeCount === 1 ? '' : 's') + ' (' + (graph.undirected ? 'undirected' : 'directed') +
        '). The source is ' + src + '. Select Start Bellman-Ford to initialize the distances, then use Next Step to relax one edge at a time.';
      facts.push({ text: 'Edge scan order: ' + edgePreview + (graph.drawEdges.length > 12 ? ', ...' : ''), tone: '' });
      facts.push({ text: 'Maximum passes: V - 1 = ' + Math.max(V - 1, 0) + ', followed by one extra scan to detect negative cycles.', tone: '' });
      if (graph.undirected) {
        facts.push({ text: 'Undirected mode: each edge is processed in both directions, so a negative edge forms a negative cycle.', tone: 'warning' });
      }
      return { lead: lead, text: text, facts: facts, tone: tone };
    }

    switch (step.type) {
      case 'init':
        lead = 'Initialization';
        text = 'Every node starts with dist = Infinity and prev = null, because nothing has been reached yet. ' +
          'The source ' + src + ' gets dist = 0, since the cost of getting from ' + src + ' to itself is zero.';
        facts.push({ text: 'Distances: ' + distanceSummary(step.dist), tone: '' });
        facts.push({ text: 'Up to V - 1 = ' + Math.max(V - 1, 0) + ' passes will scan all ' + E + ' directed edge' + (E === 1 ? '' : 's') + ' in input order.', tone: '' });
        if (graph.undirected) {
          facts.push({ text: 'Undirected mode: each edge counts as two directed edges, so ' + E + ' directed edges are scanned per pass.', tone: 'warning' });
        }
        break;

      case 'edge': {
        const e = graph.edges[step.edge];
        const label = e.u + ARROW + e.v + ' (weight ' + fmtWeight(e.w) + ')';
        lead = 'Pass ' + step.pass + ', edge ' + step.edgeInPass + ' of ' + E + ': ' + label;
        if (step.result === 'skipped') {
          text = 'dist[' + e.u + '] is still Infinity, so ' + e.u + ' has not been reached from ' + src +
            ' yet. A path cannot be extended from an unreachable node, so this edge is skipped and nothing changes.';
          tone = '';
        } else if (step.result === 'relaxed') {
          text = 'dist[' + e.u + '] + w = ' + fmtProse(step.du) + ' + ' + weightTerm(e.w) + ' = ' + fmtProse(step.candidate) +
            '. This is smaller than the current dist[' + e.v + '] = ' + fmtProse(step.old) +
            ', so the edge is relaxed: dist[' + e.v + '] becomes ' + fmtProse(step.candidate) +
            ' and prev[' + e.v + '] becomes ' + e.u + '.';
          tone = 'success';
        } else {
          text = 'dist[' + e.u + '] + w = ' + fmtProse(step.du) + ' + ' + weightTerm(e.w) + ' = ' + fmtProse(step.candidate) +
            '. This is not smaller than the current dist[' + e.v + '] = ' + fmtProse(step.old) +
            ', so going through ' + e.u + ' does not improve the route and nothing changes.';
        }
        if (step.edgeInPass === 1) {
          facts.push({ text: 'Pass ' + step.pass + ' begins: updated is reset to false and all ' + E + ' edges are scanned in order.', tone: '' });
        }
        facts.push({
          text: 'dist[' + e.u + '] = ' + fmtProse(step.dist[e.u]) + ', dist[' + e.v + '] = ' + fmtProse(step.dist[e.v]) + ' (after this step)',
          tone: step.result === 'relaxed' ? 'success' : ''
        });
        if (e.w < 0) {
          facts.push({ text: 'Negative weight: using this edge lowers the total cost. Dijkstra could not handle this safely.', tone: 'warning' });
        }
        if (step.result === 'relaxed') {
          facts.push({ text: 'Updates so far in this pass: ' + step.passUpdates + ' (updated = true).', tone: '' });
        }
        break;
      }

      case 'pass-end':
        lead = 'Pass ' + step.pass + ' complete';
        text = step.passUpdates + ' distance' + (step.passUpdates === 1 ? ' was' : 's were') +
          ' improved during this pass, so updated = true. Another pass may still find shorter routes.';
        facts.push({ text: 'Distances: ' + distanceSummary(step.dist), tone: '' });
        if (step.pass === V - 1) {
          facts.push({ text: 'This was the last allowed pass (V - 1 = ' + (V - 1) + '). The negative cycle check comes next.', tone: 'warning' });
        } else {
          facts.push({ text: 'Passes used: ' + step.pass + ' of at most ' + (V - 1) + '.', tone: '' });
        }
        break;

      case 'early-stop':
        lead = 'Early stop after pass ' + step.pass;
        text = 'No distance changed during pass ' + step.pass + ' (updated = false). Because another pass would repeat exactly the same checks with the same distances, the algorithm leaves the pass loop with a break and moves on to the negative cycle check.';
        tone = 'success';
        facts.push({ text: 'Distances: ' + distanceSummary(step.dist), tone: '' });
        if (V - 1 - step.pass > 0) {
          facts.push({ text: 'Skipped ' + (V - 1 - step.pass) + ' unnecessary pass' + ((V - 1 - step.pass) === 1 ? '' : 'es') + '.', tone: 'success' });
        }
        break;

      case 'detect': {
        const e = graph.edges[step.edge];
        lead = 'Negative cycle check: ' + e.u + ARROW + e.v + ' (weight ' + fmtWeight(e.w) + ')';
        if (step.result === 'skipped') {
          text = 'dist[' + e.u + '] is Infinity, so ' + e.u + ' cannot be reached from ' + src +
            '. Edges leaving unreachable nodes are ignored, which means a negative cycle that cannot be reached from the source is never reported.';
        } else if (step.result === 'stable') {
          text = 'dist[' + e.u + '] + w = ' + fmtProse(step.du) + ' + ' + weightTerm(e.w) + ' = ' + fmtProse(step.candidate) +
            ', which is not smaller than dist[' + e.v + '] = ' + fmtProse(step.dv) + '. This edge can no longer be relaxed.';
        } else {
          text = 'dist[' + e.u + '] + w = ' + fmtProse(step.du) + ' + ' + weightTerm(e.w) + ' = ' + fmtProse(step.candidate) +
            ', which is still smaller than dist[' + e.v + '] = ' + fmtProse(step.dv) +
            ' even after all allowed passes. Without a negative cycle every shortest path has at most V - 1 edges, so this cannot happen. A negative-weight cycle is reachable from ' + src + '.';
          tone = 'danger';
        }
        if (step.edgeInPass === 1) {
          facts.push({ text: 'Extra scan: every edge is checked once more. Distances are not changed during this scan.', tone: '' });
        }
        break;
      }

      case 'complete': {
        const final = sim.final;
        if (final.hasCycle) {
          const cycle = final.cycle;
          lead = 'Negative cycle detected';
          tone = 'danger';
          text = 'A negative-weight cycle is reachable from ' + src + '. Each trip around it lowers the cost again, so shortest paths are undefined for every node affected by it.';
          if (cycle) {
            facts.push({ text: 'Cycle: ' + cycle.nodes.join(ARROW) + ARROW + cycle.nodes[0] + ' (total weight ' + fmtWeight(cycle.total) + ')', tone: 'danger' });
          }
          const affectedList = final.rows.filter((r) => r.status === 'affected').map((r) => r.node);
          if (affectedList.length) {
            facts.push({ text: 'Affected nodes (distance -Infinity, path undefined): ' + affectedList.join(', '), tone: 'danger' });
          }
          const validList = final.rows.filter((r) => r.status === 'ok').map((r) => r.node);
          if (validList.length) {
            facts.push({ text: 'Not affected by the cycle, so their shortest paths are still valid: ' + validList.join(', '), tone: 'success' });
          }
          if (graph.undirected) {
            facts.push({ text: 'Undirected mode: a negative edge can be walked back and forth, which already forms a negative cycle.', tone: 'warning' });
          }
        } else {
          lead = 'Algorithm complete';
          tone = 'success';
          text = 'No edge can be relaxed any more, so there is no negative cycle reachable from ' + src + '. The distances are the shortest path lengths from ' + src + '.' +
            (sim.stoppedEarly ? ' The algorithm stopped early after pass ' + sim.passesDone + '.' : '');
          facts.push({ text: 'Final distances: ' + distanceSummary(step.dist), tone: 'success' });
        }
        const unreachable = final.rows.filter((r) => r.status === 'unreachable').map((r) => r.node);
        if (unreachable.length) {
          facts.push({ text: 'Unreachable from ' + src + ': ' + unreachable.join(', ') + ' (distance stays Infinity).', tone: 'warning' });
        }
        break;
      }

      default:
        break;
    }

    return { lead: lead, text: text, facts: facts, tone: tone };
  }

  function renderDescription(step) {
    const content = describeStep(step);
    const card = $('descriptionCard');
    $('descriptionLead').textContent = content.lead;
    $('descriptionText').textContent = content.text;
    const list = $('descriptionFacts');
    clearChildren(list);
    content.facts.forEach((fact) => {
      const li = htmlEl('li', fact.tone ? 'is-' + fact.tone : '', fact.text);
      list.appendChild(li);
    });
    if (content.tone === 'danger' || content.tone === 'success') {
      card.dataset.state = content.tone;
    } else {
      card.removeAttribute('data-state');
    }
  }

  function renderProgress() {
    const total = state.sim.steps.length;
    const done = state.index + 1;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const finishedWithCycle = state.index >= 0 &&
      state.sim.steps[state.index].type === 'complete' && state.sim.final.hasCycle;
    $('progressText').textContent = percent + '%';
    $('progressFill').style.width = percent + '%';
    $('progressBar').setAttribute('aria-valuenow', String(percent));
    $('progressBar').classList.toggle('is-danger', finishedWithCycle);
    $('progressSub').textContent = 'Step ' + done + ' of ' + total + ' planned operations';
  }

  function renderResults(step) {
    const card = $('resultCard');
    if (!step || step.type !== 'complete') {
      card.hidden = true;
      return;
    }
    const final = state.sim.final;
    const graph = state.graph;
    const banner = $('resultBanner');

    banner.dataset.state = final.hasCycle ? 'danger' : 'success';
    if (final.hasCycle) {
      $('resultBannerTitle').textContent = 'Negative cycle detected';
      $('resultBannerText').textContent = 'Shortest paths are undefined for nodes affected by the cycle. Other reachable nodes keep valid results.';
    } else {
      $('resultBannerTitle').textContent = 'Algorithm complete';
      $('resultBannerText').textContent = final.reachableCount + ' of ' + graph.nodes.length +
        ' nodes reachable from ' + graph.start + '. Highlighted edges form the shortest-path tree.';
    }

    const body = $('resultTableBody');
    clearChildren(body);
    final.rows.forEach((row) => {
      const tr = document.createElement('tr');
      if (row.status === 'unreachable') { tr.className = 'is-unreachable'; }
      if (row.status === 'affected') { tr.className = 'is-affected'; }

      tr.appendChild(htmlEl('td', '', row.node));
      tr.appendChild(htmlEl('td', '', fmtVal(row.dist)));

      let pathText = 'Undefined';
      if (row.status === 'ok') { pathText = row.path.join(ARROW); }
      if (row.status === 'unreachable') { pathText = 'No path'; }
      tr.appendChild(htmlEl('td', '', pathText));

      const statusCell = document.createElement('td');
      const badge = htmlEl('span', 'bf-badge', row.status === 'ok' ? 'Reachable' : (row.status === 'unreachable' ? 'Unreachable' : 'Affected'));
      if (row.status === 'unreachable') { badge.classList.add('is-muted'); }
      if (row.status === 'affected') { badge.classList.add('is-danger'); }
      statusCell.appendChild(badge);
      tr.appendChild(statusCell);
      body.appendChild(tr);
    });

    const report = $('cycleReport');
    report.hidden = !final.hasCycle;
    if (final.hasCycle) {
      const cycle = final.cycle;
      $('cycleReportPath').textContent = cycle
        ? cycle.nodes.join(ARROW) + ARROW + cycle.nodes[0] + '  (total weight ' + fmtWeight(cycle.total) + ')'
        : 'A negative-weight cycle is reachable from ' + graph.start + '.';
      const affectedList = final.rows.filter((r) => r.status === 'affected').map((r) => r.node);
      $('cycleReportNote').textContent = 'Shortest paths are undefined for every node that can be reached from this cycle' +
        (affectedList.length ? ' (' + affectedList.join(', ') + ')' : '') +
        ', because each lap around it lowers the total cost. Unreachable nodes are unaffected.';
    }
    card.hidden = false;
  }

  function linesForStep(step) {
    if (!step) { return []; }
    switch (step.type) {
      case 'init': return [2, 3, 4, 5];
      case 'edge': {
        const lines = step.edgeInPass === 1 ? [6, 7, 8, 9] : [8, 9];
        return step.result === 'relaxed' ? lines.concat([10, 11, 12]) : lines;
      }
      case 'pass-end': return [13];
      case 'early-stop': return [13, 14];
      case 'detect': return step.result === 'cycle' ? [15, 16, 17] : [15, 16];
      case 'complete': return state.sim.final.hasCycle ? [17, 18] : [18];
      default: return [];
    }
  }

  function render() {
    const step = state.index >= 0 ? state.sim.steps[state.index] : null;
    renderDistances(step);
    renderGraph(step);
    renderEdgeCard(step);
    renderPassCard(step);
    renderDescription(step);
    renderProgress();
    renderResults(step);
    setRunningLines(linesForStep(step));
  }

  /* ------------------------------------------------------------------------
     8. CONTROLS AND INITIALIZATION
     ------------------------------------------------------------------------ */
  const startBtn = $('startBtn');
  const nextBtn = $('nextBtn');
  const resetBtn = $('resetBtn');

  function updateControls() {
    const status = state.status;
    startBtn.disabled = status !== 'ready';
    nextBtn.disabled = status !== 'running';
    resetBtn.disabled = status === 'idle' || status === 'ready';
  }

  function generateGraph() {
    const parsed = parseInputs();
    if (parsed.errors.length) {
      showErrors(parsed.errors);
      return false;
    }
    clearErrors();

    const graph = buildGraph(parsed);
    const sim = runBellmanFord(graph);
    state = {
      graph: graph,
      sim: sim,
      index: -1,
      status: 'ready',
      positions: {},
      edgeEls: [],
      nodeEls: {},
      distEls: {}
    };
    drawGraph();
    buildDistanceItems();
    render();
    updateControls();
    return true;
  }

  function startAlgorithm() {
    if (state.status !== 'ready') { return; }
    state.index = 0;
    state.status = state.sim.steps.length > 1 ? 'running' : 'finished';
    render();
    updateControls();
  }

  function nextStep() {
    if (state.status !== 'running') { return; }
    if (state.index < state.sim.steps.length - 1) {
      state.index += 1;
    }
    if (state.index >= state.sim.steps.length - 1) {
      state.status = 'finished';
    }
    render();
    updateControls();
  }

  function resetAlgorithm() {
    if (!state.graph) { return; }
    state.index = -1;
    state.status = 'ready';
    render();
    updateControls();
  }

  function loadExample(example) {
    nodesInput.value = example.nodes;
    startInput.value = example.start;
    edgesInput.value = example.edges;
    undirectedToggle.checked = example.undirected;
    generateGraph();
  }

  function init() {
    initConceptCards();
    initRelaxationDemo();
    initCycleDemo();
    initPseudocode();

    $('graphConfigForm').addEventListener('submit', (event) => {
      event.preventDefault();
      generateGraph();
    });
    $('loadExampleBtn').addEventListener('click', () => loadExample(EXAMPLES.standard));
    $('loadNegativeExampleBtn').addEventListener('click', () => loadExample(EXAMPLES.negativeCycle));

    startBtn.addEventListener('click', startAlgorithm);
    nextBtn.addEventListener('click', nextStep);
    resetBtn.addEventListener('click', resetAlgorithm);

    [nodesInput, startInput, edgesInput].forEach((input) => {
      input.addEventListener('input', () => input.classList.remove('is-invalid'));
    });

    updateControls();
    generateGraph();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();