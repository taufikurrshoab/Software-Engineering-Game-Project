/* ==========================================================================
   Winding snake timeline behaviour (academic-snake.js).
   Shared by the Academic home page and the dashboard. Vanilla JS, no network
   requests, no dependency on other Academic scripts.

   The server renders everything (see academic/_snake.html): the SVG paths,
   the HTML node links and where each node sits along the line (data-at-w for
   the wide layout, data-at-t for the tall phone layout, as a 0-1 fraction of
   the line's length). This file only plays the opening sequence:

     1. the main line draws itself while a light travels along its tip
        (week ticks and the "today" marker appear as the light passes them)
     2. the branches grow out of the line one after another
     3. each branch's node pops in, then its title
     4. the page's own content opens: everything marked data-after-snake inside
        the nearest [data-snk-gate] fades in, in order (hero on the home page;
        heading, statistics and cards on the dashboard)
     - on the dashboard (.snk--journey) the bright part stops at "today"
     - on the home page a light drifts along the line now and then, only while
       the timeline is on screen
     - prefers-reduced-motion, or no IntersectionObserver: the finished
       timeline is shown straight away

   Without JavaScript the finished timeline is simply shown (CSS only hides it
   once .js is set, and un-hides it by itself after 2.5s as a failsafe).
   ========================================================================== */
(function () {
    "use strict";

    var roots = document.querySelectorAll("[data-snk]");
    if (!roots.length) { return; }

    var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var hasObserver = "IntersectionObserver" in window;

    function all(selector, context) {
        return Array.prototype.slice.call((context || document).querySelectorAll(selector));
    }
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function init(root) {
        var canvas = root.querySelector(".snk__canvas");
        var svgWide = root.querySelector(".snk__svg--wide");
        var svgTall = root.querySelector(".snk__svg--tall");
        var head = root.querySelector(".snk__head");
        var items = all(".snk__items > .snk-item", root);
        var journey = root.classList.contains("snk--journey");
        var nowItem = root.querySelector(".snk-now");

        /* ---------- the page content that waits for the timeline ---------- */

        var gate = root.closest("[data-snk-gate]");
        if (gate) {
            all("[data-after-snake]", gate).forEach(function (el, index) {
                el.style.setProperty("--after-i", Math.min(index, 8));
            });
        }
        function openGate() {
            if (!gate || gate.classList.contains("is-open")) { return; }
            gate.classList.add("is-open");
            gate.dispatchEvent(new Event("snk:open"));
        }

        if (!canvas || !svgWide || !svgTall) {
            root.classList.add("is-done");
            openGate();
            return;
        }

        var stemsByIndex = {};
        all(".snk-stem", root).forEach(function (stem) {
            var key = stem.getAttribute("data-snk-stem");
            (stemsByIndex[key] = stemsByIndex[key] || []).push(stem);
        });

        var finished = false;
        var frameId = 0;
        var idleId = 0;
        var timers = [];
        var visible = false;

        /* ---------- geometry of whichever layout is showing ---------- */

        function isTall() { return window.getComputedStyle(svgTall).display !== "none"; }

        function measure() {
            var tall = isTall();
            var svg = tall ? svgTall : svgWide;
            var key = tall ? "data-at-t" : "data-at-w";
            var base = svg.querySelector(".snk-base");
            var box = svg.viewBox.baseVal;
            var events = items.map(function (el) {
                return { el: el, at: parseFloat(el.getAttribute(key)) || 0 };
            }).sort(function (a, b) { return a.at - b.at; });

            return {
                tall: tall,
                glow: svg.querySelector(".snk-glow"),
                base: base,
                progress: svg.querySelector(".snk-progress"),
                length: base.getTotalLength(),
                width: box.width || 1,
                height: box.height || 1,
                events: events,
                end: progressEnd(key)
            };
        }

        /* where the bright line stops: the end of the line, or "today" on the dashboard */
        function progressEnd(key) {
            if (journey && nowItem) {
                var at = parseFloat(nowItem.getAttribute(key));
                if (!isNaN(at)) { return Math.min(Math.max(at, 0), 1); }
            }
            return 1;
        }

        function placeHead(m, fraction) {
            if (!head || !m.length) { return; }
            var point = m.base.getPointAtLength(Math.min(Math.max(fraction, 0), 1) * m.length);
            head.style.left = (point.x / m.width * 100).toFixed(2) + "%";
            head.style.top = (point.y / m.height * 100).toFixed(2) + "%";
        }

        function light(el) {
            el.classList.add("is-lit");
            var stems = stemsByIndex[el.getAttribute("data-snk-i")];
            if (stems) { stems.forEach(function (stem) { stem.classList.add("is-lit"); }); }
        }

        /* ---------- the end state (also used for reduced motion) ---------- */

        function settle() {
            items.forEach(light);
            [svgWide, svgTall].forEach(function (svg) {
                var key = svg === svgTall ? "data-at-t" : "data-at-w";
                var glow = svg.querySelector(".snk-glow");
                var base = svg.querySelector(".snk-base");
                var progress = svg.querySelector(".snk-progress");
                if (glow) { glow.style.strokeDashoffset = ""; }
                if (base) { base.style.strokeDashoffset = ""; }
                if (progress) { progress.style.strokeDashoffset = String(1 - progressEnd(key)); }
            });
            if (head) { head.classList.remove("is-on"); }
            root.classList.remove("is-armed");
            root.classList.add("is-done");
        }

        function complete() {
            if (finished) { return; }
            finished = true;
            cancelAnimationFrame(frameId);
            timers.forEach(clearTimeout);
            timers = [];
            settle();
            openGate();
            if (visible) { startIdle(); }
        }

        /* ---------- opening sequence ---------- */

        var LINE_MS = 1700;       // 1. the main line
        var BRANCH_DELAY = 180;   // pause between the line and the first branch
        var AFTER_LAST = 900;     // 3. let the last node and title finish before the page content opens

        function play() {
            if (finished) { return; }
            var m;
            try { m = measure(); } catch (error) { complete(); return; }

            // ticks and the "today" marker belong to the line; nodes (with branches) come after it
            var marks = m.events.filter(function (e) { return !e.el.hasAttribute("data-snk-i"); });
            var nodes = m.events.filter(function (e) { return e.el.hasAttribute("data-snk-i"); });
            var step = Math.max(80, Math.min(160, 1300 / Math.max(nodes.length, 1)));
            var nextMark = 0;
            var startedAt = null;
            if (head) { head.classList.add("is-on"); }

            function growBranches() {
                nodes.forEach(function (node, k) {
                    timers.push(setTimeout(function () { light(node.el); }, BRANCH_DELAY + k * step));
                });
                var lastAt = BRANCH_DELAY + Math.max(nodes.length - 1, 0) * step;
                timers.push(setTimeout(openGate, lastAt + AFTER_LAST));
                timers.push(setTimeout(complete, lastAt + AFTER_LAST + 700));
            }

            function frame(now) {
                if (finished) { return; }
                if (startedAt === null) { startedAt = now; }
                if (isTall() !== m.tall) { complete(); return; }       // the layout changed mid-way

                var raw = Math.min((now - startedAt) / LINE_MS, 1);
                var p = ease(raw);

                m.glow.style.strokeDashoffset = String(1 - p);
                m.base.style.strokeDashoffset = String(1 - p);
                m.progress.style.strokeDashoffset = String(1 - Math.min(p, m.end));
                placeHead(m, p);

                while (nextMark < marks.length && marks[nextMark].at <= p + 0.0005) {
                    light(marks[nextMark].el);
                    nextMark += 1;
                }

                if (raw < 1) {
                    frameId = requestAnimationFrame(frame);
                } else {
                    while (nextMark < marks.length) { light(marks[nextMark].el); nextMark += 1; }
                    if (head) { head.classList.remove("is-on"); }
                    growBranches();
                }
            }
            frameId = requestAnimationFrame(frame);
        }

        /* ---------- a light drifting along the line (home page) ---------- */

        function startIdle() {
            if (idleId || journey || reduceMotion || !head || !finished) { return; }
            var CYCLE = 11000;
            var PASS = 5200;
            var origin = null;
            var cycleIndex = -1;
            var m = null;

            function tick(now) {
                if (!visible || document.hidden) { idleId = 0; head.classList.remove("is-on"); return; }
                if (origin === null) { origin = now; }
                var elapsed = now - origin;
                var index = Math.floor(elapsed / CYCLE);
                if (index !== cycleIndex) {                           // measure again each cycle
                    cycleIndex = index;
                    try { m = measure(); } catch (error) { idleId = 0; return; }
                }
                var t = elapsed % CYCLE;
                if (t < PASS) {
                    placeHead(m, ease(t / PASS));
                    head.classList.add("is-on");
                } else {
                    head.classList.remove("is-on");
                }
                idleId = requestAnimationFrame(tick);
            }
            idleId = requestAnimationFrame(tick);
        }

        function stopIdle() {
            if (idleId) { cancelAnimationFrame(idleId); idleId = 0; }
            if (head) { head.classList.remove("is-on"); }
        }

        /* ---------- start ---------- */

        // keyboard users must never land on a node that is still invisible
        root.addEventListener("focusin", function () { if (!finished) { complete(); } });

        if (reduceMotion) {
            finished = true;
            settle();
            openGate();
            return;
        }

        root.classList.add("is-armed");

        if (!hasObserver) {
            play();
            return;
        }

        var started = false;
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                visible = entry.isIntersecting;
                if (visible && !started) {
                    started = true;
                    play();
                } else if (visible) {
                    startIdle();
                } else {
                    stopIdle();
                }
            });
        }, { threshold: 0.12 });
        observer.observe(root);

        document.addEventListener("visibilitychange", function () {
            if (!document.hidden && visible && finished) { startIdle(); }
        });
    }

    all("[data-snk]").forEach(function (root) {
        try {
            init(root);
        } catch (error) {
            // never leave a half-armed timeline (or a page waiting for it) behind
            root.classList.remove("is-armed");
            root.classList.add("is-done");
            var waiting = root.closest("[data-snk-gate]");
            if (waiting) { waiting.classList.add("is-open"); waiting.dispatchEvent(new Event("snk:open")); }
        }
    });
}());
