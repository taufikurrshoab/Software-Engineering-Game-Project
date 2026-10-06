/* Academic home: timeline centering, scroll reveal, progress bar, counters. */
(function () {
    "use strict";

    var root = document.documentElement;
    var page = document.querySelector(".academic-home");
    if (!page) { return; }

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var hasObserver = "IntersectionObserver" in window;

    function toArray(list) { return Array.prototype.slice.call(list); }

    function inViewport(el) {
        var vh = window.innerHeight || document.documentElement.clientHeight;
        return el.getBoundingClientRect().top < vh;
    }

    /* ---------- Timeline: center NOW, offer a way back ---------- */

    function initTimeline() {
        var scroller = page.querySelector("[data-timeline-scroll]");
        var now = page.querySelector("[data-timeline-now]");
        if (!scroller || !now) { return; }

        var card = scroller.parentNode;
        var button = null;

        // Distance from the top of the scroll box to the target position of NOW
        function nowTarget() {
            var scrollerRect = scroller.getBoundingClientRect();
            var nowRect = now.getBoundingClientRect();
            var nowTop = nowRect.top - scrollerRect.top + scroller.scrollTop;
            var target = nowTop - (scroller.clientHeight - nowRect.height) / 2;
            var max = scroller.scrollHeight - scroller.clientHeight;
            return Math.max(0, Math.min(target, max));
        }

        function centerNow(smooth) {
            var top = nowTarget();
            if (smooth && !reduceMotion) {
                scroller.scrollTo({ top: top, behavior: "smooth" });
            } else {
                // Instant: temporarily switch off CSS smooth scrolling
                var previous = scroller.style.scrollBehavior;
                scroller.style.scrollBehavior = "auto";
                scroller.scrollTop = top;
                scroller.style.scrollBehavior = previous;
            }
        }

        function buildButton() {
            button = document.createElement("button");
            button.type = "button";
            button.className = "academic-timeline-card__recenter";
            button.hidden = true;
            button.addEventListener("click", function () { centerNow(true); });
            card.appendChild(button);
        }

        function updateButton() {
            if (!button) { return; }
            var distance = scroller.scrollTop - nowTarget();
            // Show only when NOW is clearly out of the middle area
            var away = Math.abs(distance) > scroller.clientHeight * 0.45;
            button.hidden = !away;
            if (away) {
                button.textContent = (distance > 0 ? "\u2191" : "\u2193") + " Back to now";
            }
        }

        var ticking = false;
        scroller.addEventListener("scroll", function () {
            if (ticking) { return; }
            ticking = true;
            requestAnimationFrame(function () {
                updateButton();
                ticking = false;
            });
        }, { passive: true });

        // Keep NOW centered if the box size changes (rotation, resize)
        var resizeTimer = null;
        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(updateButton, 150);
        });

        buildButton();
        centerNow(false);
        updateButton();

        // Fonts can change heights after load, so position once more
        window.addEventListener("load", function () {
            centerNow(false);
            updateButton();
        });
    }

    initTimeline();

    /* ---------- Counters ---------- */

    function animateCount(el) {
        var target = parseInt(el.getAttribute("data-count-to"), 10);
        if (isNaN(target)) { return; }

        if (reduceMotion) {
            el.textContent = target;
            return;
        }

        var duration = 1000;
        var startTime = null;

        function step(now) {
            if (startTime === null) { startTime = now; }
            var t = Math.min((now - startTime) / duration, 1);
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(target * eased);
            if (t < 1) { requestAnimationFrame(step); }
        }

        el.textContent = "0";
        requestAnimationFrame(step);
    }

    /* ---------- Progress bar and counters ---------- */

    // The bar is held at zero by CSS (.has-js without .is-animated).
    var bars = toArray(page.querySelectorAll("[data-progress-bar]"));
    var semester = page.querySelector(".academic-semester");
    var semesterCounters = semester ?
        toArray(semester.querySelectorAll("[data-count-to]")) : [];

    function runProgress(container) {
        if (container.classList.contains("is-animated")) { return; }
        container.classList.add("is-animated");
        toArray(container.querySelectorAll("[data-count-to]")).forEach(animateCount);
        if (semester && semester.contains(container)) {
            semesterCounters.forEach(animateCount);
        }
    }

    /* ---------- Reveal ---------- */

    var items = toArray(page.querySelectorAll("[data-reveal]"));
    var animate = !reduceMotion && hasObserver;

    if (animate) {
        // Elements already on screen are shown first so the top doesn't flash.
        items.forEach(function (el) {
            if (inViewport(el)) { el.classList.add("is-visible"); }
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

        var barObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) { return; }
                runProgress(entry.target);
                barObserver.unobserve(entry.target);
            });
        }, { threshold: 0.4 });

        bars.forEach(function (bar) { barObserver.observe(bar); });
    } else {
        // No animation: everything stays at its final value from the HTML.
        bars.forEach(function (bar) { bar.classList.add("is-animated"); });
    }
})();