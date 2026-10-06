/* Visual Lab home: BFS demo, filtering, search, stats, reveal. */
(function () {
    "use strict";

    var root = document.documentElement;
    var page = document.querySelector(".visual-lab-page");
    if (!page) { return; }

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- BFS demo (hero + featured card) ---------- */

    var GRAPH = { A: ["B", "C"], B: ["D", "E"], C: ["F"], D: [], E: [], F: [] };
    var STEP_MS = 1100;
    var END_PAUSE_MS = 2200;

    // Pre-compute every frame of a BFS run so the demo is just playback.
    function buildFrames(start) {
        var frames = [];
        var visited = [];
        var queue = [start];
        var edges = [];
        var seen = {};
        seen[start] = true;

        frames.push({ current: null, visited: [], queue: queue.slice(), edges: [] });

        while (queue.length) {
            var current = queue.shift();
            visited.push(current);
            (GRAPH[current] || []).forEach(function (next) {
                if (!seen[next]) {
                    seen[next] = true;
                    queue.push(next);
                    edges.push(current + "-" + next);
                }
            });
            frames.push({
                current: current,
                visited: visited.slice(),
                queue: queue.slice(),
                edges: edges.slice()
            });
        }
        return frames;
    }

    function initDemo(el) {
        var frames = buildFrames(el.getAttribute("data-start") || "A");
        var scope = el.closest(".visual-lab-featured") || el;
        var nodes = Array.prototype.slice.call(el.querySelectorAll("[data-node]"));
        var edges = Array.prototype.slice.call(el.querySelectorAll("[data-edge]"));
        var queueOut = scope.querySelector("[data-demo-queue]");
        var visitedOut = scope.querySelector("[data-demo-visited]");
        var stepOut = scope.querySelector("[data-demo-step]");

        var index = 0;
        var timer = null;
        var onScreen = false;

        function render(i) {
            var f = frames[i];
            nodes.forEach(function (n) {
                var id = n.getAttribute("data-node");
                var isCurrent = id === f.current;
                n.classList.toggle("is-current", isCurrent);
                n.classList.toggle("is-visited", !isCurrent && f.visited.indexOf(id) !== -1);
                n.classList.toggle("is-queued", f.queue.indexOf(id) !== -1);
            });
            edges.forEach(function (e) {
                e.classList.toggle("is-active", f.edges.indexOf(e.getAttribute("data-edge")) !== -1);
            });
            if (queueOut) {
                queueOut.textContent = f.queue.length ? "[ " + f.queue.join(", ") + " ]" : "[ ]";
            }
            if (visitedOut) {
                visitedOut.textContent = f.visited.length ? f.visited.join(" ") : "none";
            }
            if (stepOut) {
                stepOut.textContent = "Step " + (i + 1) + " of " + frames.length;
            }
            el.style.setProperty("--progress", Math.round(((i + 1) / frames.length) * 100) + "%");
        }

        function tick() {
            var last = index === frames.length - 1;
            index = last ? 0 : index + 1;
            render(index);
            schedule();
        }

        function schedule() {
            clearTimeout(timer);
            timer = setTimeout(tick, index === frames.length - 1 ? END_PAUSE_MS : STEP_MS);
        }

        function start() {
            if (!timer && onScreen && !document.hidden) { schedule(); }
        }
        function stop() {
            clearTimeout(timer);
            timer = null;
        }

        // Reduced motion: show a finished run, no playback.
        if (reduceMotion) {
            render(frames.length - 1);
            return;
        }

        render(0);

        if ("IntersectionObserver" in window) {
            new IntersectionObserver(function (entries) {
                onScreen = entries[0].isIntersecting;
                onScreen ? start() : stop();
            }, { threshold: 0.2 }).observe(el);
        } else {
            onScreen = true;
            start();
        }

        document.addEventListener("visibilitychange", function () {
            document.hidden ? stop() : start();
        });
    }

    Array.prototype.forEach.call(page.querySelectorAll("[data-bfs-demo]"), initDemo);

    /* ---------- Library: stats, filter, search ---------- */

    var grid = page.querySelector("[data-grid]");
    var cards = Array.prototype.slice.call(page.querySelectorAll("[data-card]"));
    var moreTile = page.querySelector("[data-more]");
    var emptyState = page.querySelector("[data-empty]");
    var countOut = page.querySelector("[data-result-count]");
    var searchInput = page.querySelector("[data-search-input]");
    var filterButtons = Array.prototype.slice.call(page.querySelectorAll("[data-filter]"));
    var resetButton = page.querySelector("[data-reset]");

    function pad(n) { return n < 10 ? "0" + n : String(n); }

    // Stats are counted from the cards, so adding a card updates them.
    function updateStats() {
        var total = cards.length;
        var available = cards.filter(function (c) {
            return c.getAttribute("data-status") === "available";
        }).length;
        var values = { total: total, available: available, soon: total - available };
        Object.keys(values).forEach(function (key) {
            var out = page.querySelector('[data-stat="' + key + '"]');
            if (out) { out.textContent = pad(values[key]); }
        });
    }

    if (grid && cards.length) {
        var state = { filter: "all", query: "" };

        function matches(card) {
            var categories = (card.getAttribute("data-category") || "").split(/\s+/);
            var inCategory = state.filter === "all" || categories.indexOf(state.filter) !== -1;
            if (!inCategory) { return false; }
            if (!state.query) { return true; }

            var haystack = ((card.getAttribute("data-search") || "") + " " +
                (card.textContent || "")).toLowerCase();
            return state.query.split(/\s+/).every(function (term) {
                return haystack.indexOf(term) !== -1;
            });
        }

        function apply() {
            var shown = 0;

            cards.forEach(function (card) {
                var show = matches(card);
                var wasHidden = card.classList.contains("is-hidden");

                if (show) {
                    shown += 1;
                    card.classList.remove("is-hidden");
                    if (wasHidden && !reduceMotion) {
                        card.style.animationDelay = Math.min(shown * 40, 240) + "ms";
                        card.classList.add("is-entering");
                    }
                } else {
                    card.classList.add("is-hidden");
                    card.classList.remove("is-entering");
                }
            });

            var filtering = state.filter !== "all" || state.query !== "";
            if (moreTile) { moreTile.classList.toggle("is-hidden", filtering); }
            if (countOut) { countOut.textContent = shown; }
            if (emptyState) { emptyState.hidden = shown !== 0; }
        }

        // Clear the entry animation so it can run again next time.
        grid.addEventListener("animationend", function (e) {
            if (e.target.classList && e.target.classList.contains("is-entering")) {
                e.target.classList.remove("is-entering");
                e.target.style.animationDelay = "";
            }
        });

        function setFilter(value) {
            state.filter = value;
            filterButtons.forEach(function (btn) {
                var active = btn.getAttribute("data-filter") === value;
                btn.classList.toggle("is-active", active);
                btn.setAttribute("aria-pressed", active ? "true" : "false");
            });
            apply();
        }

        filterButtons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                setFilter(btn.getAttribute("data-filter"));
            });
        });

        if (searchInput) {
            searchInput.addEventListener("input", function () {
                state.query = searchInput.value.trim().toLowerCase();
                apply();
            });
            searchInput.addEventListener("keydown", function (e) {
                if (e.key === "Escape" && searchInput.value) {
                    searchInput.value = "";
                    state.query = "";
                    apply();
                }
            });
        }

        if (resetButton) {
            resetButton.addEventListener("click", function () {
                if (searchInput) { searchInput.value = ""; }
                state.query = "";
                setFilter("all");
                if (searchInput) { searchInput.focus(); }
            });
        }

        updateStats();
        apply();
    }

    /* ---------- Scroll reveal ---------- */

    var items = Array.prototype.slice.call(page.querySelectorAll("[data-reveal]"));

    if (items.length && !reduceMotion && "IntersectionObserver" in window) {
        // Mark what is already on screen first so the top of the page doesn't flash.
        var vh = window.innerHeight || document.documentElement.clientHeight;
        items.forEach(function (el) {
            if (el.getBoundingClientRect().top < vh) { el.classList.add("is-visible"); }
        });

        root.classList.add("has-js");

        var revealObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

        items.forEach(function (el) {
            if (!el.classList.contains("is-visible")) { revealObserver.observe(el); }
        });
    }
})();