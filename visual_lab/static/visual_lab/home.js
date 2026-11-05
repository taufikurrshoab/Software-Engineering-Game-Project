/* Visual Lab home: algorithm tree + live decision demo. Vanilla JS, no dependencies. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  // The tree build and the node travel are the identity of this page, so they always play.
  // Set to true to make them skip when the OS has "reduce motion" turned on.
  const RESPECT_REDUCED_MOTION = false;
  const reduce = RESPECT_REDUCED_MOTION && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
  const D = reduce ? 1 : 1700;

  /* ---------- Tree ---------- */
  const BR = { traversal: ["Graph traversal", "--primary"], path: ["Shortest path", "--accent"], play: ["Game AI", "--secondary"] };
  const IC = {
    bfs: '<circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10" stroke-dasharray="2 3"/>',
    dfs: '<path d="M5 4l5 5-3 5 6 4-2 4"/><circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="21" r="1.5"/><circle cx="10" cy="9" r="1.5"/>',
    dijkstra: '<circle cx="5" cy="18" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="17" r="2"/><path d="M6 16l5-9M14 6l4 9M7 18h10"/>',
    bellman_ford: '<path d="M20 12a8 8 0 0 0-14-5M4 4v4h4M4 12a8 8 0 0 0 14 5M20 20v-4h-4"/>',
    astar: '<circle cx="12" cy="12" r="8"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><circle cx="12" cy="12" r="1.6"/>',
    minimax: '<circle cx="12" cy="4" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><path d="M11 6l-4 4M13 6l4 4M5 14l-2 5M7 14l2 5M17 14l-2 5M19 14l2 5"/>',
    puzzle8: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'
  };
  const glyph = id => `<g class="vlt-gl" transform="translate(-17 -17) scale(1.42)">${IC[id] || ""}</g>`;

  const stage = $("#vlt-stage"), tree = $("#vlt-tree"), head = $("#vlt-head"), socket = $("#vlt-socket"),
        detail = $("#vlt-detail"), trailp = $("#vlt-trailp");
  const items = [...document.querySelectorAll("#vlt-data li")].map(li => ({
    id: li.dataset.id, br: li.dataset.branch, short: li.dataset.short, name: li.dataset.name, url: li.dataset.url,
    facts: (li.dataset.facts || "").split("|"), desc: li.textContent.trim()
  }));

  let built = false, cur = null, seq = 0, horizontal = null;

  const curve = (a, b, h) => h
    ? `M${a.x} ${a.y}C${(a.x + b.x) / 2} ${a.y} ${(a.x + b.x) / 2} ${b.y} ${b.x} ${b.y}`
    : `M${a.x} ${a.y}C${a.x} ${(a.y + b.y) / 2} ${b.x} ${(a.y + b.y) / 2} ${b.x} ${b.y}`;

  function buildTree(animate) {
    const h = innerWidth < 700;
    horizontal = h;
    const brs = Object.keys(BR).map(k => ({ k, leaves: items.filter(i => i.br === k) })).filter(b => b.leaves.length);
    let root, vb;
    if (!h) {
      const slot = 1000 / brs.length;
      brs.forEach((b, bi) => {
        b.x = slot * (bi + .5); b.y = 190;
        b.leaves.forEach((l, i) => { l.x = b.x + (i - (b.leaves.length - 1) / 2) * 125; l.y = 360; });
      });
      root = { x: 500, y: 50 }; vb = [1000, 450];
    } else {
      let k = 0;
      brs.forEach(b => {
        b.leaves.forEach(l => { l.x = 345; l.y = 60 + k++ * 98; });
        b.x = 205; b.y = b.leaves.reduce((s, l) => s + l.y, 0) / b.leaves.length;
      });
      root = { x: 52, y: brs.reduce((s, b) => s + b.y, 0) / brs.length };
      vb = [400, 60 + (k - 1) * 98 + 80];
    }
    tree.setAttribute("viewBox", `0 0 ${vb[0]} ${vb[1]}`);
    let e = "", n = "";
    brs.forEach((b, bi) => {
      const col = `var(${BR[b.k][1]})`, t0 = bi * .12;
      e += `<path class="vlt-edge vlt-edge--root" pathLength="1" data-b="${b.k}" style="--d:${.45 + t0}s" d="${curve(root, b, h)}"/>`;
      const bw = BR[b.k][0].length * 8 + 30;
      n += `<g transform="translate(${b.x} ${b.y})" style="--col:${col}"><g class="vlt-pop" style="--d:${.95 + t0}s"><rect class="vlt-bbox" x="${-bw / 2}" y="-17" width="${bw}" height="34" rx="9"/><text class="vlt-blbl">${BR[b.k][0]}</text></g></g>`;
      b.leaves.forEach((l, i) => {
        e += `<path class="vlt-edge" pathLength="1" data-b="${b.k}" data-l="${l.id}" style="--col:${col};--d:${1.35 + t0 + i * .1}s" d="${curve(b, { x: l.x, y: l.y - (h ? 0 : 30) }, h)}"/>`;
        n += `<g class="vlt-leaf" data-id="${l.id}" data-b="${b.k}" transform="translate(${l.x} ${l.y})" style="--col:${col}" role="button" tabindex="0" aria-pressed="false" aria-label="${l.name}"><g class="vlt-pop" style="--d:${1.8 + t0 + i * .1}s"><circle class="vlt-c" r="30"/>${glyph(l.id)}<text class="vlt-lbl2" y="54">${l.short}</text></g></g>`;
      });
    });
    const rw = h ? 92 : 132;
    tree.innerHTML = e + `<g transform="translate(${root.x} ${root.y})"><g class="vlt-pop" style="--d:0s"><rect class="vlt-rootbox" x="${-rw / 2}" y="-21" width="${rw}" height="42" rx="21"/>${h ? "" : '<circle class="vlt-rootdot" cx="-42" cy="0" r="4.5"/>'}<text class="vlt-rootlbl" x="${h ? 0 : 8}" style="font-size:${h ? 14 : 17}px">Visual Lab</text></g></g>` + n;
    tree.classList.toggle("vlt-built", !animate);
    return animate ? 3000 : 0;
  }

  /* ---------- Selection travel ---------- */
  const rel = el => {
    const a = stage.getBoundingClientRect(), b = el.getBoundingClientRect();
    return { x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height, cx: b.left - a.left + b.width / 2, cy: b.top - a.top + b.height / 2 };
  };
  function geo(leaf) {
    const o = rel($(".vlt-c", leaf)), s = rel(socket), gw = o.w * 1.12;
    return { o, s, gw, sc: 104 / gw, dx: s.cx - o.cx, dy: s.cy - o.cy };
  }
  const setTrail = g => trailp.setAttribute("d", curve({ x: g.o.cx, y: g.o.cy }, { x: g.s.cx, y: g.s.cy }, false));
  const mark = () => tree.querySelectorAll(".vlt-edge").forEach(p =>
    p.classList.toggle("vlt-on", !!cur && (p.dataset.l === cur.a.id || (!p.dataset.l && p.dataset.b === cur.a.br))));

  async function dismiss() {
    const c = cur; if (!c) return;
    cur = null; mark();
    detail.classList.remove("vlt-show", "vlt-title"); socket.classList.remove("vlt-on");
    tree.classList.remove("vlt-has-sel");
    const t = getComputedStyle(c.ghost).transform;
    c.ghost.getAnimations().forEach(a => a.cancel());
    trailp.getAnimations().forEach(a => a.cancel());
    trailp.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 1 }], { duration: D * .5, fill: "forwards" });
    const an = c.ghost.animate([{ transform: t === "none" ? "none" : t }, { transform: "none" }], { duration: D * .6, easing: "cubic-bezier(.5,0,.3,1)" });
    try { await an.finished; } catch (e) { /* cancelled */ }
    c.ghost.remove(); c.leaf.classList.remove("vlt-away", "vlt-sel"); c.leaf.setAttribute("aria-pressed", "false");
  }

  function fill(a) {
    const col = `var(${BR[a.br][1]})`;
    detail.style.setProperty("--col", col); socket.style.setProperty("--col", col);
    detail.innerHTML = `<h2>${a.name}</h2>
      <div class="vlt-r" style="--i:0"><span class="vlt-cat">${BR[a.br][0]}</span><p class="vlt-desc">${a.desc}</p></div>
      <ul class="vlt-facts vlt-r" style="--i:1">${a.facts.map(f => `<li>${f}</li>`).join("")}</ul>
      <div class="vlt-acts vlt-r" style="--i:2"><a class="vlt-btn vlt-btn--primary" href="${a.url}">Open visualizer</a><button type="button" class="vlt-btn vlt-btn--ghost" data-back>Back to the tree</button></div>`;
  }

  async function select(id) {
    if (!built || (cur && cur.a.id === id)) return;
    const my = ++seq, a = items.find(i => i.id === id), leaf = $(`.vlt-leaf[data-id="${id}"]`, tree);
    await Promise.race([dismiss(), wait(260)]);
    if (my !== seq) return;
    const g = geo(leaf), col = `var(${BR[a.br][1]})`;
    const ghost = document.createElementNS(NS, "svg");
    ghost.setAttribute("class", "vlt-ghost"); ghost.setAttribute("viewBox", "-33 -33 66 66");
    ghost.setAttribute("width", g.gw); ghost.setAttribute("height", g.gw);
    ghost.style.cssText = `--col:${col};left:${g.o.cx - g.gw / 2}px;top:${g.o.cy - g.gw / 2}px`;
    ghost.innerHTML = `<circle r="30"/>${glyph(id)}`;
    stage.appendChild(ghost);
    leaf.classList.add("vlt-away", "vlt-sel"); leaf.setAttribute("aria-pressed", "true");
    tree.classList.add("vlt-has-sel"); cur = { a, leaf, ghost, g }; mark();
    fill(a);
    trailp.style.setProperty("--col", col); setTrail(g);
    const mid = scrollY + stage.getBoundingClientRect().top + (g.o.cy + g.s.cy) / 2 - innerHeight / 2;
    scrollTo({ top: Math.max(0, mid), behavior: reduce ? "auto" : "smooth" });
    trailp.getAnimations().forEach(x => x.cancel());
    trailp.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: D, easing: "ease-in-out", fill: "forwards" });
    const fin = `translate(${g.dx}px,${g.dy}px) scale(${g.sc})`;
    const an = ghost.animate([
      { transform: "none" },
      { transform: `translate(${g.dx * .18}px,${g.dy * .45}px) scale(${1 + (g.sc - 1) * .35})`, offset: .45 },
      { transform: fin }
    ], { duration: D, easing: "cubic-bezier(.6,0,.25,1)", fill: "forwards" });
    try { await an.finished; } catch (e) { return; }
    if (my !== seq || !cur || cur.ghost !== ghost) return;
    ghost.style.transform = fin; an.cancel();
    socket.classList.add("vlt-on");
    detail.classList.add("vlt-title"); await wait(600);
    if (my === seq) detail.classList.add("vlt-show");
  }

  function reset() {
    seq++;
    dismiss().then(() => scrollTo({ top: Math.max(0, scrollY + stage.getBoundingClientRect().top - 10), behavior: reduce ? "auto" : "smooth" }));
  }

  function place() {
    if (!cur) return;
    const g = geo(cur.leaf); cur.g = g;
    Object.assign(cur.ghost.style, { left: g.o.cx - g.gw / 2 + "px", top: g.o.cy - g.gw / 2 + "px", transform: `translate(${g.dx}px,${g.dy}px) scale(${g.sc})` });
    cur.ghost.setAttribute("width", g.gw); cur.ghost.setAttribute("height", g.gw);
    setTrail(g);
  }

  tree.addEventListener("click", e => { const l = e.target.closest(".vlt-leaf"); if (l) select(l.dataset.id); });
  tree.addEventListener("keydown", e => {
    const l = e.target.closest(".vlt-leaf");
    if (l && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(l.dataset.id); }
  });
  detail.addEventListener("click", e => { if (e.target.closest("[data-back]")) reset(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && cur) reset(); });

  let raf;
  addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const h = innerWidth < 700;
      if (built && h !== horizontal) {            // layout changed: rebuild without replaying the intro
        seq++; if (cur) { cur.ghost.remove(); cur = null; }
        socket.classList.remove("vlt-on"); detail.classList.remove("vlt-show", "vlt-title"); detail.innerHTML = "";
        buildTree(false); tree.classList.add("vlt-built"); return;
      }
      place();
    });
  });

  // Intro: the tree grows, then the title and hint appear
  (async () => {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const total = buildTree(true);
    await wait(total);
    built = true; tree.classList.add("vlt-built");
    stage.classList.add("vlt-built-sock"); head.classList.add("vlt-in");
  })();

  /* ---------- Decision demo ---------- */
  const box = $("[data-box]"), g = $("[data-g]");
  const GN = [["A", 60, 160], ["B", 180, 60], ["C", 180, 260], ["D", 330, 70], ["E", 330, 250], ["F", 460, 160], ["G", 550, 160]];
  const GE = [["A", "B", 4], ["A", "C", 2], ["B", "C", 1], ["B", "D", 5], ["C", "E", 8], ["D", "F", 3], ["E", "F", 2], ["D", "E", 6], ["F", "G", 1]];
  const adj = {};
  GE.forEach(([a, b, w]) => { (adj[a] = adj[a] || []).push([b, w]); (adj[b] = adj[b] || []).push([a, w]); });
  Object.values(adj).forEach(l => l.sort((x, y) => (x[0] < y[0] ? -1 : 1)));
  const uniq = a => [...new Set(a)];

  function bfs() {
    const S = [{ cur: null, done: [], wait: ["A"], l: ["A"], r: [], look: [], t: "Start by putting A in the queue." }], seen = new Set(["A"]), q = ["A"], vis = [];
    while (q.length) {
      const c = q.shift(); vis.push(c); const nw = [];
      adj[c].forEach(([n]) => { if (!seen.has(n)) { seen.add(n); q.push(n); nw.push(n); } });
      S.push({ cur: c, done: [...vis], wait: [...q], l: [...q], r: [...vis], look: nw.map(n => [c, n]),
        t: `Take ${c} from the front of the queue and mark it visited. ` + (nw.length ? `Add ${nw.join(" and ")} to the back of the queue.` : "Every neighbour is already seen, so nothing is added.") });
    }
    S.push({ cur: null, done: [...vis], wait: [], l: [], r: [...vis], look: [], t: "The queue is empty. Every reachable node was visited, level by level." });
    return S;
  }
  function dfs() {
    const S = [{ cur: null, done: [], wait: ["A"], l: ["A"], r: [], look: [], t: "Start by pushing A onto the stack." }], st = ["A"], vis = [];
    while (st.length) {
      const c = st.pop(); if (vis.includes(c)) continue; vis.push(c);
      const nw = adj[c].map(x => x[0]).filter(n => !vis.includes(n));
      [...nw].reverse().forEach(n => st.push(n));
      const w = uniq(st.filter(n => !vis.includes(n)));
      S.push({ cur: c, done: [...vis], wait: w, l: w, r: [...vis], look: nw.map(n => [c, n]),
        t: `Pop ${c} from the top of the stack and visit it. ` + (nw.length ? `Push ${nw.join(" and ")}. ${nw[0]} comes off next, so the search goes deeper first.` : "Dead end, so backtrack to the previous branch.") });
    }
    S.push({ cur: null, done: [...vis], wait: [], l: [], r: [...vis], look: [], t: "The stack is empty. Every reachable node was visited, one branch at a time." });
    return S;
  }
  function dij() {
    const dist = { A: 0 }, pq = [[0, "A"]], set = [];
    const sub = () => { const o = {}; Object.keys(dist).forEach(n => { o[n] = String(dist[n]); }); return o; };
    const S = [{ cur: null, done: [], wait: ["A"], l: ["A:0"], r: [], look: [], sub: sub(), t: "Start at A with distance 0." }];
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, c] = pq.shift(); if (set.includes(c)) continue; set.push(c);
      const look = [], txt = [];
      adj[c].forEach(([n, w]) => {
        if (set.includes(n)) return;
        if (!(n in dist) || d + w < dist[n]) { dist[n] = d + w; pq.push([d + w, n]); look.push([c, n]); txt.push(`${n} = ${d + w}`); }
      });
      const live = pq.filter(p => !set.includes(p[1]) && p[0] === dist[p[1]]);
      S.push({ cur: c, done: [...set], wait: uniq(live.map(p => p[1])), l: live.map(p => p[1] + ":" + p[0]), r: set.map(n => n + ":" + dist[n]), look, sub: sub(),
        t: `Settle ${c} at distance ${d}, the smallest waiting. ` + (txt.length ? `Shorter routes found: ${txt.join(", ")}.` : "No shorter routes found.") });
    }
    S.push({ cur: null, done: [...set], wait: [], l: [], r: set.map(n => n + ":" + dist[n]), look: [], sub: sub(), t: "Every node is settled. Each number is the cheapest total cost from A." });
    return S;
  }
  const MN = [[0, 300, 40], [1, 150, 120], [2, 450, 120], [3, 75, 200], [4, 225, 200], [5, 375, 200], [6, 525, 200]];
  for (let i = 7; i < 15; i++) MN.push([i, 37.5 + 75 * (i - 7), 280]);
  const ME = []; for (let i = 0; i < 7; i++) ME.push([i, 2 * i + 1], [i, 2 * i + 2]);
  function mm() {
    const V = [3, 5, 6, 9, 1, 2, 0, -1], val = {}, lab = {}, done = [];
    V.forEach((v, i) => { val[7 + i] = v; lab[7 + i] = String(v); });
    const S = [{ cur: null, done: [], wait: [], l: [], r: [], look: [], lab: { ...lab }, t: "The leaf scores are known. Work upward: MAX takes the highest child, MIN takes the lowest." }];
    [3, 4, 5, 6, 1, 2, 0].forEach(i => {
      const a = val[2 * i + 1], b = val[2 * i + 2], mx = Math.floor(Math.log2(i + 1)) % 2 === 0, v = mx ? Math.max(a, b) : Math.min(a, b);
      val[i] = v; done.push(i); lab[i] = String(v);
      S.push({ cur: i, done: [...done], wait: [], l: [a, b].map(String), r: done.map(n => String(val[n])), look: [[i, 2 * i + 1], [i, 2 * i + 2]], lab: { ...lab },
        t: `${mx ? "MAX" : "MIN"} compares ${a} and ${b} and picks ${v}.` + (i === 0 ? " This is the best score MAX can guarantee against a perfect opponent." : "") });
    });
    return S;
  }
  const DEMO = {
    bfs: { nodes: GN, edges: GE, steps: bfs, l1: "Queue (front on the left)", l2: "Visited, in order" },
    dfs: { nodes: GN, edges: GE, steps: dfs, l1: "Stack (top on the right)", l2: "Visited, in order" },
    dijkstra: { nodes: GN, edges: GE, steps: dij, weighted: true, l1: "Waiting (node:distance)", l2: "Settled (node:distance)" },
    minimax: { nodes: MN, edges: ME, steps: mm, tree: true, l1: "Scores being compared", l2: "Scores decided" }
  };

  const PSEUDO = {
    bfs: ["queue ← [start]; mark start seen", "while queue is not empty:", "  node ← dequeue from the front", "  visit node", "  for each unseen neighbour: mark it, enqueue it"],
    dfs: ["stack ← [start]", "while stack is not empty:", "  node ← pop from the top", "  if node is not visited: visit it", "    push its unvisited neighbours"],
    dijkstra: ["dist[start] ← 0; queue ← [start]", "while queue is not empty:", "  node ← entry with the smallest distance", "  settle node", "  for each neighbour, try dist[node] + weight", "    if smaller: update dist[neighbour]"],
    minimax: ["if node is a leaf: return its score", "if MAX to move: return the highest child score", "if MIN to move: return the lowest child score"]
  };
  const CONCEPT = {
    bfs: ["Breadth-First Search", "Explore outward in rings: everything one step away, then two steps, and so on.", "A queue, first in and first out.", "The fewest steps when every move costs the same."],
    dfs: ["Depth-First Search", "Follow one branch to its end, then backtrack and try the next one.", "A stack, last in and first out.", "Checking what connects, or exploring every possibility."],
    dijkstra: ["Dijkstra’s Algorithm", "Always settle the closest unsettled node. Its distance is then final.", "A priority queue ordered by distance.", "The cheapest route when edge costs differ and none are negative."],
    minimax: ["Minimax", "Assume both players play perfectly: MAX takes the highest score, MIN takes the lowest.", "A game tree scored at its leaves.", "Choosing the best move in a two-player game."]
  };
  const pcOf = (k, s, i, n) => {
    if (i === 0) return [0];
    if (k === "minimax") return [Math.floor(Math.log2(s.cur + 1)) % 2 === 0 ? 1 : 2];
    if (i === n - 1) return [1];
    return k === "dijkstra" ? (s.look.length ? [2, 3, 4, 5] : [2, 3, 4]) : [2, 3, 4];
  };
  const code = $("[data-code]"), concept = $("[data-concept]");
  function buildInfo(k) {
    code.innerHTML = PSEUDO[k].map((l, i) => `<span class="vlt-ln" style="--n:${i}">${l}</span>`).join("");
    const c = CONCEPT[k];
    concept.innerHTML = `<h3>${c[0]}</h3><dl><div><dt>The idea</dt><dd>${c[1]}</dd></div><div><dt>Data structure</dt><dd>${c[2]}</dd></div><div><dt>Use it when</dt><dd>${c[3]}</dd></div></dl>`;
  }

  const L1 = $("[data-l1]"), L2 = $("[data-l2]"), narr = $("[data-narr]"), stepno = $("[data-stepno]"), playBtn = $("[data-play]");
  let key = "bfs", steps = [], idx = 0, timer = null, playing = false, dstage = 0, touched = false, resume = false;
  const pos = {};

  function mount(k) {
    key = k; const d = DEMO[k]; steps = d.steps(); idx = 0;
    d.nodes.forEach(([id, x, y]) => { pos[id] = [x, y]; });
    let h = "";
    d.edges.forEach(([a, b, w]) => {
      const [x1, y1] = pos[a], [x2, y2] = pos[b];
      h += `<line class="vlt-e" data-k="${a}|${b}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      if (d.weighted) h += `<text class="vlt-w" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 4}">${w}</text>`;
    });
    d.nodes.forEach(([id, x, y]) => {
      const leaf = d.tree && id >= 7, r = d.tree ? (leaf ? 15 : 21) : 22;
      const l = d.tree ? (leaf ? id - 0 : (Math.floor(Math.log2(id + 1)) % 2 === 0 ? "MAX" : "MIN")) : id;
      h += `<g class="vlt-n${d.tree ? " is-sm" : ""}" data-id="${id}" transform="translate(${x} ${y})"><circle r="${r}"/><text class="vlt-l">${l}</text><text class="vlt-s" y="${r + 16}"></text></g>`;
    });
    g.innerHTML = h; g.classList.toggle("is-weighted", !!d.weighted);
    g.setAttribute("viewBox", d.tree ? "0 0 600 320" : "0 0 600 320");
    if (d.tree) d.nodes.forEach(([id]) => { if (id >= 7) $(`.vlt-n[data-id="${id}"] .vlt-l`, g).textContent = ""; });
    $("[data-lab1]").textContent = d.l1; $("[data-lab2]").textContent = d.l2;
    $("[data-open]").href = box.dataset["url" + k[0].toUpperCase() + k.slice(1)];
    box.querySelectorAll("[data-pick]").forEach(b => { const on = b.dataset.pick === k; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", on); });
    buildInfo(k);
    box.querySelectorAll(".vlt-gcard").forEach(c => c.classList.toggle("is-match", c.dataset.for === k));
    render();
  }
  const fillSlots = (ul, arr) => { ul.innerHTML = arr.length ? arr.map(v => `<li>${v}</li>`).join("") : '<li class="is-empty">empty</li>'; };
  function render() {
    const s = steps[idx], done = new Set(s.done.map(String)), wt = new Set(s.wait.map(String)), look = new Set();
    s.look.forEach(([a, b]) => { look.add(a + "|" + b); look.add(b + "|" + a); });
    g.querySelectorAll(".vlt-e").forEach(e => e.classList.toggle("is-look", look.has(e.dataset.k)));
    g.querySelectorAll(".vlt-n").forEach(n => {
      const id = n.dataset.id;
      n.classList.toggle("is-cur", s.cur !== null && String(s.cur) === id);
      n.classList.toggle("is-done", done.has(id)); n.classList.toggle("is-wait", wt.has(id));
      if (s.lab && s.lab[id] !== undefined) $(".vlt-l", n).textContent = s.lab[id];
      if (DEMO[key].weighted) $(".vlt-s", n).textContent = s.sub && s.sub[id] !== undefined ? s.sub[id] : "";
    });
    fillSlots(L1, s.l); fillSlots(L2, s.r);
    const pc = dstage === 3 ? pcOf(key, s, idx, steps.length) : [];
    code.querySelectorAll(".vlt-ln").forEach((l, i) => l.classList.toggle("is-hl", pc.includes(i)));
    narr.textContent = s.t; stepno.textContent = `Step ${idx + 1} of ${steps.length}`;
  }
  function tick() {
    if (idx < steps.length - 1) { idx++; render(); }
    else { clearInterval(timer); timer = setTimeout(() => { idx = 0; render(); if (playing) play(); }, 2600); }
  }
  function play() { clearInterval(timer); clearTimeout(timer); timer = setInterval(tick, 1700); playing = true; playBtn.textContent = "Pause"; }
  function pause() { clearInterval(timer); clearTimeout(timer); playing = false; playBtn.textContent = "Play"; }
  const manual = fn => () => { pause(); fn(); };

  const learn = $("[data-learn]"), flow = $("[data-flow]");
  function setStage(n) {
    dstage = n; box.dataset.stage = n;
    box.querySelectorAll("[data-in]").forEach(e => { e.hidden = !e.dataset.in.split(" ").includes(String(n)); });
    flow.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("is-active", i === n); li.classList.toggle("is-past", i < n);
      li.firstElementChild.setAttribute("aria-pressed", i === n);
    });
    learn.style.setProperty("--p", n / 4);
    pause();
    if (n === 2) idx = 0;
    render();
    if (n === 3 && !reduce) play();
  }
  flow.addEventListener("click", e => { const b = e.target.closest("[data-stage]"); if (b) { touched = true; setStage(+b.dataset.stage); } });
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-pick]"); if (!b) return;
    touched = true; const was = playing; mount(b.dataset.pick); if (was) play();
  });
  $("[data-next]").addEventListener("click", manual(() => { if (idx < steps.length - 1) { idx++; render(); } }));
  $("[data-prev]").addEventListener("click", manual(() => { if (idx > 0) { idx--; render(); } }));
  $("[data-restart]").addEventListener("click", manual(() => { idx = 0; render(); }));
  playBtn.addEventListener("click", () => (playing ? pause() : play()));

  mount("bfs"); setStage(0);
  learn.classList.add("vlt-pre");
  // Arrival animation: the line fills step by step, then the run starts
  new IntersectionObserver((es, ob) => {
    if (!es[0].isIntersecting) return;
    ob.disconnect(); learn.classList.remove("vlt-pre");
    (async () => { for (let s = 0; s < 5 && !touched; s++) { setStage(s); if (s < 4) await wait(s === 3 ? 4500 : 1500); } })();
  }, { threshold: .3 }).observe(learn);
  // Pause the run while it is off screen
  new IntersectionObserver(es => {
    if (es[0].isIntersecting) { if (resume && dstage === 3) play(); resume = false; }
    else if (playing) { resume = true; pause(); }
  }, { threshold: .1 }).observe(box);
})();