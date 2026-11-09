/* ==========================================================================
   Attendance page behaviour (attendance.js). Vanilla JS, no network requests.
   Needs academic.js to load first (it provides window.AcademicUI, the
   count-up numbers, animated progress bars and reveal animations).

   What this adds:
     - the overall ring fills from empty when the page opens
     - a plain-language hint per course and overall, worked out from the
       real counts: how many classes you can still miss and stay at 75%,
       or how many in a row you need to get back to it
     - Present / Absent / Late / Excused control: the choice highlights with
       a small pop before the form is submitted (the server saves it)
     - history filter chips with counts, and "Show more" paging with a
       light staggered entrance
   ========================================================================== */
(function () {
    "use strict";

    var ui = window.AcademicUI;
    if (!ui) { return; }

    var page = document.querySelector("[data-attendance]");
    if (!page) { return; }

    var TARGET = parseInt(page.getAttribute("data-target"), 10) || 75;
    var PAGE_SIZE = 12;
    var SAVE_DELAY = 220;   // lets the highlight play before the page reloads

    /* ---------- ring ---------- */

    function initRings() {
        ui.all("[data-at-ring]", page).forEach(function (ring) {
            var final = parseFloat(ring.getAttribute("data-at-ring"));
            if (isNaN(final) || ui.reduceMotion) { ring.classList.add("is-ready"); return; }

            var duration = 1000;
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
            setTimeout(function () { requestAnimationFrame(frame); }, 150);
        });
    }

    /* ---------- hints ---------- */

    function hintFor(attended, counted) {
        if (!counted) { return null; }
        var pct = attended / counted * 100;
        if (pct >= TARGET) {
            // attended >= TARGET% of (counted + m)  ->  m = floor((4A - 3C) / 3) at 75%
            var spare = Math.floor((100 * attended - TARGET * counted) / TARGET);
            if (spare <= 0) { return "Right at " + TARGET + "%. Try not to miss the next class."; }
            return "You can miss " + (spare === 1 ? "1 more class" : spare + " more classes") + " and stay at " + TARGET + "%.";
        }
        // (A + k) / (C + k) >= TARGET%  ->  k = ceil((T*C - 100*A) / (100 - T))
        var need = Math.ceil((TARGET * counted - 100 * attended) / (100 - TARGET));
        return "Attend the next " + (need === 1 ? "class" : need + " classes in a row") + " to get back to " + TARGET + "%.";
    }

    function initHints() {
        ui.all("[data-at-metric]", page).forEach(function (box) {
            var hint = box.querySelector("[data-at-hint]");
            if (!hint) { return; }
            var text = hintFor(
                parseInt(box.getAttribute("data-attended"), 10) || 0,
                parseInt(box.getAttribute("data-counted"), 10) || 0
            );
            if (!text) { return; }
            hint.textContent = text;
            if (!ui.reduceMotion) { hint.classList.add("is-pop"); }
        });
    }

    /* ---------- marking ---------- */

    function initMarking() {
        ui.all("[data-at-mark]", page).forEach(function (form) {
            form.addEventListener("submit", function (event) {
                if (form.dataset.atGo === "1") { return; }          // second pass: let it through
                event.preventDefault();

                var pick = event.submitter;
                if (!pick || form.dataset.atBusy === "1") { return; }
                if (pick.getAttribute("aria-pressed") === "true") { return; }   // already saved
                form.dataset.atBusy = "1";

                ui.all(".at-seg__btn", form).forEach(function (button) {
                    button.setAttribute("aria-pressed", button === pick ? "true" : "false");
                    button.classList.remove("is-pop");
                });
                void pick.offsetWidth;
                if (!ui.reduceMotion) { pick.classList.add("is-pop"); }
                form.classList.add("is-saving");

                setTimeout(function () {
                    form.dataset.atGo = "1";
                    if (typeof form.requestSubmit === "function") { form.requestSubmit(pick); }
                    else { form.submit(); }
                }, ui.reduceMotion ? 0 : SAVE_DELAY);
            });
        });

        // Back/forward cache: never come back to a half-saved row
        window.addEventListener("pageshow", function (event) {
            if (!event.persisted) { return; }
            ui.all("[data-at-mark]", page).forEach(function (form) {
                delete form.dataset.atGo;
                delete form.dataset.atBusy;
                form.classList.remove("is-saving");
            });
        });
    }

    /* ---------- history: filter + paging ---------- */

    function initHistory() {
        var section = page.querySelector("[data-at-history]");
        if (!section) { return; }

        var items = ui.all("[data-at-item]", section);
        if (!items.length) { return; }

        var chips = ui.all("[data-at-filter]", section);
        var more = section.querySelector("[data-at-more]");
        var moreWrap = section.querySelector("[data-at-more-wrap]");
        var empty = section.querySelector("[data-at-empty]");
        var current = "all";
        var limit = PAGE_SIZE;

        function statusOf(item) { return item.getAttribute("data-at-status"); }

        // Counts per status; chips with nothing to show disappear
        var counts = { all: items.length };
        items.forEach(function (item) {
            var key = statusOf(item);
            counts[key] = (counts[key] || 0) + 1;
        });
        ui.all("[data-at-count]", section).forEach(function (el) {
            el.textContent = counts[el.getAttribute("data-at-count")] || "";
        });
        var visibleChips = 0;
        chips.forEach(function (chip) {
            if (chip.hasAttribute("data-at-chip") && !counts[chip.getAttribute("data-at-filter")]) { chip.hidden = true; }
            else if (chip.hasAttribute("data-at-chip")) { visibleChips += 1; }
        });
        var group = section.querySelector("[data-at-chips]");
        if (group && visibleChips < 2) { group.hidden = true; }

        function render(animateFrom) {
            var matched = items.filter(function (item) {
                return current === "all" || statusOf(item) === current;
            });

            items.forEach(function (item) { item.hidden = true; });
            matched.forEach(function (item, index) {
                var show = index < limit;
                item.hidden = !show;
                if (show && index >= animateFrom && !ui.reduceMotion) {
                    item.style.setProperty("--n", Math.min(index - animateFrom, 8));
                    item.classList.remove("is-entering");
                    void item.offsetWidth;
                    item.classList.add("is-entering");
                }
            });

            var remaining = matched.length - limit;
            if (moreWrap) { moreWrap.hidden = remaining <= 0; }
            if (more && remaining > 0) {
                more.textContent = "Show " + Math.min(remaining, PAGE_SIZE) + " more (" + remaining + " left)";
            }
            if (empty) { empty.hidden = matched.length !== 0; }
        }

        chips.forEach(function (chip) {
            chip.addEventListener("click", function () {
                current = chip.getAttribute("data-at-filter");
                limit = PAGE_SIZE;
                chips.forEach(function (other) {
                    other.setAttribute("aria-pressed", other === chip ? "true" : "false");
                });
                render(0);
            });
        });

        if (more) {
            more.addEventListener("click", function () {
                var from = limit;
                limit += PAGE_SIZE;
                render(from);
            });
        }

        // Arriving at a #session-ID link (after marking): make sure that row is visible
        var target = window.location.hash && document.getElementById(window.location.hash.slice(1));
        if (target && target.hasAttribute("data-at-item")) {
            var position = items.indexOf(target);
            if (position >= limit) { limit = position + 1; }
        }
        render(items.length + 1);   // initial pass: no entrance animation (data-reveal handles it)

        if (target && target.hasAttribute("data-at-item")) {
            // Scroll after paging has revealed it
            requestAnimationFrame(function () { target.scrollIntoView({ block: "center" }); });
        }
    }

    /* ---------- Init ---------- */

    initRings();
    initHints();
    initMarking();
    initHistory();
}());
