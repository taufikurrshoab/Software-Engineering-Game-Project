/* ==========================================================================
   Academic home / landing page behaviour (academic-landing.js).
   Vanilla JS, no network requests. Needs academic.js to load first
   (window.AcademicUI).

     - the sample preview: a slider moves through a SAMPLE semester. Nothing
       here reads or writes the user's records.

   The winding feature timeline and its opening animation live in
   academic-snake.js (shared with the dashboard).
   ========================================================================== */
(function () {
    "use strict";

    var ui = window.AcademicUI;
    if (!ui) { return; }

    var root = document.querySelector("[data-landing]");
    if (!root) { return; }

    /* ---------- sample preview ---------- */

    function weeksText(count) { return count + " week" + (count === 1 ? "" : "s"); }

    function initDemo() {
        var demo = root.querySelector("[data-hm-demo]");
        var slider = demo && demo.querySelector("[data-hm-week]");
        if (!slider) { return; }

        var total = parseInt(slider.getAttribute("data-weeks"), 10) || 1;
        var out = demo.querySelector("[data-hm-week-out]");
        var line = demo.querySelector(".hm-demo__line");
        var deadlines = ui.all("[data-hm-deadline]", demo);

        function update() {
            var week = parseInt(slider.value, 10);
            out.textContent = week;
            line.style.setProperty("--p", (week / total * 100).toFixed(1));

            deadlines.forEach(function (item) {
                var due = parseInt(item.getAttribute("data-week"), 10);
                var badge = item.querySelector("[data-hm-deadline-state]");
                var tone = "info";
                var label;

                if (week < due) { label = "Due in " + weeksText(due - week); }
                else if (week === due) { label = "Due this week"; tone = "soon"; }
                else { label = "Overdue"; tone = "overdue"; }

                item.classList.toggle("is-due", tone === "soon");
                item.classList.toggle("is-late", tone === "overdue");
                badge.textContent = label;
                badge.className = "ac-badge ac-badge--" + tone;
            });
        }

        slider.addEventListener("input", update);
        update();
    }

    initDemo();
}());
