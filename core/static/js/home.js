/* Homepage interactions: gentle reveal on scroll. The page works without this file. */
(function () {
    "use strict";

    var root = document.documentElement;
    var items = Array.prototype.slice.call(document.querySelectorAll(".home [data-reveal]"));

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // No animation needed or supported: leave everything visible.
    if (!items.length || reduceMotion || !("IntersectionObserver" in window)) {
        return;
    }

    // Elements already on screen are marked visible first, so enabling the
    // hidden state below doesn't make the top of the page flash.
    var vh = window.innerHeight || document.documentElement.clientHeight;
    items.forEach(function (el) {
        if (el.getBoundingClientRect().top < vh) {
            el.classList.add("is-visible");
        }
    });

    root.classList.add("has-js");

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    items.forEach(function (el) {
        if (!el.classList.contains("is-visible")) {
            observer.observe(el);
        }
    });
})();