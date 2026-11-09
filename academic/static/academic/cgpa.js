/* ==========================================================================
   CGPA & grade pages behaviour (cgpa.js). Vanilla JS, no network requests.
   Needs academic.js to load first (window.AcademicUI, count-up numbers,
   animated progress bars, dialogs and confirm dialogs).

   GPA, CGPA, trends and advice are all calculated by the server (services.py
   and insights.py) and only displayed here. This file never calculates a
   GPA or CGPA: the chart just draws the numbers printed in the semester list.

   What this adds:
     - tabs: Semester GPA / Course grades (remembered; #semesters, #grades)
     - the overview ring fills from empty when the page opens
     - GPA chart drawn from the semester list: Trend (line) and Compare (bars),
       animated, with a tooltip on hover or keyboard focus
     - form hints (semester GPA dialog and page, grade dialog and page):
       range warnings read from each input's own min/max
   ========================================================================== */
(function () {
    "use strict";

    var ui = window.AcademicUI;
    if (!ui) { return; }

    var SVG_NS = "http://www.w3.org/2000/svg";
    var TAB_KEY = "academic-cgpa-tab";

    function svg(tag, attrs, parent) {
        var el = document.createElementNS(SVG_NS, tag);
        Object.keys(attrs || {}).forEach(function (name) { el.setAttribute(name, attrs[name]); });
        if (parent) { parent.appendChild(el); }
        return el;
    }

    /* ---------- tabs ---------- */

    function initTabs() {
        var tabs = ui.all("[data-cg-tab]");
        var panels = ui.all("[data-cg-panel]");
        if (!tabs.length || panels.length < 2) { return; }

        function valid(name) {
            return panels.some(function (panel) { return panel.getAttribute("data-cg-panel") === name; });
        }
        function remembered() {
            try { return window.sessionStorage.getItem(TAB_KEY); } catch (error) { return null; }
        }
        function remember(name) {
            try { window.sessionStorage.setItem(TAB_KEY, name); } catch (error) { /* private mode */ }
        }

        function show(name, animate) {
            tabs.forEach(function (tab) {
                tab.setAttribute("aria-selected", tab.getAttribute("data-cg-tab") === name ? "true" : "false");
            });
            panels.forEach(function (panel) {
                var match = panel.getAttribute("data-cg-panel") === name;
                panel.hidden = !match;
                panel.classList.remove("is-entering");
                if (match && animate && !ui.reduceMotion) {
                    void panel.offsetWidth;
                    panel.classList.add("is-entering");
                }
            });
            remember(name);
            document.dispatchEvent(new CustomEvent("cgpa:tabchange", { detail: name }));
        }

        tabs.forEach(function (tab) {
            tab.addEventListener("click", function (event) {
                event.preventDefault();
                var name = tab.getAttribute("data-cg-tab");
                show(name, true);
                if (window.history && window.history.replaceState) {
                    window.history.replaceState(null, "", "#" + name);
                }
            });
        });

        var fromHash = window.location.hash.slice(1);
        var saved = remembered();
        var start = valid(fromHash) ? fromHash : (valid(saved) ? saved : "semesters");
        show(start, false);
    }

    /* ---------- overview ring ---------- */

    function initRing() {
        ui.all("[data-cg-ring]").forEach(function (ring) {
            var final = parseFloat(ring.getAttribute("data-cg-ring"));
            if (isNaN(final) || ui.reduceMotion) { ring.classList.add("is-ready"); return; }

            var duration = 1100;
            var started = null;
            function frame(now) {
                if (started === null) { started = now; }
                var t = Math.min((now - started) / duration, 1);
                var eased = 1 - Math.pow(1 - t, 3);
                // "important" beats the CSS rule that holds the ring at 0 until we start
                ring.style.setProperty("--value", (final * eased).toFixed(1), "important");
                if (t < 1) { requestAnimationFrame(frame); }
                else { ring.style.setProperty("--value", String(final)); ring.classList.add("is-ready"); }
            }
            setTimeout(function () { requestAnimationFrame(frame); }, 200);
        });
    }

    /* ---------- GPA chart (drawn from the semester list) ---------- */

    function readRecords() {
        return ui.all("[data-cg-record]").map(function (item) {
            return {
                name: item.getAttribute("data-name"),
                term: parseInt(item.getAttribute("data-term"), 10),
                gpa: parseFloat(item.getAttribute("data-gpa")),
                dir: item.getAttribute("data-dir") || ""
            };
        }).filter(function (record) { return !isNaN(record.gpa); });
    }

    function initChart() {
        var card = document.querySelector("[data-cg-chartcard]");
        var host = card && card.querySelector("[data-cg-chart]");
        var tip = card && card.querySelector("[data-cg-tip]");
        var panel = card && card.closest("[data-cg-panel]");
        var records = readRecords();
        if (!host || records.length < 2) { return; }

        var scaleMax = parseFloat(host.getAttribute("data-cg-max")) || 4;   // GPA scale (also a model limit)
        var modes = ui.all("[data-cg-mode]", card);
        var mode = "line";

        var W = 640, H = 270, PAD = { top: 22, right: 20, bottom: 36, left: 40 };
        var innerW = W - PAD.left - PAD.right;
        var innerH = H - PAD.top - PAD.bottom;

        // y axis zoomed to the data in half-point steps, never beyond the GPA scale
        var values = records.map(function (r) { return r.gpa; });
        var lo = Math.max(0, Math.floor((Math.min.apply(null, values) - 0.25) * 2) / 2);
        var hi = Math.min(scaleMax, Math.ceil((Math.max.apply(null, values) + 0.1) * 2) / 2);
        if (hi - lo < 1) { lo = Math.max(0, hi - 1); }
        var barLo = 0;   // bars start at zero so their heights are honest

        function x(i) { return PAD.left + innerW * i / (records.length - 1); }
        function xBar(i) { return PAD.left + innerW * (i + 0.5) / records.length; }
        function y(v, base) { return PAD.top + innerH * (1 - (v - base) / (hi - base)); }

        function showTip(record, index, px, py) {
            if (!tip) { return; }
            tip.textContent = "";
            var title = document.createElement("strong");
            title.textContent = record.name;
            var line = document.createElement("span");
            line.textContent = "GPA " + record.gpa.toFixed(2);
            tip.appendChild(title);
            tip.appendChild(line);
            if (index > 0) {
                var delta = record.gpa - records[index - 1].gpa;
                var change = document.createElement("div");
                change.className = delta > 0.0049 ? "is-up" : (delta < -0.0049 ? "is-down" : "");
                change.textContent = (delta > 0 ? "+" : "") + delta.toFixed(2) + " vs previous";
                tip.appendChild(change);
            }
            var box = card.getBoundingClientRect();
            var hostBox = host.getBoundingClientRect();
            var scale = hostBox.width / W;
            tip.style.left = (hostBox.left - box.left + px * scale) + "px";
            tip.style.top = (hostBox.top - box.top + py * scale) + "px";
            tip.hidden = false;
        }
        function hideTip() { if (tip) { tip.hidden = true; } }

        function bind(target, mark, record, index, px, py) {
            function on() { showTip(record, index, px, py); mark.classList.add("is-hover"); }
            function off() { hideTip(); mark.classList.remove("is-hover"); }
            target.addEventListener("mouseenter", on);
            target.addEventListener("mouseleave", off);
            target.addEventListener("focus", on);
            target.addEventListener("blur", off);
        }

        function drawLine(root) {
            var points = records.map(function (r, i) { return [x(i), y(r.gpa, lo)]; });
            var d = points.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
            var bottom = PAD.top + innerH;
            var last = points[points.length - 1];

            svg("path", {
                d: d + " L" + last[0].toFixed(1) + " " + bottom + " L" + points[0][0].toFixed(1) + " " + bottom + " Z",
                "class": "cg-area", fill: "url(#cg-area)"
            }, root);
            svg("path", { d: d, pathLength: "1", "class": "cg-line", stroke: "url(#cg-stroke)" }, root);

            records.forEach(function (record, i) {
                var cx = points[i][0].toFixed(1);
                var cy = points[i][1].toFixed(1);
                var cls = "cg-dot" + (record.dir === "up" ? " cg-dot--up" : record.dir === "down" ? " cg-dot--down" : "");
                var dot = svg("circle", {
                    cx: cx, cy: cy, r: "5.5", "class": cls, style: "--i:" + i, tabindex: "0",
                    "aria-label": record.name + ", GPA " + record.gpa.toFixed(2)
                }, root);
                var hit = svg("circle", { cx: cx, cy: cy, r: "16", "class": "cg-point-hit" }, root);
                bind(hit, dot, record, i, points[i][0], points[i][1]);
                bind(dot, dot, record, i, points[i][0], points[i][1]);
            });
        }

        function drawBars(root) {
            var slot = innerW / records.length;
            var width = Math.min(46, slot * 0.58);
            records.forEach(function (record, i) {
                var cx = xBar(i);
                var top = y(record.gpa, barLo);
                var cls = "cg-bar" + (record.dir === "up" ? " cg-bar--up" : record.dir === "down" ? " cg-bar--down" : "");
                var bar = svg("rect", {
                    x: (cx - width / 2).toFixed(1), y: top.toFixed(1), width: width.toFixed(1),
                    height: (PAD.top + innerH - top).toFixed(1), rx: "6", "class": cls, style: "--i:" + i, tabindex: "0",
                    "aria-label": record.name + ", GPA " + record.gpa.toFixed(2)
                }, root);
                var value = svg("text", { x: cx, y: top - 8, "class": "cg-value" }, root);
                value.textContent = record.gpa.toFixed(2);
                bind(bar, bar, record, i, cx, top);
            });
        }

        function draw() {
            hideTip();
            host.classList.remove("is-drawn");
            host.textContent = "";

            var root = svg("svg", {
                viewBox: "0 0 " + W + " " + H, role: "img",
                "aria-label": "GPA for each semester, from " + records[0].name + " to " + records[records.length - 1].name
            });
            host.appendChild(root);

            var defs = svg("defs", {}, root);
            var stroke = svg("linearGradient", {
                id: "cg-stroke", gradientUnits: "userSpaceOnUse", x1: PAD.left, y1: 0, x2: W - PAD.right, y2: 0
            }, defs);
            svg("stop", { offset: "0", "class": "cg-stop-a" }, stroke);
            svg("stop", { offset: "1", "class": "cg-stop-b" }, stroke);
            var area = svg("linearGradient", { id: "cg-area", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
            svg("stop", { offset: "0", "class": "cg-area-top" }, area);
            svg("stop", { offset: "1", "class": "cg-area-bottom" }, area);
            [["cg-bar-fill", "#60a5fa"], ["cg-bar-up", "#34d399"], ["cg-bar-down", "#f87171"]].forEach(function (pair) {
                var gradient = svg("linearGradient", { id: pair[0], x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
                svg("stop", { offset: "0", "stop-color": pair[1], "stop-opacity": ".95" }, gradient);
                svg("stop", { offset: "1", "stop-color": pair[1], "stop-opacity": ".35" }, gradient);
            });

            var base = mode === "bars" ? barLo : lo;
            var step = mode === "bars" ? 1 : 0.5;
            for (var tick = base; tick <= hi + 0.0001; tick += step) {
                var ty = y(tick, base);
                svg("line", { x1: PAD.left, x2: W - PAD.right, y1: ty, y2: ty, "class": "cg-gridline" }, root);
                var label = svg("text", { x: PAD.left - 10, y: ty + 4, "text-anchor": "end", "class": "cg-tick" }, root);
                label.textContent = tick.toFixed(step < 1 ? 1 : 0);
            }
            records.forEach(function (record, i) {
                var px = mode === "bars" ? xBar(i) : x(i);
                var name = svg("text", { x: px, y: H - 12, "text-anchor": "middle", "class": "cg-tick" }, root);
                name.textContent = "S" + record.term;
            });

            if (mode === "line") { drawLine(root); } else { drawBars(root); }

            // two frames, so the browser paints the empty state before the entrance starts
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { host.classList.add("is-drawn"); });
            });
        }

        modes.forEach(function (button) {
            button.addEventListener("click", function () {
                var next = button.getAttribute("data-cg-mode");
                if (next === mode) { return; }
                mode = next;
                modes.forEach(function (other) { other.setAttribute("aria-pressed", other === button ? "true" : "false"); });
                draw();
            });
        });

        // A hidden tab has no size, so draw once the Semester tab is showing
        function drawIfVisible() {
            if (panel && !panel.hidden && !host.querySelector("svg")) { draw(); }
        }
        document.addEventListener("cgpa:tabchange", drawIfVisible);
        drawIfVisible();
    }

    /* ---------- form hints ---------- */

    function attachHint(form, build) {
        var hint = form.querySelector("[data-cg-hint]");
        if (!hint) { return; }
        var fallback = hint.textContent;
        var last = null;

        function say(text, warn) {
            if (last === text + warn) { return; }
            last = text + warn;
            hint.textContent = text;
            hint.classList.toggle("is-warn", !!warn);
            hint.classList.remove("is-pop");
            if (!ui.reduceMotion) { void hint.offsetWidth; hint.classList.add("is-pop"); }
        }
        function update() {
            var result = build();
            if (result) { say(result.text, result.warn); } else { say(fallback, false); }
        }

        form.addEventListener("input", update);
        // dialogs are filled by academic.js without input events: refresh when one opens
        var dialog = form.closest("dialog");
        if (dialog && "MutationObserver" in window) {
            new MutationObserver(function () { if (dialog.open) { last = null; update(); } })
                .observe(dialog, { attributes: true, attributeFilter: ["open"] });
        }
        update();
    }

    function outOfRange(input) {
        var raw = input.value.trim();
        var value = parseFloat(raw);
        if (raw === "" || isNaN(value)) { return null; }
        var min = input.min !== "" ? parseFloat(input.min) : null;
        var max = input.max !== "" ? parseFloat(input.max) : null;
        if ((min !== null && value < min) || (max !== null && value > max)) {
            return { min: min, max: max };
        }
        return null;
    }

    function initGradeForm(form) {
        var letter = form.elements.grade;
        var point = form.elements.grade_point;
        if (!letter || !point) { return; }

        attachHint(form, function () {
            var bad = outOfRange(point);
            if (bad) { return { text: "Grade point must be between " + bad.min + " and " + bad.max + ".", warn: true }; }
            var name = letter.value.trim();
            var value = parseFloat(point.value);
            if (name && !isNaN(value)) { return { text: "Saving " + name + " (" + value.toFixed(2) + ") for this course.", warn: false }; }
            return null;
        });
    }

    function initGpaForm(form) {
        var name = form.elements.name;
        var gpa = form.elements.gpa;
        var credits = form.elements.credits;
        if (!name || !gpa) { return; }

        attachHint(form, function () {
            var bad = outOfRange(gpa);
            if (bad) { return { text: "GPA must be between " + bad.min + " and " + bad.max + ".", warn: true }; }
            if (credits && credits.value.trim() !== "" && parseFloat(credits.value) <= 0) {
                return { text: "Credits must be greater than zero.", warn: true };
            }
            var label = name.value.trim();
            var value = parseFloat(gpa.value);
            if (label && !isNaN(value)) {
                var withCredits = credits && credits.value.trim() !== "";
                return {
                    text: "Saving " + label + " with GPA " + value.toFixed(2) +
                        (withCredits ? " and " + credits.value.trim() + " credits." : ". Add credits to include it in a credit-weighted CGPA."),
                    warn: false
                };
            }
            return null;
        });
    }

    /* ---------- Init ---------- */

    initTabs();
    initRing();
    initChart();
    ui.all("[data-cg-form]").forEach(initGradeForm);
    ui.all("[data-cg-gpa-form]").forEach(initGpaForm);
}());
