/* ==========================================================================
   Assignment pages behaviour (assignment.js). Vanilla JS, no network requests.
   Needs academic.js to load first (it provides window.AcademicUI and the
   shared dialogs, confirm dialog, filters, search and reveal animations).

   What this adds:
     - live status for every assignment: Overdue, Due today, Tomorrow, In N days
       (measured against the server's "today", so it matches the dashboard)
     - filter chips show their counts; empty chips disappear
     - overview: completed count, animated progress bar, next deadline
     - tick animation on the completion toggle before the form is submitted
     - add / edit form hint: days until due, semester bounds, past dates
   ========================================================================== */
(function () {
    "use strict";

    var ui = window.AcademicUI;
    if (!ui) { return; }

    var DAY_MS = 86400000;
    var SOON_DAYS = 7;       // "Due this week"
    var URGENT_DAYS = 2;     // amber badge, same rule as the dashboard
    var TOGGLE_DELAY = 340;  // lets the tick animation play before the page reloads

    /* ---------- helpers ---------- */

    function parseISO(value) {
        var p = (value || "").split("-");
        if (p.length !== 3) { return null; }
        var date = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        return isNaN(date.getTime()) ? null : date;
    }
    function daysBetween(a, b) { return Math.round((b - a) / DAY_MS); }
    function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
    function fullDate(date) {
        return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    }
    function shortDate(date) {
        return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    }
    function relative(days) {
        if (days < 0) { return days === -1 ? "1 day overdue" : plural(-days, "day") + " overdue"; }
        if (days === 0) { return "Due today"; }
        if (days === 1) { return "Due tomorrow"; }
        return "In " + plural(days, "day");
    }

    /* ==================================================================
       List page
       ================================================================== */

    var page = document.querySelector("[data-assignments]");

    function describe(item, today) {
        var due = parseISO(item.getAttribute("data-due"));
        var done = item.getAttribute("data-done") === "1";
        var title = (item.querySelector(".as-item__title") || {}).textContent || "";
        var info = { item: item, due: due, done: done, title: title.trim() };

        if (!due) { info.state = done ? "completed" : "pending"; return info; }

        info.days = daysBetween(today, due);
        if (done) { info.state = "completed"; info.label = "Done"; info.tone = "done"; }
        else if (info.days < 0) { info.state = "overdue"; info.label = relative(info.days); info.tone = "overdue"; }
        else {
            info.state = info.days <= SOON_DAYS ? "soon" : "later";
            info.label = relative(info.days);
            info.tone = info.days <= URGENT_DAYS ? "soon" : "info";
        }
        return info;
    }

    function applyStatus(info) {
        var item = info.item;
        var badge = item.querySelector("[data-as-status]");

        if (badge && info.label) {
            badge.textContent = info.label;
            badge.className = "ac-badge as-status ac-badge--" + info.tone;
        }
        item.classList.toggle("is-overdue", info.state === "overdue");

        var status = info.state === "completed" ? "completed"
            : info.state === "overdue" ? "pending overdue"
            : info.state === "soon" ? "pending soon" : "pending";
        item.setAttribute("data-ac-status", status);
    }

    function initCounts(infos) {
        var counts = { all: infos.length, pending: 0, overdue: 0, soon: 0, completed: 0 };
        infos.forEach(function (info) {
            if (info.state === "completed") { counts.completed += 1; return; }
            counts.pending += 1;
            if (info.state === "overdue") { counts.overdue += 1; }
            if (info.state === "soon") { counts.soon += 1; }
        });

        ui.all("[data-as-count]", page).forEach(function (el) {
            el.textContent = counts[el.getAttribute("data-as-count")];
        });
        // Only offer "Overdue" and "Due this week" when there is something to show
        ui.all("[data-as-chip]", page).forEach(function (chip) {
            chip.hidden = counts[chip.getAttribute("data-as-chip")] === 0;
        });
        return counts;
    }

    function initOverview(infos, counts) {
        var box = page.querySelector("[data-as-overview]");
        if (!box) { return; }

        var total = infos.length;
        var percent = total ? Math.round(counts.completed / total * 100) : 0;
        var doneEl = box.querySelector("[data-as-done]");
        var pctEl = box.querySelector("[data-as-pct]");
        var bar = box.querySelector("[data-as-bar]");
        var next = box.querySelector("[data-as-next]");

        if (doneEl) { doneEl.textContent = counts.completed; }
        if (pctEl) { pctEl.textContent = percent + "%"; }
        if (bar) {
            // academic.js may already be holding the bar at 0 until it scrolls into view
            if (bar.hasAttribute("data-final")) { bar.setAttribute("data-final", String(percent)); }
            else { bar.style.setProperty("--value", String(percent)); }
        }

        if (!next) { return; }
        var upcoming = infos.filter(function (i) { return i.state === "soon" || i.state === "later"; })[0];
        var parts = [];
        if (counts.overdue) { parts.push('<span class="is-danger">' + plural(counts.overdue, "assignment") + ' overdue</span>'); }
        if (upcoming) {
            parts.push("Next: <strong></strong> &middot; " + relative(upcoming.days).toLowerCase());
        }
        if (!parts.length) {
            next.textContent = counts.pending ? plural(counts.pending, "assignment") + " pending" : "All caught up. Nice work.";
            return;
        }
        next.innerHTML = parts.join(" &middot; ");
        var strong = next.querySelector("strong");
        if (strong) { strong.textContent = upcoming.title; }
    }

    /* ---------- completion toggle ---------- */

    function initToggles() {
        ui.all("[data-as-toggle]", page).forEach(function (form) {
            form.addEventListener("submit", function (event) {
                if (form.dataset.asGo === "1") { return; }     // second pass: let it through
                event.preventDefault();
                if (form.dataset.asBusy === "1") { return; }
                form.dataset.asBusy = "1";

                var item = form.closest("[data-as-item]");
                var button = form.querySelector(".as-check");
                var willBeDone = item.getAttribute("data-state") !== "done";

                item.setAttribute("data-state", willBeDone ? "done" : "open");
                if (button) { button.setAttribute("aria-pressed", willBeDone ? "true" : "false"); }
                if (!ui.reduceMotion) {
                    item.classList.remove("is-popping");
                    void item.offsetWidth;                       // restart the animation
                    item.classList.add("is-popping");
                }

                var badge = item.querySelector("[data-as-status]");
                if (badge && willBeDone) {
                    badge.textContent = "Done";
                    badge.className = "ac-badge as-status ac-badge--done is-pop";
                }

                setTimeout(function () {
                    form.dataset.asGo = "1";
                    if (typeof form.requestSubmit === "function") { form.requestSubmit(); }
                    else { form.submit(); }
                }, ui.reduceMotion ? 0 : TOGGLE_DELAY);
            });
        });

        // Back/forward cache: never come back to a half-submitted row
        window.addEventListener("pageshow", function (event) {
            if (!event.persisted) { return; }
            ui.all("[data-as-toggle]", page).forEach(function (form) {
                delete form.dataset.asGo;
                delete form.dataset.asBusy;
                var item = form.closest("[data-as-item]");
                item.setAttribute("data-state", item.getAttribute("data-done") === "1" ? "done" : "open");
            });
        });
    }

    function initList() {
        var today = parseISO(page.getAttribute("data-today"));
        if (!today) {
            var now = new Date();
            today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }

        var infos = ui.all("[data-as-item]", page).map(function (item) { return describe(item, today); });
        infos.forEach(applyStatus);
        var counts = initCounts(infos);
        initOverview(infos, counts);
        initToggles();
    }

    /* ==================================================================
       Add / edit form hint
       ================================================================== */

    function initForm(form) {
        var due = form.elements.due_date;
        var done = form.elements.is_completed;
        var hint = form.querySelector("[data-as-hint]");
        if (!due || !hint) { return; }

        var semStart = parseISO(form.getAttribute("data-sem-start"));
        var semEnd = parseISO(form.getAttribute("data-sem-end"));
        var today = parseISO(form.getAttribute("data-today"));
        var DEFAULT = "Pick the day it is due.";
        var last = null;

        function say(html, warn) {
            if (last === html + warn) { return; }
            last = html + warn;
            hint.innerHTML = html;
            hint.classList.toggle("is-warn", !!warn);
            hint.classList.remove("is-pop");
            if (!ui.reduceMotion) { void hint.offsetWidth; hint.classList.add("is-pop"); }
        }
        function text(value) {
            var span = document.createElement("span");
            span.textContent = value;
            return span.innerHTML;
        }

        function update() {
            var date = parseISO(due.value);
            if (!date) { say(DEFAULT, false); return; }

            if (semStart && semEnd && (date < semStart || date > semEnd)) {
                say("Outside the semester (" + text(shortDate(semStart)) + " &ndash; " + text(shortDate(semEnd)) + "). Choose a date inside it.", true);
                return;
            }
            if (!today) { say("<strong>" + text(fullDate(date)) + "</strong>", false); return; }

            var days = daysBetween(today, date);
            if (days < 0 && !(done && done.checked)) {
                say("That date has passed, so it will show as overdue until you complete it.", true);
            } else if (days < 0) {
                say("<strong>" + text(fullDate(date)) + "</strong> &middot; " + text(relative(days).toLowerCase()), false);
            } else {
                say("<strong>" + text(relative(days)) + "</strong> &middot; " + text(fullDate(date)), false);
            }
        }

        due.addEventListener("input", update);
        due.addEventListener("change", update);
        if (done) { done.addEventListener("change", update); }
        update();
    }

    /* ---------- Init ---------- */

    if (page) { initList(); }
    ui.all("[data-as-form]").forEach(initForm);
}());
