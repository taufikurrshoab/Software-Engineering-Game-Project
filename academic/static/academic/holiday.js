/* ==========================================================================
   Holiday page behaviour (holiday.js). Vanilla JS, no network requests.
   Needs academic.js to load first (it provides window.AcademicUI and the
   shared dialogs, confirm dialog, filters and reveal animations).

   What this adds:
     - day count and a live status ("In 12 days", "Ongoing", "Ended")
     - the next holiday is highlighted
     - a semester strip showing where holidays fall, with today's position;
       strip and list highlight each other
     - add / edit form hint: duration, semester bounds and overlap warning
     - brief highlight of a holiday right after it was added or edited
   ========================================================================== */
(function () {
    "use strict";

    var ui = window.AcademicUI;
    if (!ui) { return; }

    var page = document.querySelector("[data-holidays]");
    var FLASH_KEY = "academic-holiday-flash";
    var DAY_MS = 86400000;
    var DEFAULT_HINT = "Leave the end date empty for a single day.";

    /* ---------- helpers ---------- */

    function parseISO(value) {
        var p = (value || "").split("-");
        if (p.length !== 3) { return null; }
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }
    function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
    function daysBetween(a, b) { return Math.round((b - a) / DAY_MS); }
    function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
    function short(date) {
        return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    }
    function store(action, value) {
        try {
            if (action === "set") { window.sessionStorage.setItem(FLASH_KEY, value); return null; }
            var stored = window.sessionStorage.getItem(FLASH_KEY);
            window.sessionStorage.removeItem(FLASH_KEY);
            return stored;
        } catch (error) { return null; }
    }

    /* ---------- list: durations, status labels, next holiday ---------- */

    function describe(item, today) {
        var start = parseISO(item.getAttribute("data-start"));
        var end = parseISO(item.getAttribute("data-end"));
        var total = daysBetween(start, end) + 1;
        var info = { item: item, start: start, end: end, total: total, title: item.getAttribute("data-title") };

        if (today < start) {
            var until = daysBetween(today, start);
            info.state = "upcoming";
            info.until = until;
            info.label = until === 1 ? "Tomorrow" : "In " + plural(until, "day");
        } else if (today <= end) {
            var left = daysBetween(today, end);
            info.state = "current";
            info.left = left;
            info.label = left === 0 ? (total === 1 ? "Today" : "Last day") : "Ongoing";
        } else {
            info.state = "past";
            info.label = "Ended";
        }
        return info;
    }

    function applyStatus(info) {
        var item = info.item;
        var badge = item.querySelector("[data-hl-status]");
        var length = item.querySelector("[data-hl-duration]");

        if (length) { length.textContent = plural(info.total, "day"); length.hidden = false; }
        if (badge) {
            badge.textContent = info.label;
            badge.classList.remove("ac-badge--holiday", "ac-badge--accent", "ac-badge--info");
            badge.classList.add(info.state === "past" ? "ac-badge--info" : info.state === "current" ? "ac-badge--accent" : "ac-badge--holiday");
        }
        item.classList.toggle("is-past", info.state === "past");
        // Keep the filter tabs in step with the visitor's own date
        item.setAttribute("data-ac-status",
            info.state === "past" ? "past" : info.state === "current" ? "upcoming current" : "upcoming");
    }

    function initList() {
        var today = startOfDay(new Date());
        var infos = ui.all("[data-hl-item]", page).map(function (item) { return describe(item, today); });

        infos.forEach(applyStatus);

        var next = infos.filter(function (info) { return info.state !== "past"; })[0] || null;
        if (next) { next.item.classList.add("is-next"); }

        initStrip(infos, next, today);
        initFlash(infos);
    }

    /* ---------- strip ---------- */

    function initStrip(infos, next, today) {
        var strip = page.querySelector("[data-hl-strip]");
        var track = page.querySelector("[data-hl-track]");
        if (!strip || !track) { return; }

        var semStart = parseISO(strip.getAttribute("data-start"));
        var semEnd = parseISO(strip.getAttribute("data-end"));
        var span = daysBetween(semStart, semEnd) + 1;
        if (!semStart || !semEnd || span < 1) { return; }

        function pct(days) { return Math.max(0, Math.min(100, days / span * 100)); }

        var elapsed = Math.max(0, Math.min(span, daysBetween(semStart, today) + 1));
        track.style.setProperty("--p", pct(elapsed).toFixed(2));

        var allChip = page.querySelector('[data-ac-filter="all"]');
        var segments = infos.map(function (info, index) {
            var button = document.createElement("button");
            var label = info.title + ", " + short(info.start) + (info.total > 1 ? " to " + short(info.end) : "");
            button.type = "button";
            button.className = "hl-seg" + (info.state === "past" ? " is-past" : "");
            button.title = label;
            button.setAttribute("aria-label", label + ". Show in list");
            button.style.setProperty("--l", pct(daysBetween(semStart, info.start)).toFixed(2));
            button.style.setProperty("--w", pct(info.total).toFixed(2));
            button.style.setProperty("--n", String(Math.min(index, 8)));
            track.appendChild(button);

            function link(on) {
                button.classList.toggle("is-active", on);
                info.item.classList.toggle("is-linked", on);
            }
            button.addEventListener("mouseenter", function () { link(true); });
            button.addEventListener("mouseleave", function () { link(false); });
            button.addEventListener("focus", function () { link(true); });
            button.addEventListener("blur", function () { link(false); });
            button.addEventListener("click", function () {
                if (info.item.hidden && allChip) { allChip.click(); }
                info.item.scrollIntoView({ block: "center", behavior: ui.reduceMotion ? "auto" : "smooth" });
                flash(info.item);
            });
            info.item.addEventListener("mouseenter", function () { button.classList.add("is-active"); });
            info.item.addEventListener("mouseleave", function () { button.classList.remove("is-active"); });
            return button;
        });

        if (today >= semStart && today <= semEnd) {
            var marker = document.createElement("span");
            marker.className = "hl-today";
            marker.title = "Today";
            marker.setAttribute("aria-hidden", "true");
            marker.style.setProperty("--l", pct(daysBetween(semStart, today) + 0.5).toFixed(2));
            track.appendChild(marker);
        }

        // Sentence above the strip
        var line = page.querySelector("[data-hl-next]");
        if (line) {
            line.textContent = "";
            var strong = document.createElement("strong");
            if (!next) {
                line.textContent = "No more holidays this semester.";
            } else if (next.state === "current") {
                strong.textContent = next.title;
                line.appendChild(document.createTextNode("On break: "));
                line.appendChild(strong);
                line.appendChild(document.createTextNode(next.left === 0 ? ", last day is today." : ", " + plural(next.left, "more day") + " to go."));
            } else {
                strong.textContent = next.title;
                line.appendChild(document.createTextNode("Next break: "));
                line.appendChild(strong);
                line.appendChild(document.createTextNode(", " + next.label.charAt(0).toLowerCase() + next.label.slice(1) + "."));
            }
        }

        strip.hidden = false;
        strip.classList.add("is-ready");
        return segments;
    }

    /* ---------- feedback after saving ---------- */

    function flash(item) {
        item.classList.remove("is-flash");
        void item.offsetWidth;
        item.classList.add("is-flash");
        window.setTimeout(function () { item.classList.remove("is-flash"); }, 2000);
    }

    function initFlash(infos) {
        var stored = store("get");
        if (!stored) { return; }
        // Only after a successful save (an invalid form re-opens its dialog instead)
        if (document.querySelector("dialog[data-ac-open-on-load]") || !ui.app.querySelector(".ac-toast--success")) { return; }

        var parts = stored.split("|");
        var match = infos.filter(function (info) {
            return info.item.getAttribute("data-start") === parts[0] && info.title === parts.slice(1).join("|");
        })[0];
        if (!match) { return; }

        window.setTimeout(function () {
            match.item.scrollIntoView({ block: "center", behavior: ui.reduceMotion ? "auto" : "smooth" });
            flash(match.item);
        }, 250);
    }

    /* ---------- add / edit form hint ---------- */

    function initFormHint(form) {
        var hint = form.querySelector("[data-hl-hint]");
        var title = form.elements.title;
        var start = form.elements.start_date;
        var end = form.elements.end_date;
        if (!hint || !start || !end) { return; }

        var editing = form.getAttribute("data-hl-editing");
        var semStart = parseISO(form.getAttribute("data-sem-start"));
        var semEnd = parseISO(form.getAttribute("data-sem-end"));
        var existing = page ? ui.all("[data-hl-item]", page) : [];
        var last = null;

        start.min = form.getAttribute("data-sem-start") || "";
        start.max = form.getAttribute("data-sem-end") || "";
        end.max = form.getAttribute("data-sem-end") || "";

        function show(message, warn) {
            hint.classList.toggle("is-warn", !!warn);
            if (message !== last) {
                last = message;
                hint.textContent = message;
                hint.classList.remove("is-pop");
                if (!ui.reduceMotion) { void hint.offsetWidth; hint.classList.add("is-pop"); }
            }
        }

        function overlap(s, e) {
            for (var i = 0; i < existing.length; i += 1) {
                var item = existing[i];
                if (editing && item.getAttribute("data-id") === editing) { continue; }
                var itemStart = parseISO(item.getAttribute("data-start"));
                var itemEnd = parseISO(item.getAttribute("data-end"));
                if (itemStart <= e && itemEnd >= s) { return item; }
            }
            return null;
        }

        function update() {
            var s = start.value ? parseISO(start.value) : null;
            var e = end.value ? parseISO(end.value) : s;
            end.min = start.value || form.getAttribute("data-sem-start") || "";
            end.setCustomValidity("");

            if (!s) { show(DEFAULT_HINT, false); return; }
            if (e < s) {
                end.setCustomValidity("The end date can't be before the start date.");
                show("The end date can't be before the start date.", true);
                return;
            }
            if ((semStart && s < semStart) || (semEnd && e > semEnd)) {
                show("Dates must fall inside the semester (" + short(semStart) + " to " + short(semEnd) + ").", true);
                return;
            }
            var other = overlap(s, e);
            if (other) {
                show("These dates overlap " + other.getAttribute("data-title") + ".", true);
                return;
            }
            show(daysBetween(s, e) === 0 ? "A single day off." : plural(daysBetween(s, e) + 1, "day") + " off.", false);
        }

        [start, end].forEach(function (field) {
            field.addEventListener("input", update);
            field.addEventListener("change", update);
        });
        form.addEventListener("submit", function () {
            if (form.checkValidity() && start.value && title) {
                store("set", start.value + "|" + title.value.trim());
            }
        });
        update();
    }

    /* ---------- init ---------- */

    if (page) { initList(); }
    ui.all("form[data-hl-form]").forEach(initFormHint);
}());