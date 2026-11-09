/* ==========================================================================
   Academic UI behaviour (academic.js). Vanilla JS, no network requests.

   PART 1  Shared behaviour: toasts, dialogs, confirm dialogs, loading
           buttons, scroll reveal, count-up, progress bars, list filters.
   (Later parts are appended below, one section per page.)

   Markup hooks (data attributes):
     data-ac-open="dialogId"      open a <dialog>; data-fill-* on the trigger
                                  prefill it (data-fill-action sets the form
                                  action, data-fill-label fills [data-ac-label],
                                  data-fill-<field> sets that field's value)
     data-ac-close                close the dialog it sits in
     data-ac-open-on-load         on a <dialog>: open it on page load (forms with errors)
     data-ac-confirm="Message"    on a <form>: ask before submitting
       data-ac-confirm-title / data-ac-confirm-label   optional dialog texts
     data-reveal                  fade/slide in when scrolled into view
     data-count="87.5" data-decimals="1"   animate a number up from 0
     data-ac-filter-group         wraps filter buttons [data-ac-filter="value|all"],
                                  an optional [data-ac-search] input,
                                  items [data-ac-item][data-ac-status="a b"],
                                  [data-ac-filter-empty] and [data-ac-filter-count]
   ========================================================================== */
(function () {
    "use strict";

    var root = document.documentElement;
    root.classList.add("js");

    var app = document.querySelector(".ac");
    if (!app) { return; }

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function all(selector, scope) {
        return Array.prototype.slice.call((scope || app).querySelectorAll(selector));
    }

    /* ---------- Toasts (Django messages) ---------- */

    function initToasts() {
        all(".ac-toast").forEach(function (toast) {
            var delay = toast.classList.contains("ac-toast--error") ? 9000 : 5500;
            var timer = null;

            function close() {
                clearTimeout(timer);
                toast.classList.add("is-leaving");
                setTimeout(function () { toast.remove(); }, 260);
            }
            function start() { timer = setTimeout(close, delay); }

            var button = toast.querySelector(".ac-toast__close");
            if (button) { button.addEventListener("click", close); }
            toast.addEventListener("mouseenter", function () { clearTimeout(timer); });
            toast.addEventListener("mouseleave", start);
            start();
        });
    }

    /* ---------- Dialogs ---------- */

    function fillDialog(dialog, trigger) {
        var form = dialog.querySelector("form");
        Object.keys(trigger.dataset).forEach(function (key) {
            if (key.indexOf("fill") !== 0 || key.length < 5) { return; }
            var name = key.charAt(4).toLowerCase() + key.slice(5); // fillAction -> action
            var value = trigger.dataset[key];

            if (name === "action") {
                if (form) { form.action = value; }
            } else if (name === "label") {
                all("[data-ac-label]", dialog).forEach(function (el) { el.textContent = value; });
            } else if (form && form.elements[name]) {
                form.elements[name].value = value;
            }
        });
    }

    function openDialog(dialog, trigger) {
        if (!dialog) { return; }
        if (trigger) { fillDialog(dialog, trigger); }

        if (typeof dialog.showModal === "function") {
            if (!dialog.open) { dialog.showModal(); }
        } else {
            dialog.setAttribute("open", "");
        }

        var target = dialog.querySelector(".has-error input, .has-error select, .has-error textarea") ||
            dialog.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=color]), select, textarea");
        if (target) { target.focus(); }
    }

    function closeDialog(dialog) {
        if (typeof dialog.close === "function") { dialog.close(); }
        else { dialog.removeAttribute("open"); }
    }

    function initDialogs() {
        document.addEventListener("click", function (event) {
            var opener = event.target.closest("[data-ac-open]");
            if (opener && app.contains(opener)) {
                event.preventDefault();
                openDialog(document.getElementById(opener.getAttribute("data-ac-open")), opener);
                return;
            }

            var closer = event.target.closest("[data-ac-close]");
            if (closer) {
                var host = closer.closest("dialog");
                if (host) { event.preventDefault(); closeDialog(host); }
                return;
            }

            // A click on the backdrop lands on the <dialog> element itself
            if (event.target.classList && event.target.classList.contains("ac-dialog")) {
                closeDialog(event.target);
            }
        });

        all("dialog[data-ac-open-on-load]").forEach(function (dialog) { openDialog(dialog); });
    }

    /* ---------- Confirm before destructive actions ---------- */

    function initConfirm() {
        var dialog = document.getElementById("ac-confirm");
        var pending = null;

        function submitPending() {
            var form = pending.form;
            var submitter = pending.submitter;
            pending = null;
            form.dataset.acConfirmed = "1";
            if (typeof form.requestSubmit === "function") { form.requestSubmit(submitter); }
            else { form.submit(); }
        }

        document.addEventListener("submit", function (event) {
            var form = event.target;
            if (!form.matches || !form.matches("[data-ac-confirm]") || form.dataset.acConfirmed === "1") {
                return;
            }
            event.preventDefault();
            pending = { form: form, submitter: event.submitter || null };
            var message = form.getAttribute("data-ac-confirm");

            if (!dialog) {
                if (window.confirm(message)) { submitPending(); } else { pending = null; }
                return;
            }

            dialog.querySelector("[data-ac-confirm-text]").textContent = message;
            dialog.querySelector("[data-ac-confirm-title]").textContent =
                form.getAttribute("data-ac-confirm-title") || "Are you sure?";
            dialog.querySelector("[data-ac-confirm-yes]").textContent =
                form.getAttribute("data-ac-confirm-label") || "Confirm";
            openDialog(dialog);
        });

        if (dialog) {
            dialog.querySelector("[data-ac-confirm-yes]").addEventListener("click", function () {
                closeDialog(dialog);
                if (pending) { submitPending(); }
            });
            dialog.addEventListener("close", function () {
                // Cancelled or dismissed: nothing is submitted
                setTimeout(function () { pending = null; }, 0);
            });
        }
    }

    /* ---------- Loading state on submit ---------- */

    function initLoading() {
        document.addEventListener("submit", function (event) {
            if (event.defaultPrevented) { return; } // still waiting for confirmation
            var form = event.target;
            var button = event.submitter ||
                form.querySelector("button[type=submit], button:not([type])");
            if (button && button.classList) { button.classList.add("is-loading"); }
        });

        // Coming back with the browser's back button must not leave buttons spinning
        window.addEventListener("pageshow", function (event) {
            if (!event.persisted) { return; }
            all(".is-loading").forEach(function (el) { el.classList.remove("is-loading"); });
            all("form[data-ac-confirmed]").forEach(function (form) { delete form.dataset.acConfirmed; });
        });
    }

    /* ---------- Reveal, progress bars and count-up ---------- */

    function countUp(el) {
        var target = parseFloat(el.getAttribute("data-count"));
        var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
        if (isNaN(target)) { return; }
        var duration = 900;
        var started = null;

        function frame(now) {
            if (started === null) { started = now; }
            var t = Math.min((now - started) / duration, 1);
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = (target * eased).toFixed(decimals);
            if (t < 1) { requestAnimationFrame(frame); }
        }
        requestAnimationFrame(frame);
    }

    function initMotion() {
        var reveals = all("[data-reveal]");
        var bars = all(".ac-progress__bar");
        var counters = all("[data-count]");

        // Stagger siblings a little (max 6 steps)
        reveals.forEach(function (el) {
            if (el.style.getPropertyValue("--i")) { return; }
            var parent = el.parentNode;
            parent.__acIndex = parent.__acIndex || 0;
            el.style.setProperty("--i", Math.min(parent.__acIndex, 6));
            parent.__acIndex += 1;
        });

        if (reduceMotion || !("IntersectionObserver" in window)) {
            reveals.forEach(function (el) { el.classList.add("is-visible"); });
            return;
        }

        // Bars start empty and fill when they scroll into view
        bars.forEach(function (bar) {
            var value = bar.style.getPropertyValue("--value");
            if (value) {
                bar.setAttribute("data-final", value);
                bar.style.setProperty("--value", "0");
            }
        });

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) { return; }
                var el = entry.target;
                observer.unobserve(el);

                if (el.hasAttribute("data-reveal")) { el.classList.add("is-visible"); }
                if (el.hasAttribute("data-count")) { countUp(el); }
                if (el.hasAttribute("data-final")) {
                    requestAnimationFrame(function () {
                        el.style.setProperty("--value", el.getAttribute("data-final"));
                    });
                }
            });
        }, { threshold: 0.12 });

        reveals.concat(bars, counters).forEach(function (el) {
            // numbers and bars inside a page that waits for its timeline start when that content opens
            var waiting = el.closest("[data-after-snake]");
            var gate = waiting && waiting.closest("[data-snk-gate]");
            if (gate && !gate.classList.contains("is-open")) {
                var start = function () { observer.observe(el); };
                gate.addEventListener("snk:open", start, { once: true });
                setTimeout(start, 10000);          // failsafe: never leave a bar empty
            } else {
                observer.observe(el);
            }
        });
    }

    /* ---------- Filters and search over server-rendered lists ---------- */

    function initFilters() {
        all("[data-ac-filter-group]").forEach(function (group) {
            var buttons = all("[data-ac-filter]", group);
            var items = all("[data-ac-item]", group);
            var search = group.querySelector("[data-ac-search]");
            var empty = group.querySelector("[data-ac-filter-empty]");
            var counter = group.querySelector("[data-ac-filter-count]");
            var current = "all";

            function apply() {
                var query = search ? search.value.trim().toLowerCase() : "";
                var shown = 0;
                items.forEach(function (item) {
                    var statuses = (item.getAttribute("data-ac-status") || "").split(" ");
                    var statusOk = current === "all" || statuses.indexOf(current) !== -1;
                    var textOk = !query || item.textContent.toLowerCase().indexOf(query) !== -1;
                    var visible = statusOk && textOk;
                    item.hidden = !visible;
                    if (visible) { shown += 1; }
                });
                if (empty) { empty.hidden = shown !== 0 || items.length === 0; }
                if (counter) { counter.textContent = shown; }
            }

            buttons.forEach(function (button) {
                button.addEventListener("click", function () {
                    current = button.getAttribute("data-ac-filter");
                    buttons.forEach(function (other) {
                        other.setAttribute("aria-pressed", other === button ? "true" : "false");
                    });
                    apply();
                });
            });
            if (search) { search.addEventListener("input", apply); }
        });
    }

    /* ---------- Navigation: keep the current tab visible on small screens ---------- */

    function initNav() {
        var links = app.querySelector(".ac-nav__links");
        var current = app.querySelector(".ac-nav__link[aria-current=page]");
        if (links && current) {
            links.scrollLeft = current.offsetLeft - (links.clientWidth - current.offsetWidth) / 2;
        }
    }

    /* ---------- Init ---------- */

    initToasts();
    initDialogs();
    initConfirm();
    initLoading();
    initMotion();
    initFilters();
    initNav();

    // Small shared API for the page-specific parts below
    window.AcademicUI = {
        all: all,
        app: app,
        reduceMotion: reduceMotion,
        openDialog: openDialog,
        closeDialog: closeDialog
    };
}());