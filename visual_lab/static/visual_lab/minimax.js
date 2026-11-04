/* ==========================================================================
   ThinkSphere - Minimax Visualizer
   File: static/visual_lab/minimax.js

   1. Helpers
   2. Theory section
   3. Pseudocode section
   4. Tree model, validation and Minimax trace (real recursive evaluation)
   5. Tree rendering
   6. Step rendering (cards, description, progress, result)
   7. Controls, Auto Play and initialization
   ========================================================================== */

(function () {
  'use strict';

  const root = document.getElementById('minimaxPage');
  if (!root) { return; }

  /* ------------------------------------------------------------------------
     1. HELPERS
     ------------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach((key) => {
      if (attrs[key] !== null && attrs[key] !== undefined) { node.setAttribute(key, attrs[key]); }
    });
    return node;
  }

  function htmlEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function clear(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  const round9 = (x) => Math.round(x * 1e9) / 1e9;
  const fmtNum = (x) => (x === Infinity ? '+\u221E' : x === -Infinity ? '-\u221E' : String(round9(x)));
  const fmtWord = (x) => (x === Infinity ? '+Infinity' : x === -Infinity ? '-Infinity' : String(round9(x)));
  const ARROW = ' \u2192 ';

  /* ------------------------------------------------------------------------
     2. THEORY SECTION
     ------------------------------------------------------------------------ */
  const DEMO = {
    pos: [[150, 30], [80, 95], [220, 95], [45, 160], [115, 160], [185, 160], [255, 160]],
    parent: [null, 0, 0, 1, 1, 2, 2],
    role: ['MAX', 'MIN', 'MIN', 'LEAF', 'LEAF', 'LEAF', 'LEAF'],
    val: [3, 3, 2, 3, 5, 2, 9]
  };

  function miniTree(cfg) {
    const reveal = new Set(cfg.reveal);
    const focus = new Set(cfg.focus || []);
    const hiEdges = new Set(cfg.edges || []);
    const svg = svgEl('svg', { viewBox: '0 0 300 195', 'class': 'mm-mini-svg', role: 'img', 'aria-label': cfg.label });

    DEMO.parent.forEach((p, i) => {
      if (p === null) { return; }
      svg.appendChild(svgEl('line', {
        x1: DEMO.pos[p][0], y1: DEMO.pos[p][1], x2: DEMO.pos[i][0], y2: DEMO.pos[i][1],
        'class': 'mm-edge' + (hiEdges.has(i) ? ' ' + (cfg.edgeClass || 'is-chosen') : '')
      }));
    });

    DEMO.pos.forEach((pt, i) => {
      const roleClass = DEMO.role[i] === 'MAX' ? 'is-max' : DEMO.role[i] === 'MIN' ? 'is-min' : 'is-leaf';
      const focusClass = focus.has(i) ? ' ' + (cfg.focusClass || 'is-focus') : '';
      svg.appendChild(svgEl('circle', { cx: pt[0], cy: pt[1], r: 17, 'class': 'mm-node ' + roleClass + focusClass }));
      const text = svgEl('text', { x: pt[0], y: pt[1], 'class': 'mm-node-text' + (reveal.has(i) ? '' : ' is-unknown') });
      text.textContent = reveal.has(i) ? String(DEMO.val[i]) : '?';
      svg.appendChild(text);
      const label = svgEl('text', { x: pt[0], y: pt[1] + 30, 'class': 'mm-role-text' });
      label.textContent = DEMO.role[i];
      svg.appendChild(label);
    });

    const wrap = htmlEl('div');
    wrap.appendChild(svg);
    wrap.appendChild(htmlEl('p', 'mm-caption', cfg.caption));
    return wrap;
  }

  function htmlVisual(markup) {
    const wrap = htmlEl('div');
    wrap.innerHTML = markup; // static, trusted strings only (no user input)
    return wrap;
  }

  const ALL = [0, 1, 2, 3, 4, 5, 6];
  const TOPICS = {
    what: {
      title: 'What is the Minimax algorithm?',
      body: [
        'Minimax is a decision rule for two-player, turn-based games. It looks ahead through the possible sequences of moves and assumes that <strong>both players play perfectly</strong>.',
        'It then picks the move that gives the best result you can still guarantee, even if the opponent answers in the strongest possible way.'
      ],
      visual: () => miniTree({ reveal: ALL, label: 'Example game tree', caption: 'MAX moves, then MIN replies. The root value is 3.' })
    },
    why: {
      title: 'Why is it used in game theory?',
      body: [
        'In a <strong>zero-sum game</strong> one player\'s gain is exactly the other player\'s loss. The opponent is not random: they actively try to hurt you.',
        'Minimax gives a rational strategy for that situation. It protects against the worst case, which is why it is the starting point for game-playing AI in chess, checkers and many other games.'
      ],
      visual: () => htmlVisual(
        '<div class="mm-zero-bar"><span>MIN prefers low</span><span>0</span><span>MAX prefers high</span></div>' +
        '<p class="mm-caption">Zero-sum: a utility of +3 for MAX is -3 for MIN. One number describes both players.</p>')
    },
    players: {
      title: 'MAX player and MIN player',
      body: [
        '<strong>MAX</strong> is the player we are choosing a move for. MAX wants the utility to be as <strong>high</strong> as possible.',
        '<strong>MIN</strong> is the opponent. MIN wants the utility to be as <strong>low</strong> as possible. The two players alternate, so tree levels alternate between MAX and MIN.'
      ],
      visual: () => miniTree({ reveal: [], label: 'MAX and MIN levels', caption: 'Blue levels are MAX turns, purple levels are MIN turns.' })
    },
    tree: {
      title: 'The game tree',
      body: [
        'A game tree lists every way the game can continue. Each <strong>node</strong> is a game state and each <strong>edge</strong> is a legal move.',
        'The <strong>root</strong> is the current position. Following edges downward shows moves, replies, and so on, until the game ends or the search depth limit is reached.'
      ],
      visual: () => miniTree({ reveal: [], focus: [0], label: 'Game tree structure', caption: 'The root is the current position. Leaves are where the search stops.' })
    },
    utility: {
      title: 'Utility values and terminal states',
      body: [
        'A <strong>terminal state</strong> is a position where the game is over, such as a win, a loss or a draw. Each one gets a <strong>utility value</strong>, a number that says how good it is for MAX, for example +1 win, 0 draw, -1 loss.',
        'When the tree is too big to search to the end, programs stop at a depth limit and use an evaluation function to estimate the utility.'
      ],
      visual: () => miniTree({ reveal: [3, 4, 5, 6], focus: [3, 4, 5, 6], label: 'Leaf utility values', caption: 'The leaves hold the utilities. The inner nodes are still unknown.' })
    },
    max: {
      title: 'How MAX chooses the maximum value',
      body: [
        'At a MAX node, the player to move can choose any child. A rational MAX chooses the child with the <strong>largest</strong> value, so the node\'s value is the maximum of its children.',
        'Here the two MIN children are worth 3 and 2, so the MAX root is worth max(3, 2) = 3.'
      ],
      visual: () => miniTree({ reveal: [1, 2, 3, 4, 5, 6], focus: [0], edges: [1, 2], label: 'MAX takes the maximum', caption: 'MAX(3, 2) = 3. MAX prefers the left branch.' })
    },
    min: {
      title: 'How MIN chooses the minimum value',
      body: [
        'At a MIN node, the opponent chooses. A rational MIN picks the child with the <strong>smallest</strong> value, because that is the worst outcome for MAX.',
        'Here the leaves under the left MIN node are 3 and 5, so that node is worth min(3, 5) = 3.'
      ],
      visual: () => miniTree({ reveal: [3, 4, 5, 6], focus: [1], edges: [3, 4], label: 'MIN takes the minimum', caption: 'MIN(3, 5) = 3. MIN would steer the game to the leaf 3.' })
    },
    optimal: {
      title: 'How the optimal move is found',
      body: [
        'Minimax is a <strong>depth-first</strong> search. It goes down to the leaves first, then values travel back up (backtracking): every MAX node takes the highest child value and every MIN node the lowest.',
        'At the root, MAX plays the move whose child has the same value as the root. Following the chosen child at every level gives the optimal path.'
      ],
      visual: () => miniTree({ reveal: ALL, focus: [0, 1, 3], edges: [1, 3], edgeClass: 'is-final', focusClass: 'is-final', label: 'Optimal path', caption: 'Best guaranteed value is 3, reached through the left branch.' })
    },
    complexity: {
      title: 'Time and space complexity',
      body: [
        'Minimax visits every node of the tree to the depth limit, so the running time grows exponentially with depth. It only needs to remember the current path, so memory use is small.'
      ],
      visual: () => htmlVisual(
        '<div class="mm-info-grid">' +
        '<div class="mm-info-box"><h4>Time</h4><p class="mm-big">O(b<sup>m</sup>)</p></div>' +
        '<div class="mm-info-box"><h4>Space</h4><p class="mm-big">O(b &middot; m)</p><p>or O(m) if moves are generated one at a time</p></div>' +
        '<div class="mm-info-box mm-info-wide"><p><strong>b</strong> = number of legal moves per position (branching factor). <strong>m</strong> = maximum depth of the tree. Tic Tac Toe has at most 9! = 362,880 move sequences, while chess has about 35 moves per position, which is why pruning is needed.</p></div>' +
        '</div>')
    },
    proscons: {
      title: 'Advantages and limitations',
      body: [
        'Minimax is simple and gives provably optimal play on small games, but it does not scale on its own.'
      ],
      visual: () => htmlVisual(
        '<div class="mm-info-grid">' +
        '<div class="mm-info-box is-good"><h4>Advantages</h4><ul><li>Optimal against a perfect opponent</li><li>Easy to understand and implement</li><li>Complete on finite trees</li><li>Basis for alpha-beta pruning</li></ul></div>' +
        '<div class="mm-info-box is-bad"><h4>Limitations</h4><ul><li>Exponential time in the depth</li><li>Needs a good evaluation function at the cutoff</li><li>Assumes the opponent plays perfectly</li><li>Only for turn-based, perfect-information games</li></ul></div>' +
        '</div>')
    }
  };

  function initTheory() {
    const buttons = Array.prototype.slice.call(root.querySelectorAll('.mm-topic'));
    const title = $('theoryTitle');
    const body = $('theoryBody');
    const visual = $('theoryVisual');

    function select(id) {
      const topic = TOPICS[id];
      if (!topic) { return; }
      buttons.forEach((button) => {
        const active = button.dataset.topic === id;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      title.textContent = topic.title;
      body.innerHTML = topic.body.map((paragraph) => '<p>' + paragraph + '</p>').join('');
      clear(visual);
      visual.appendChild(topic.visual());
    }

    buttons.forEach((button) => button.addEventListener('click', () => select(button.dataset.topic)));
    select('what');
  }

  /* ------------------------------------------------------------------------
     3. PSEUDOCODE SECTION
     ------------------------------------------------------------------------ */
  const codeLines = Array.prototype.slice.call(root.querySelectorAll('.mm-code-line'));

  function initPseudocode() {
    codeLines.forEach((button) => {
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        codeLines.forEach((other) => {
          other.classList.remove('is-active');
          other.setAttribute('aria-pressed', 'false');
        });
        button.classList.add('is-active');
        button.setAttribute('aria-pressed', 'true');
        $('pseudoExplainTitle').textContent = button.dataset.title;
        $('pseudoExplainText').textContent = button.dataset.text;
        $('pseudoLineChip').textContent = 'Line ' + button.dataset.line + ' of ' + codeLines.length;
      });
    });
  }

  function setRunningLines(numbers) {
    codeLines.forEach((button) => {
      button.classList.toggle('is-running', numbers.indexOf(Number(button.dataset.line)) !== -1);
    });
  }

  /* ------------------------------------------------------------------------
     4. TREE MODEL, VALIDATION AND MINIMAX TRACE
     ------------------------------------------------------------------------ */
  const depthSelect = $('depthSelect');
  const branchSelect = $('branchSelect');
  const rootPlayerSelect = $('rootPlayerSelect');
  const leafInput = $('leafValues');

  const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const MAX_ABS = 1000000;

  const EXAMPLES = {
    classic: { depth: 2, branch: 2, root: 'MAX', leaves: '3, 5, 2, 9' },
    three: { depth: 3, branch: 2, root: 'MAX', leaves: '3, 5, 6, 9, 1, 2, 0, -1' },
    ternary: { depth: 2, branch: 3, root: 'MAX', leaves: '-2, 4, 1, 7, -5, 3, 0, 6, -1' },
    minRoot: { depth: 3, branch: 2, root: 'MIN', leaves: '4, 8, 2, 6, 7, 1, 5, 3' }
  };

  function leafCount() {
    return Math.pow(Number(branchSelect.value), Number(depthSelect.value));
  }

  function updateConfigHelpers() {
    const depth = Number(depthSelect.value);
    const branch = Number(branchSelect.value);
    const rootRole = rootPlayerSelect.value;
    const otherRole = rootRole === 'MAX' ? 'MIN' : 'MAX';

    $('leafHint').textContent = 'Enter exactly ' + leafCount() + ' values (' + branch + '^' + depth +
      '), from left to right, separated by commas.';

    const plan = $('levelPlan');
    clear(plan);
    for (let level = 0; level <= depth; level += 1) {
      const count = Math.pow(branch, level);
      const li = document.createElement('li');
      if (level === depth) {
        li.className = 'is-leaf';
        li.appendChild(htmlEl('span', 'mm-tag', 'Level ' + level + ': Leaves'));
        li.appendChild(htmlEl('span', '', count + ' utility value' + (count === 1 ? '' : 's')));
      } else {
        const role = level % 2 === 0 ? rootRole : otherRole;
        li.className = role === 'MAX' ? 'is-max' : 'is-min';
        li.appendChild(htmlEl('span', 'mm-tag', 'Level ' + level + ': ' + role));
        li.appendChild(htmlEl('span', '', count + ' node' + (count === 1 ? '' : 's')));
      }
      plan.appendChild(li);
    }
  }

  function readConfig() {
    const depth = Number(depthSelect.value);
    const branch = Number(branchSelect.value);
    const rootRole = rootPlayerSelect.value;
    const expected = leafCount();
    const text = leafInput.value.trim();

    if (!text) { return { error: 'Enter ' + expected + ' leaf values.' }; }
    if (/^\s*,|,\s*$|,\s*,/.test(text)) {
      return { error: 'Empty value found. Check for extra or missing commas.' };
    }
    const tokens = text.split(/[,;\s]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i += 1) {
      if (!NUMBER_PATTERN.test(tokens[i])) {
        return { error: '"' + tokens[i] + '" is not a valid number. Use numbers separated by commas (negatives and 0 are allowed).' };
      }
      if (Math.abs(parseFloat(tokens[i])) > MAX_ABS) {
        return { error: 'Value ' + tokens[i] + ' is too large. Use values between -' + MAX_ABS + ' and ' + MAX_ABS + '.' };
      }
    }
    if (tokens.length !== expected) {
      return { error: 'Depth ' + depth + ' with ' + branch + ' moves per node needs exactly ' + expected +
        ' leaf values, but you entered ' + tokens.length + '.' };
    }
    return { depth: depth, branch: branch, rootRole: rootRole, leaves: tokens.map(parseFloat) };
  }

  function buildModel(cfg) {
    const nodes = [];
    const otherRole = cfg.rootRole === 'MAX' ? 'MIN' : 'MAX';
    let id = 0;
    for (let level = 0; level <= cfg.depth; level += 1) {
      const count = Math.pow(cfg.branch, level);
      for (let k = 0; k < count; k += 1) {
        nodes.push({
          id: id, level: level, isLeaf: level === cfg.depth,
          role: level % 2 === 0 ? cfg.rootRole : otherRole,
          children: [], parent: null, utility: null, x: 0, y: 0
        });
        id += 1;
      }
    }
    const firstLeaf = nodes.find((n) => n.isLeaf).id;
    nodes.forEach((n) => {
      if (n.id > 0) { n.parent = Math.floor((n.id - 1) / cfg.branch); }
      if (n.isLeaf) {
        n.utility = cfg.leaves[n.id - firstLeaf];
      } else {
        for (let c = 1; c <= cfg.branch; c += 1) { n.children.push(n.id * cfg.branch + c); }
      }
    });
    return { depth: cfg.depth, branch: cfg.branch, rootRole: cfg.rootRole, nodes: nodes };
  }

  const NODE_RADIUS = 22;
  const LEAF_SLOT = 62;
  const LEVEL_GAP = 100;
  const TOP = 42;
  const BOTTOM = 52;

  function layoutModel(model) {
    const nodes = model.nodes;
    const leaves = nodes.filter((n) => n.isLeaf);
    const width = Math.max(480, leaves.length * LEAF_SLOT);
    const slot = width / leaves.length;
    leaves.forEach((leaf, k) => { leaf.x = (k + 0.5) * slot; });
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      if (!n.isLeaf) {
        n.x = (nodes[n.children[0]].x + nodes[n.children[n.children.length - 1]].x) / 2;
      }
      n.y = TOP + n.level * LEVEL_GAP;
    }
    model.width = width;
    model.height = TOP + model.depth * LEVEL_GAP + BOTTOM;
  }

  /* Runs the real recursive Minimax and records a snapshot after every operation. */
  function buildSteps(model) {
    const nodes = model.nodes;
    const n = nodes.length;
    const val = nodes.map((node) => (node.isLeaf ? node.utility : null));
    const best = new Array(n).fill(null);
    const status = new Array(n).fill('idle');
    const chosen = new Array(n).fill(null);
    const returned = new Array(n).fill(false);
    const stack = [];
    const steps = [];

    function snap(data) {
      steps.push(Object.assign(data, {
        val: val.slice(), best: best.slice(), status: status.slice(),
        chosen: chosen.slice(), returned: returned.slice(), stack: stack.slice()
      }));
    }

    function minimax(id) {
      const node = nodes[id];
      stack.push(id);
      status[id] = 'active';

      if (node.isLeaf) {
        snap({ type: 'leaf', node: id });
        status[id] = 'done';
        stack.pop();
        return node.utility;
      }

      const isMax = node.role === 'MAX';
      best[id] = isMax ? -Infinity : Infinity;
      snap({ type: 'enter', node: id });

      node.children.forEach((childId) => {
        const value = minimax(childId);
        const old = best[id];
        const improved = isMax ? value > old : value < old;
        if (improved) { best[id] = value; chosen[id] = childId; }
        returned[childId] = true;
        snap({ type: 'update', node: id, child: childId, value: value, old: old, improved: improved });
      });

      val[id] = best[id];
      status[id] = 'done';
      snap({ type: 'finish', node: id });
      stack.pop();
      return val[id];
    }

    minimax(0);

    const path = [0];
    while (!nodes[path[path.length - 1]].isLeaf) { path.push(chosen[path[path.length - 1]]); }
    snap({ type: 'complete', node: 0, path: path });
    return steps;
  }

  /* ------------------------------------------------------------------------
     5. TREE RENDERING
     ------------------------------------------------------------------------ */
  const treeSvg = $('treeSvg');
  const treeScroll = $('treeScroll');

  const S = { model: null, steps: [], index: -1, playing: false, timer: null };

  function nodeLabel(node, step) {
    if (node.isLeaf) { return { text: String(round9(node.utility)), cls: '' }; }
    if (!step) { return { text: '?', cls: ' is-unknown' }; }
    if (step.val[node.id] !== null) { return { text: fmtNum(step.val[node.id]), cls: '' }; }
    if (step.best[node.id] !== null) { return { text: fmtNum(step.best[node.id]), cls: ' is-partial' }; }
    return { text: '?', cls: ' is-unknown' };
  }

  function renderTree(step) {
    clear(treeSvg);
    const model = S.model;
    if (!model) {
      treeSvg.setAttribute('viewBox', '0 0 480 160');
      treeSvg.setAttribute('width', '480');
      treeSvg.setAttribute('height', '160');
      return;
    }
    const nodes = model.nodes;
    treeSvg.setAttribute('viewBox', '0 0 ' + model.width + ' ' + model.height);
    treeSvg.setAttribute('width', model.width);
    treeSvg.setAttribute('height', model.height);

    const stackSet = new Set(step ? step.stack : []);
    const pathSet = new Set(step && step.type === 'complete' ? step.path : []);

    nodes.forEach((node) => {
      if (node.parent === null) { return; }
      const parent = nodes[node.parent];
      let cls = 'mm-edge';
      if (step) {
        if (step.returned[node.id]) { cls += ' is-returned'; }
        if (step.chosen[parent.id] === node.id) { cls += ' is-chosen'; }
        if (stackSet.has(node.id) && stackSet.has(parent.id)) { cls += ' is-stack'; }
        if (pathSet.has(node.id) && pathSet.has(parent.id)) { cls += ' is-final'; }
      }
      treeSvg.appendChild(svgEl('line', { x1: parent.x, y1: parent.y, x2: node.x, y2: node.y, 'class': cls }));
    });

    nodes.forEach((node) => {
      let cls = 'mm-node ' + (node.isLeaf ? 'is-leaf' : node.role === 'MAX' ? 'is-max' : 'is-min');
      if (step) {
        if (stackSet.has(node.id)) { cls += ' is-stack'; }
        if (step.type === 'update' && step.child === node.id) { cls += ' is-returning'; }
        if (step.node === node.id && step.type !== 'complete') { cls += ' is-active'; }
        if (pathSet.has(node.id)) { cls += ' is-final'; }
      }
      treeSvg.appendChild(svgEl('circle', { cx: node.x, cy: node.y, r: NODE_RADIUS, 'class': cls }));

      const label = nodeLabel(node, step);
      const text = svgEl('text', { x: node.x, y: node.y, 'class': 'mm-node-text' + label.cls });
      text.textContent = label.text;
      treeSvg.appendChild(text);

      const role = svgEl('text', { x: node.x, y: node.y + NODE_RADIUS + 13, 'class': 'mm-role-text' });
      role.textContent = node.isLeaf ? 'LEAF' : node.role;
      treeSvg.appendChild(role);
    });
  }

  /* Scrolls only the tree container, and only when the node is out of view. */
  function focusNode(node) {
    if (!node) { return; }
    const margin = 50;
    const visibleX = node.x > treeScroll.scrollLeft + margin && node.x < treeScroll.scrollLeft + treeScroll.clientWidth - margin;
    const visibleY = node.y > treeScroll.scrollTop + margin && node.y < treeScroll.scrollTop + treeScroll.clientHeight - margin;
    if (visibleX && visibleY) { return; }
    treeScroll.scrollTo({
      left: Math.max(0, node.x - treeScroll.clientWidth / 2),
      top: Math.max(0, node.y - treeScroll.clientHeight / 2),
      behavior: 'smooth'
    });
  }

  /* ------------------------------------------------------------------------
     6. STEP RENDERING
     ------------------------------------------------------------------------ */
  const branchNo = (parent, childId) => parent.children.indexOf(childId) + 1;

  function describeStep(step) {
    const model = S.model;
    const nodes = model.nodes;
    const facts = [];
    let lead = '';
    let text = '';
    let tone = '';

    if (!step) {
      const leaves = nodes.filter((n) => n.isLeaf).length;
      lead = 'Tree ready';
      text = 'Tree generated: depth ' + model.depth + ', ' + model.branch + ' moves per node, ' + nodes.length +
        ' nodes and ' + leaves + ' leaves. The root is a ' + model.rootRole + ' node. Select Start, then step through the search with Next Step and Previous Step, or use Auto Play.';
      facts.push({ text: 'Minimax goes depth-first: it reaches the first leaf before any inner node gets a value.', tone: '' });
      return { lead: lead, text: text, facts: facts, tone: tone };
    }

    const node = nodes[step.node];
    const isMax = node.role === 'MAX';
    const word = isMax ? 'max' : 'min';
    const parent = node.parent === null ? null : nodes[node.parent];

    switch (step.type) {
      case 'leaf':
        lead = 'Leaf node ' + node.id + ': terminal state';
        text = 'This node has no children, so the search stops here. Minimax returns its utility value ' + fmtWord(node.utility) +
          ' to the parent, node ' + parent.id + ' (' + parent.role + ').';
        facts.push({ text: 'Utility of node ' + node.id + ' = ' + fmtWord(node.utility), tone: 'success' });
        break;

      case 'enter':
        lead = 'Visiting ' + node.role + ' node ' + node.id;
        text = isMax
          ? 'This is a MAX node, so it will take the largest value among its children. best starts at -Infinity, so the first child value will replace it.'
          : 'This is a MIN node, so it will take the smallest value among its children. best starts at +Infinity, so the first child value will replace it.';
        text += ' The search now goes down into the first child, node ' + node.children[0] + '.';
        facts.push({ text: 'Depth ' + node.level + ' of ' + model.depth + '. Children: ' + node.children.join(', ') + '.', tone: '' });
        break;

      case 'update': {
        const idx = node.children.indexOf(step.child);
        lead = 'Back at ' + node.role + ' node ' + node.id + ': child ' + step.child + ' returned ' + fmtWord(step.value);
        text = word + '(' + fmtWord(step.old) + ', ' + fmtWord(step.value) + ') = ' +
          fmtWord(step.improved ? step.value : step.old) + '. ';
        text += step.improved
          ? fmtWord(step.value) + ' is ' + (isMax ? 'larger' : 'smaller') + ' than the previous best, so node ' + step.child + ' (branch ' + branchNo(node, step.child) + ') is now the preferred move.'
          : fmtWord(step.value) + ' is not ' + (isMax ? 'larger' : 'smaller') + ' than the current best, so the earlier choice stays.';
        tone = step.improved ? 'success' : '';
        const soFar = node.children.slice(0, idx + 1)
          .map((c) => 'node ' + c + ' = ' + fmtWord(step.val[c])).join(', ');
        facts.push({ text: 'Child values so far: ' + soFar, tone: '' });
        facts.push({
          text: idx < node.children.length - 1
            ? 'Next: go down into node ' + node.children[idx + 1] + '.'
            : 'All children are evaluated. Next the node returns its value.',
          tone: ''
        });
        break;
      }

      case 'finish': {
        const values = node.children.map((c) => step.val[c]);
        lead = node.role + ' node ' + node.id + ' is done: value = ' + fmtWord(step.val[node.id]);
        text = 'All ' + node.children.length + ' children are evaluated (' + values.map(fmtWord).join(', ') + '). ' +
          (isMax ? 'MAX keeps the highest value, ' : 'MIN keeps the lowest value, ') + fmtWord(step.val[node.id]) +
          ', which comes from node ' + step.chosen[node.id] + '. ';
        text += parent
          ? 'This value is returned to the parent, node ' + parent.id + ' (' + parent.role + ').'
          : 'This is the root, so the search is complete.';
        facts.push({ text: 'Best child: node ' + step.chosen[node.id] + ' (branch ' + branchNo(node, step.chosen[node.id]) + ')', tone: 'success' });
        break;
      }

      case 'complete': {
        const rootNode = nodes[0];
        const firstMove = step.chosen[0];
        lead = 'Minimax complete';
        tone = 'success';
        text = 'The root (' + rootNode.role + ') has value ' + fmtWord(step.val[0]) + '. This is the best outcome ' + rootNode.role +
          ' can guarantee when both players play perfectly. The optimal first move is branch ' + branchNo(rootNode, firstMove) +
          ' (node ' + firstMove + ').';
        facts.push({ text: 'Optimal path: ' + step.path.join(ARROW), tone: 'success' });
        facts.push({ text: 'Each step on the path follows the best child chosen at that node.', tone: '' });
        break;
      }

      default:
        break;
    }
    return { lead: lead, text: text, facts: facts, tone: tone };
  }

  function operationLabel(step) {
    const node = S.model.nodes[step.node];
    switch (step.type) {
      case 'leaf': return 'Return utility';
      case 'enter': return 'Go down, best = ' + (node.role === 'MAX' ? '-\u221E' : '+\u221E');
      case 'update': return 'Compare with ' + (node.role === 'MAX' ? 'max' : 'min');
      case 'finish': return 'Return value to parent';
      default: return 'Finished';
    }
  }

  function linesForStep(step) {
    if (!step) { return []; }
    const isMax = S.model.nodes[step.node].role === 'MAX';
    switch (step.type) {
      case 'leaf': return [1, 2, 3];
      case 'enter': return isMax ? [1, 4, 5, 6] : [1, 10, 11, 12];
      case 'update': return isMax ? [7, 8] : [13, 14];
      case 'finish': return isMax ? [9] : [15];
      case 'complete': return [16, 17];
      default: return [];
    }
  }

  function renderStep() {
    const step = S.index >= 0 ? S.steps[S.index] : null;
    const model = S.model;
    const total = S.steps.length;

    renderTree(step);

    // State cards
    const player = $('stateCurrentPlayer');
    if (step) {
      const node = model.nodes[step.node];
      player.textContent = step.type === 'leaf' ? 'Terminal' : node.role;
      player.dataset.role = step.type === 'leaf' ? 'none' : node.role;
      $('stateDepth').textContent = node.level + ' / ' + model.depth;
      $('stateNode').textContent = 'Node ' + node.id;
      $('stateOperation').textContent = operationLabel(step);
    } else {
      player.textContent = '-';
      player.dataset.role = 'none';
      $('stateDepth').textContent = '-';
      $('stateNode').textContent = '-';
      $('stateOperation').textContent = model ? 'Not started' : 'Generate a tree';
    }

    // Description
    const content = model ? describeStep(step) : { lead: 'No tree yet', text: 'Configure a tree above and select Generate Tree.', facts: [], tone: '' };
    $('descriptionLead').textContent = content.lead;
    $('descriptionText').textContent = content.text;
    const facts = $('descriptionFacts');
    clear(facts);
    content.facts.forEach((fact) => facts.appendChild(htmlEl('li', fact.tone ? 'is-' + fact.tone : '', fact.text)));
    const card = $('descriptionCard');
    if (content.tone === 'success') { card.dataset.state = 'success'; } else { card.removeAttribute('data-state'); }

    // Progress
    const done = S.index + 1;
    const percent = total ? Math.round((done / total) * 100) : 0;
    $('progressText').textContent = percent + '%';
    $('progressFill').style.width = percent + '%';
    $('progressBar').setAttribute('aria-valuenow', String(percent));
    $('progressSub').textContent = 'Step ' + done + ' of ' + total;
    $('stepCounter').textContent = done > 0 ? 'Step ' + done + ' / ' + total : 'Step 0';
    $('treeStatus').textContent = model
      ? (step ? content.lead : 'Tree generated. Select Start to begin.')
      : 'Generate a tree to begin.';

    // Result
    const resultCard = $('resultCard');
    if (step && step.type === 'complete') {
      const rootNode = model.nodes[0];
      $('resultValue').textContent = fmtNum(step.val[0]);
      $('resultMove').textContent = 'Branch ' + branchNo(rootNode, step.chosen[0]) + ' (node ' + step.chosen[0] + ')';
      $('resultPath').textContent = step.path.map((id) => id + ' (' + fmtNum(step.val[id]) + ')').join(ARROW);
      resultCard.hidden = false;
    } else {
      resultCard.hidden = true;
    }

    setRunningLines(linesForStep(step));
    if (step) { focusNode(model.nodes[step.node]); }
  }

  /* ------------------------------------------------------------------------
     7. CONTROLS, AUTO PLAY AND INITIALIZATION
     ------------------------------------------------------------------------ */
  const startBtn = $('startBtn');
  const prevBtn = $('prevBtn');
  const nextBtn = $('nextBtn');
  const autoBtn = $('autoBtn');
  const resetBtn = $('resetBtn');
  const speedSelect = $('speedSelect');
  const configError = $('configError');

  function updateControls() {
    const has = !!S.model;
    const last = S.steps.length - 1;
    startBtn.disabled = !has || S.index !== -1 || S.playing;
    prevBtn.disabled = !has || S.index < 0;
    nextBtn.disabled = !has || S.index < 0 || S.index >= last;
    autoBtn.disabled = !has;
    resetBtn.disabled = !has || S.index < 0;
  }

  function go(index) {
    S.index = index;
    renderStep();
    updateControls();
  }

  function stopAuto() {
    if (S.timer) { clearTimeout(S.timer); }
    S.timer = null;
    S.playing = false;
    autoBtn.textContent = 'Auto Play';
    autoBtn.classList.remove('is-playing');
  }

  function tick() {
    if (!S.playing) { return; }
    const last = S.steps.length - 1;
    if (S.index >= last) { stopAuto(); updateControls(); return; }
    go(S.index + 1);
    if (S.index >= last) { stopAuto(); updateControls(); return; }
    S.timer = setTimeout(tick, Number(speedSelect.value));
  }

  function toggleAuto() {
    if (!S.model) { return; }
    if (S.playing) { stopAuto(); updateControls(); return; }
    if (S.index >= S.steps.length - 1) { S.index = -1; }
    S.playing = true;
    autoBtn.textContent = 'Pause';
    autoBtn.classList.add('is-playing');
    tick();
  }

  function showConfigError(message) {
    configError.textContent = message;
    configError.hidden = false;
    leafInput.classList.add('is-invalid');
  }

  function clearConfigError() {
    configError.hidden = true;
    configError.textContent = '';
    leafInput.classList.remove('is-invalid');
  }

  function generateTree() {
    const cfg = readConfig();
    if (cfg.error) {
      showConfigError(cfg.error);
      return false;
    }
    clearConfigError();
    stopAuto();
    S.model = buildModel(cfg);
    layoutModel(S.model);
    S.steps = buildSteps(S.model);
    S.index = -1;
    renderStep();
    updateControls();
    treeScroll.scrollTo({ left: 0, top: 0 });
    return true;
  }

  function loadExample(name) {
    const example = EXAMPLES[name];
    if (!example) { return; }
    depthSelect.value = String(example.depth);
    branchSelect.value = String(example.branch);
    rootPlayerSelect.value = example.root;
    leafInput.value = example.leaves;
    updateConfigHelpers();
    generateTree();
  }

  function init() {
    initTheory();
    initPseudocode();

    [depthSelect, branchSelect, rootPlayerSelect].forEach((control) => {
      control.addEventListener('change', updateConfigHelpers);
    });
    leafInput.addEventListener('input', clearConfigError);

    $('treeConfigForm').addEventListener('submit', (event) => {
      event.preventDefault();
      generateTree();
    });
    root.querySelectorAll('[data-example]').forEach((button) => {
      button.addEventListener('click', () => loadExample(button.dataset.example));
    });

    startBtn.addEventListener('click', () => { stopAuto(); go(0); });
    prevBtn.addEventListener('click', () => { stopAuto(); go(S.index - 1); });
    nextBtn.addEventListener('click', () => { stopAuto(); go(S.index + 1); });
    autoBtn.addEventListener('click', toggleAuto);
    resetBtn.addEventListener('click', () => { stopAuto(); go(-1); });

    updateConfigHelpers();
    renderStep();
    updateControls();
    generateTree();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();