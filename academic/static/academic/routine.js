/* ==========================================================================
   Routine page behaviour (routine.js). Vanilla JS, no network requests.
   Needs academic.js to load first (it provides window.AcademicUI and the
   shared dialogs, confirm dialog, filters and reveal animations).

   What this adds:
     - weekly summary (class count, hours), class durations
     - "Today" marker, live "Now" / "Next" status and a progress line
     - animated switch between day tabs
     - cancel / restore dialog (prefilled date, weekday check, mode switch)
     - add / edit form hint: duration and overlap warning
     - brief highlight of a class right after it was added or edited
   ========================================================================== */
(function () {
    "use strict";

    var ui = window.AcademicUI;
    if (!ui) { return; }

    var page = document.querySelector("[data-routine]");
    var DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]; // Monday = 0, like the model
    var FLASH_KEY = "academic-routine-flash";

    /* ---------- helpers ---------- */

    function pad(n) { return n < 10 ? "0" + n : String(n); }

    function parseISO(value) {
        var p = (value || "").split("-");
        if (p.length !== 3) { return null; }
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }
    function toISO(date) {
        return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
    }
    function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
    function weekday(date) { return (date.getDay() + 6) % 7; } // Monday = 0

    function toMinutes(value) {
        var p = (value || "").split(":");
        return p.length < 2 ? NaN : Number(p[0]) * 60 + Number(p[1]);
    }
    function duration(minutes) {
        var h = Math.floor(minutes / 60);
        var m = minutes % 60;
        if (!h) { return m + " min"; }
        return m ? h + "h " + m + "m" : h + "h";
    }
    function strongText(strong, rest) {
        var frag = document.createDocumentFragment();
        var el = document.createElement("strong");
        el.textContent = strong;
        frag.appendChild(el);
        frag.appendChild(document.createTextNode(" " + rest));
        return frag;
    }
    function store(action, value) {
        try {
            if (action === "set") { window.sessionStorage.setItem(FLASH_KEY, value); return null; }
            var stored = window.sessionStorage.getItem(FLASH_KEY);
            window.sessionStorage.removeItem(FLASH_KEY);
            return stored;
        } catch (error) { return null; }
    }

    /* ---------- list page: summary and durations ---------- */

    function initSummary() {
        var classes = ui.all("[data-rt-class]", page);
        var total = 0;

        classes.forEach(function (item) {
            var minutes = toMinutes(item.getAttribute("data-end")) - toMinutes(item.getAttribute("data-start"));
            if (isNaN(minutes) || minutes <= 0) { return; }
            total += minutes;
            var label = item.querySelector("[data-rt-duration]");
            if (label) { label.textContent = duration(minutes); label.hidden = false; }
        });

        var count = page.querySelector("[data-rt-classes]");
        var hours = page.querySelector("[data-rt-hours]");
        if (count) {
            count.textContent = "";
            count.appendChild(strongText(classes.length, classes.length === 1 ? "class" : "classes"));
            count.hidden = false;
        }
        if (hours && total) {
            hours.textContent = "";
            hours.appendChild(strongText(String(Math.round(total / 6) / 10), "hours a week"));
            hours.hidden = false;
        }
    }

    /* ---------- list page: today marker and live status ---------- */

    function initLive() {
        var semStart = parseISO(page.getAttribute("data-sem-start"));
        var semEnd = parseISO(page.getAttribute("data-sem-end"));
        var days = ui.all(".rt-day", page);
        var chips = ui.all("[data-ac-filter][data-day]", page);
        var classes = ui.all("[data-rt-class]", page);

        function tick() {
            var now = new Date();
            var today = weekday(now);
            var day = startOfDay(now);
            var running = semStart && semEnd && day >= semStart && day <= semEnd;
            var minutes = now.getHours() * 60 + now.getMinutes();
            var nextTaken = false;

            days.forEach(function (card) {
                var isToday = Number(card.getAttribute("data-day")) === today;
                card.classList.toggle("is-today", isToday);
                var badge = card.querySelector("[data-rt-today]");
                if (badge) { badge.hidden = !isToday; }
            });
            chips.forEach(function (chip) {
                chip.classList.toggle("is-today", Number(chip.getAttribute("data-day")) === today);
            });

            classes.forEach(function (item) {
                var state = "";
                var progress = 0;

                if (running && Number(item.getAttribute("data-day")) === today) {
                    var start = toMinutes(item.getAttribute("data-start"));
                    var end = toMinutes(item.getAttribute("data-end"));
                    if (minutes >= end) {
                        state = "done";
                    } else if (minutes >= start) {
                        state = "now";
                        progress = Math.round((minutes - start) / (end - start) * 100);
                    } else if (!nextTaken) {
                        state = "next";
                        nextTaken = true;
                    }
                }

                item.classList.toggle("is-done", state === "done");
                item.classList.toggle("is-now", state === "now");
                item.classList.toggle("is-next", state === "next");

                var live = item.querySelector("[data-rt-live]");
                if (live) {
                    live.hidden = state !== "now" && state !== "next";
                    live.textContent = state === "now" ? "Now" : "Up next";
                    live.classList.toggle("ac-badge--present", state === "now");
                    live.classList.toggle("ac-badge--info", state === "next");
                }
                var bar = item.querySelector(".rt-class__progress i");
                if (bar) { bar.style.setProperty("--value", String(progress)); }
            });
        }

        tick();
        window.setInterval(tick, 30000);
        document.addEventListener("visibilitychange", function () {
            if (!document.hidden) { tick(); }
        });
    }

    /* ---------- list page: day tabs animate between views ---------- */

    function initTabs() {
        var group = page.querySelector("[data-ac-filter-group]");
        var board = page.querySelector("[data-rt-board]");
        if (!group || !board) { return; }
        var timer = null;

        group.addEventListener("click", function (event) {
            var chip = event.target.closest("[data-ac-filter]");
            if (!chip) { return; }
            board.classList.add("is-switching");
            window.clearTimeout(timer);
            timer = window.setTimeout(function () { board.classList.remove("is-switching"); }, 450);
        });
    }

    /* ---------- list page: cancel / restore one day ---------- */

    function initCancelDialog() {
        var dialog = document.getElementById("cancel-dialog");
        if (!dialog) { return; }

        var form = dialog.querySelector("form");
        var dateInput = form.elements.date;
        var reason = dialog.querySelector("[data-rt-reason]");
        var reasonInput = form.elements.reason;
        var submit = dialog.querySelector("[data-rt-submit]");
        var help = dialog.querySelector("[data-rt-date-help]");
        var seg = dialog.querySelector(".rt-seg");
        var modeButtons = ui.all("[data-rt-mode]", dialog);
        var semStart = parseISO(page.getAttribute("data-sem-start"));
        var semEnd = parseISO(page.getAttribute("data-sem-end"));
        var state = { cancelUrl: "", restoreUrl: "", weekday: 0, mode: "cancel" };

        function validate() {
            var message = "";
            var picked = dateInput.value ? parseISO(dateInput.value) : null;
            if (picked) {
                if ((semStart && picked < semStart) || (semEnd && picked > semEnd)) {
                    message = "Pick a date inside the semester.";
                } else if (weekday(picked) !== state.weekday) {
                    message = "This class meets on " + DAY_NAMES[state.weekday] + "s.";
                }
            }
            dateInput.setCustomValidity(message);
            help.classList.toggle("is-error", !!message);
            help.textContent = message || (state.mode === "restore"
                ? "Choose a day you cancelled earlier."
                : "Only this day is cancelled. The weekly routine stays the same.");
        }

        function setMode(mode) {
            state.mode = mode;
            seg.setAttribute("data-mode", mode);
            modeButtons.forEach(function (button) {
                button.setAttribute("aria-pressed", button.getAttribute("data-rt-mode") === mode ? "true" : "false");
            });
            form.action = mode === "restore" ? state.restoreUrl : state.cancelUrl;
            reason.setAttribute("data-open", mode === "restore" ? "false" : "true");
            reasonInput.disabled = mode === "restore"; // not posted when restoring
            submit.textContent = mode === "restore" ? "Restore class" : "Cancel class";
            validate();
        }

        function nextOccurrence(wd) {
            var day = startOfDay(new Date());
            if (semStart && day < semStart) { day = new Date(semStart.getTime()); }
            for (var i = 0; i < 7 && weekday(day) !== wd; i += 1) { day.setDate(day.getDate() + 1); }
            return semEnd && day > semEnd ? "" : toISO(day);
        }

        // Runs after academic.js has opened the dialog and filled its action and title
        document.addEventListener("click", function (event) {
            var trigger = event.target.closest('[data-ac-open="cancel-dialog"]');
            if (!trigger) { return; }
            state.cancelUrl = trigger.getAttribute("data-fill-action") || "";
            state.restoreUrl = trigger.getAttribute("data-restore-url") || "";
            state.weekday = Number(trigger.getAttribute("data-weekday"));
            dateInput.min = page.getAttribute("data-sem-start") || "";
            dateInput.max = page.getAttribute("data-sem-end") || "";
            dateInput.value = nextOccurrence(state.weekday);
            reasonInput.value = "";
            setMode("cancel");
        });

        modeButtons.forEach(function (button) {
            button.addEventListener("click", function () { setMode(button.getAttribute("data-rt-mode")); });
        });
        dateInput.addEventListener("input", validate);
        dateInput.addEventListener("change", validate);
    }

    /* ---------- add / edit form: duration and overlap hint ---------- */

    function initFormHint(form) {
        var hint = form.querySelector("[data-rt-hint]");
        var day = form.elements.day_of_week;
        var start = form.elements.start_time;
        var end = form.elements.end_time;
        if (!hint || !day || !start || !end) { return; }

        var existing = page ? ui.all("[data-rt-class]", page) : [];
        var last = "";

        function show(message, warn) {
            hint.classList.toggle("is-warn", !!warn);
            if (message !== last) {
                last = message;
                hint.textContent = message;
                hint.classList.remove("is-pop");
                if (message && !ui.reduceMotion) { void hint.offsetWidth; hint.classList.add("is-pop"); }
            }
        }

        function clash(s, e) {
            for (var i = 0; i < existing.length; i += 1) {
                var item = existing[i];
                if (item.getAttribute("data-day") !== day.value) { continue; }
                var itemStart = toMinutes(item.getAttribute("data-start"));
                var itemEnd = toMinutes(item.getAttribute("data-end"));
                if (itemStart < e && itemEnd > s) { return item; }
            }
            return null;
        }

        function update() {
            var s = toMinutes(start.value);
            var e = toMinutes(end.value);
            end.setCustomValidity("");

            if (isNaN(s) || isNaN(e)) { show("", false); return; }
            if (e <= s) {
                end.setCustomValidity("End time must be after the start time.");
                show("End time must be after the start time.", true);
                return;
            }
            // Overlaps can only be compared on the list page, where the routine is
            // rendered. The edit page has no other classes to check, and the server
            // always validates overlaps anyway.
            var other = day.value !== "" ? clash(s, e) : null;
            if (other) {
                var title = other.querySelector(".ac-item__title");
                show("Overlaps " + (title ? title.textContent : "another class") + " (" +
                    other.querySelector(".ac-item__time span").textContent + "). Pick a different time.", true);
                return;
            }
            show("Lasts " + duration(e - s) + ".", false);
        }

        [day, start, end].forEach(function (field) {
            field.addEventListener("input", update);
            field.addEventListener("change", update);
        });
        form.addEventListener("submit", function () {
            if (form.checkValidity() && day.value !== "" && start.value) { store("set", day.value + "|" + start.value); }
        });
        update();
    }

    /* ---------- list page: highlight the class that was just saved ---------- */

    function initFlash() {
        var stored = store("get");
        if (!stored) { return; }
        // Only after a successful save (an invalid form re-opens its dialog instead)
        if (document.querySelector("dialog[data-ac-open-on-load]") || !ui.app.querySelector(".ac-toast--success")) { return; }

        var parts = stored.split("|");
        var match = ui.all("[data-rt-class]", page).filter(function (item) {
            return item.getAttribute("data-day") === parts[0] && item.getAttribute("data-start") === parts[1];
        })[0];
        if (!match) { return; }

        window.setTimeout(function () {
            match.scrollIntoView({ block: "center", behavior: ui.reduceMotion ? "auto" : "smooth" });
            match.classList.add("is-flash");
            window.setTimeout(function () { match.classList.remove("is-flash"); }, 2000);
        }, 250);
    }

    /* ---------- init ---------- */

    if (page) {
        initSummary();
        initLive();
        initTabs();
        initCancelDialog();
        initFlash();
    }
    ui.all("form[data-rt-form]").forEach(initFormHint);
}());