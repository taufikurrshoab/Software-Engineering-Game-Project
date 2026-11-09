/* ==========================================================================
   Timeline page behaviour (timeline.js). Vanilla JS, no network requests.
   Needs academic.js to load first (it provides window.AcademicUI and the
   reveal animations).

   Everything on the page is rendered by the server from the real routine,
   holidays and assignments. This file only filters and pages it:
     - event type chips: All / Classes / Deadlines / Holidays
     - time range: Upcoming / Past / All, measured against the server's today
     - weeks are shown a few at a time ("Show more weeks"); Past starts from
       the most recent week and goes backwards
     - days and weeks with nothing left to show disappear; the days that
       remain enter with a light stagger
   ========================================================================== */
(function () {
    "use strict";

    var ui = window.AcademicUI;
    if (!ui) { return; }

    var page = document.querySelector("[data-timeline]");
    if (!page) { return; }

    var WEEKS_PER_PAGE = 4;
    var today = page.getAttribute("data-today") || "";   // ISO dates compare correctly as strings

    var kindButtons = ui.all("[data-tl-kind]", page);
    var whenButtons = ui.all("[data-tl-when]", page);
    var toolbar = page.querySelector("[data-tl-toolbar]");
    var moreWrap = page.querySelector("[data-tl-more-wrap]");
    var more = page.querySelector("[data-tl-more]");
    var empty = page.querySelector("[data-tl-empty]");

    var weeks = ui.all("[data-tl-week]", page).map(function (week) {
        return {
            el: week,
            days: ui.all("[data-tl-day]", week).map(function (day) {
                return {
                    el: day,
                    date: day.getAttribute("data-date"),
                    events: ui.all("[data-tl-event]", day).map(function (event) {
                        return { el: event, kind: event.getAttribute("data-kind") };
                    })
                };
            })
        };
    });
    var days = [];
    weeks.forEach(function (week) { days = days.concat(week.days); });

    var state = { kind: "all", when: "upcoming" };
    var limit = WEEKS_PER_PAGE;

    /* ---------- nothing to show at all ---------- */

    var hasEvents = days.some(function (day) {
        return day.events.some(function (event) { return event.kind !== "today"; });
    });
    if (!hasEvents) {
        showEmpty("Nothing scheduled yet",
            "Add classes to your routine, deadlines to your assignments or holidays, and they will appear here.", true);
        if (toolbar) { toolbar.hidden = true; }
        return;
    }

    function showEmpty(title, text, link) {
        if (!empty) { return; }
        empty.querySelector("[data-tl-empty-title]").textContent = title;
        empty.querySelector("[data-tl-empty-text]").textContent = text;
        var action = empty.querySelector("[data-tl-empty-link]");
        if (action) { action.hidden = !link; }
        empty.hidden = false;
    }

    /* ---------- hide chips for event types that do not exist ---------- */

    var present = {};
    days.forEach(function (day) {
        day.events.forEach(function (event) { present[event.kind] = true; });
    });
    var kindCount = 0;
    kindButtons.forEach(function (button) {
        var kind = button.getAttribute("data-tl-kind");
        if (kind === "all") { return; }
        if (present[kind]) { kindCount += 1; } else { button.hidden = true; }
    });
    if (kindCount < 2) {
        var kindGroup = page.querySelector("[data-tl-kinds]");
        if (kindGroup) { kindGroup.hidden = true; }
    }

    /* ---------- default time range ---------- */

    var hasUpcoming = days.some(function (day) { return day.date >= today; });
    state.when = hasUpcoming ? "upcoming" : "past";

    /* ---------- render ---------- */

    function inRange(date) {
        if (state.when === "all") { return true; }
        return state.when === "upcoming" ? date >= today : date < today;
    }

    function render(animate) {
        // 1. which days (and events) are visible
        days.forEach(function (day) {
            var visibleEvents = 0;
            day.events.forEach(function (event) {
                var show = state.kind === "all" || event.kind === state.kind;
                event.el.hidden = !show;
                if (show && event.kind !== "today") { visibleEvents += 1; }
            });
            var todayOnly = state.kind === "all" && day.date === today;
            day.visible = inRange(day.date) && (visibleEvents > 0 || todayOnly);
        });

        // 2. which weeks have something to show, and which of them fit on the page
        var live = weeks.filter(function (week) {
            return week.days.some(function (day) { return day.visible; });
        });
        var shown = state.when === "past" ? live.slice(Math.max(live.length - limit, 0)) : live.slice(0, limit);

        var order = 0;
        weeks.forEach(function (week) {
            var show = shown.indexOf(week) !== -1;
            week.el.hidden = !show;
            week.days.forEach(function (day) {
                var showDay = show && day.visible;
                day.el.hidden = !showDay;
                if (showDay && animate && !ui.reduceMotion) {
                    day.el.style.setProperty("--n", Math.min(order, 10));
                    day.el.classList.remove("is-entering");
                    void day.el.offsetWidth;                 // restart the animation
                    day.el.classList.add("is-entering");
                    order += 1;
                }
            });
        });

        // 3. paging button and empty message
        var remaining = live.length - shown.length;
        if (moreWrap) { moreWrap.hidden = remaining <= 0; }
        if (more && remaining > 0) {
            more.textContent = state.when === "past"
                ? "Show earlier weeks (" + remaining + " more)"
                : "Show more weeks (" + remaining + " more)";
        }
        if (empty) {
            empty.hidden = live.length !== 0;
            if (live.length === 0) {
                showEmpty("Nothing to show",
                    state.when === "upcoming" ? "Nothing is coming up for this filter."
                        : state.when === "past" ? "Nothing has happened yet for this filter."
                        : "No events match this filter.", false);
            }
        }
    }

    function press(buttons, active) {
        buttons.forEach(function (button) { button.setAttribute("aria-pressed", button === active ? "true" : "false"); });
    }

    kindButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            state.kind = button.getAttribute("data-tl-kind");
            limit = WEEKS_PER_PAGE;
            press(kindButtons, button);
            render(true);
        });
    });
    whenButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            state.when = button.getAttribute("data-tl-when");
            limit = WEEKS_PER_PAGE;
            press(whenButtons, button);
            render(true);
        });
    });
    if (more) {
        more.addEventListener("click", function () {
            limit += WEEKS_PER_PAGE;
            render(true);
        });
    }

    // Reflect the default range in the buttons, then draw (no entrance: data-reveal does that)
    whenButtons.forEach(function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-tl-when") === state.when ? "true" : "false");
    });
    render(false);
}());
