/* ==========================================================================
   Academic dashboard behaviour (academic-dashboard.js).
   Vanilla JS, no network requests. Needs academic.js to load first
   (window.AcademicUI, count-up numbers, animated progress bars, reveals).

   Every date, week and deadline in the journey is rendered by the server from
   the real semester. This file only brings it to life:
     - when the journey scrolls into view the line fills up to today, nodes pop,
       branches draw and cards rise (CSS animations, started by .is-live)
     - a card opens on hover, and on click or Enter for touch and keyboard
     - on narrow screens the journey is a vertical timeline; the "today"
       marker and the filled part of the line are placed from the real layout
   ========================================================================== */
(function () {
    "use strict";

    var ui = window.AcademicUI;
    if (!ui) { return; }

    var root = document.querySelector("[data-dashboard]");
    var journey = root && root.querySelector("[data-journey]");
    if (!journey) { return; }

    /* ---------- opening sequence ---------- */

    function initLive() {
        if (ui.reduceMotion || !("IntersectionObserver" in window)) {
            journey.classList.add("is-live");
            return;
        }
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) { return; }
                journey.classList.add("is-live");
                observer.disconnect();
            });
        }, { threshold: 0.3 });
        observer.observe(journey);
    }

    /* ---------- cards: click / keyboard to open ---------- */

    function initCards() {
        var cards = ui.all("[data-dj-card]", journey);

        function setOpen(card, open) {
            card.classList.toggle("is-open", open);
            card.setAttribute("aria-expanded", open ? "true" : "false");
        }
        function closeAll(except) {
            cards.forEach(function (card) { if (card !== except) { setOpen(card, false); } });
        }

        cards.forEach(function (card) {
            card.addEventListener("click", function (event) {
                if (event.target.closest("a")) { return; }      // let links work
                var open = !card.classList.contains("is-open");
                closeAll(card);
                setOpen(card, open);
            });
            card.addEventListener("keydown", function (event) {
                if (event.target !== card) { return; }
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    card.click();
                } else if (event.key === "Escape") {
                    setOpen(card, false);
                }
            });
        });

        document.addEventListener("click", function (event) {
            if (!event.target.closest("[data-dj-card]")) { closeAll(null); }
        });
    }

    /* ---------- vertical layout: place "today" from the real positions ---------- */

    function initVerticalLayout() {
        if (!window.matchMedia) { return; }
        var narrow = window.matchMedia("(max-width: 860px)");
        var line = journey.querySelector(".dj__line");
        var nodes = ui.all(".dj-node", journey);
        var count = nodes.length;
        var now = parseFloat(journey.style.getPropertyValue("--now"));
        if (count < 2 || isNaN(now) || !line) { return; }

        function layout() {
            if (!narrow.matches) {
                journey.style.removeProperty("--now-y");
                journey.style.removeProperty("--now-fill");
                line.style.removeProperty("bottom");
                return;
            }
            var box = journey.getBoundingClientRect();
            var centers = nodes.map(function (node) {
                var rect = node.getBoundingClientRect();
                return rect.top - box.top + rect.height / 2;
            });

            // "today" in slot units: 0 is the first event, count - 1 the last
            var slot = now / 100 * count - 0.5;
            var y;
            if (slot <= 0) {
                y = centers[0] + slot * (centers[1] - centers[0]);
            } else if (slot >= count - 1) {
                y = centers[count - 1] + (slot - (count - 1)) * (centers[count - 1] - centers[count - 2]);
            } else {
                var k = Math.floor(slot);
                y = centers[k] + (slot - k) * (centers[k + 1] - centers[k]);
            }
            y = Math.min(Math.max(y, centers[0]), centers[count - 1]);

            line.style.bottom = (box.height - centers[count - 1]) + "px";
            journey.style.setProperty("--now-y", y.toFixed(1) + "px");
            journey.style.setProperty("--now-fill", (y - centers[0]).toFixed(1) + "px");
        }

        layout();
        if ("ResizeObserver" in window) { new ResizeObserver(layout).observe(journey); }
        else { window.addEventListener("resize", layout); }
        if (narrow.addEventListener) { narrow.addEventListener("change", layout); }
        window.addEventListener("load", layout);
    }

    initLive();
    initCards();
    initVerticalLayout();
}());
