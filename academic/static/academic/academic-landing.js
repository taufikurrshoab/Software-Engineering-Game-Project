/* ==========================================================================
   Academic home / landing page behaviour (academic-landing.js).
   Vanilla JS, no network requests. Needs academic.js to load first
   (window.AcademicUI, reveal animations).

     - opening sequence: when the timeline scrolls into view the line draws,
       light starts to flow along it and the branches grow one after another
       (CSS does the animating; this only adds the .is-live class)
     - hover, focus or click on a branch highlights it and shows its
       description in the panel; the panel link opens that feature
     - the sample preview: a slider moves through a SAMPLE semester. Nothing
       here reads or writes the user's records.
   ========================================================================== */
(function () {
    "use strict";

    var ui = window.AcademicUI;
    if (!ui) { return; }

    var root = document.querySelector("[data-landing]");
    if (!root) { return; }

    /* ---------- opening sequence ---------- */

    function initStage() {
        var stage = root.querySelector("[data-hm-stage]");
        if (!stage) { return; }

        if (ui.reduceMotion || !("IntersectionObserver" in window)) {
            stage.classList.add("is-live");
            return;
        }
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) { return; }
                stage.classList.add("is-live");
                observer.disconnect();
            });
        }, { threshold: 0.25 });
        observer.observe(stage);
    }

    /* ---------- branches and info panel ---------- */

    function initBranches() {
        var branches = ui.all("[data-hm-branch]", root);
        var panel = root.querySelector("[data-hm-panel]");
        if (!branches.length || !panel) { return; }

        var title = panel.querySelector("[data-hm-panel-title]");
        var text = panel.querySelector("[data-hm-panel-text]");
        var link = panel.querySelector("[data-hm-panel-link]");
        var icon = panel.querySelector("[data-hm-panel-icon]");
        var current = null;

        function activate(branch, animate) {
            if (branch === current) { return; }
            current = branch;
            branches.forEach(function (item) { item.classList.toggle("is-active", item === branch); });

            title.textContent = branch.getAttribute("data-title");
            text.textContent = branch.getAttribute("data-text");
            link.setAttribute("href", branch.getAttribute("data-href"));
            icon.setAttribute("href", "#" + branch.getAttribute("data-icon"));

            if (animate && !ui.reduceMotion) {
                panel.classList.remove("is-swap");
                void panel.offsetWidth;                       // restart the animation
                panel.classList.add("is-swap");
            }
        }

        branches.forEach(function (branch) {
            branch.addEventListener("mouseenter", function () { activate(branch, true); });
            branch.addEventListener("focus", function () { activate(branch, true); });
            branch.addEventListener("click", function () { activate(branch, true); });
            branch.addEventListener("keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activate(branch, true);
                }
            });
        });

        activate(branches[0], false);
    }

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

    initStage();
    initBranches();
    initDemo();
}());
