/* ==========================================================================
   CGPA & grade pages behaviour (cgpa.js). Vanilla JS, no network requests.
   Needs academic.js to load first (it provides window.AcademicUI, the
   count-up numbers, animated progress bars, dialogs and confirm dialogs).

   GPA and CGPA are calculated by the server (services.py) and only displayed
   here. This file does not calculate or store any grades.

   What this adds:
     - the CGPA ring fills from empty when the page opens
     - grade form hint (dialog and edit page): reminds what to enter, warns
       when the grade point is outside the allowed range (read from the
       input's own min/max) and echoes what is about to be saved
   ========================================================================== */
(function () {
    "use strict";

    var ui = window.AcademicUI;
    if (!ui) { return; }

    /* ---------- ring ---------- */

    function initRing() {
        ui.all("[data-cg-ring]").forEach(function (ring) {
            var final = parseFloat(ring.getAttribute("data-cg-ring"));
            if (isNaN(final) || ui.reduceMotion) { ring.classList.add("is-ready"); return; }

            var duration = 1100;
            var started = null;
            function frame(now) {
                if (started === null) { started = now; }
                var t = Math.min((now - started) / duration, 1);
                var eased = 1 - Math.pow(1 - t, 3);
                // "important" beats the CSS rule that holds the ring at 0 until we start
                ring.style.setProperty("--value", (final * eased).toFixed(1), "important");
                if (t < 1) { requestAnimationFrame(frame); }
                else { ring.style.setProperty("--value", String(final)); ring.classList.add("is-ready"); }
            }
            setTimeout(function () { requestAnimationFrame(frame); }, 200);
        });
    }

    /* ---------- grade form hint ---------- */

    function initForm(form) {
        var letter = form.elements.grade;
        var point = form.elements.grade_point;
        var hint = form.querySelector("[data-cg-hint]");
        if (!letter || !point || !hint) { return; }

        var DEFAULT = hint.textContent;
        var last = null;

        function say(text, warn) {
            if (last === text + warn) { return; }
            last = text + warn;
            hint.textContent = text;
            hint.classList.toggle("is-warn", !!warn);
            hint.classList.remove("is-pop");
            if (!ui.reduceMotion) { void hint.offsetWidth; hint.classList.add("is-pop"); }
        }

        function update() {
            var name = letter.value.trim();
            var raw = point.value.trim();
            var value = parseFloat(raw);
            var min = point.min !== "" ? parseFloat(point.min) : null;
            var max = point.max !== "" ? parseFloat(point.max) : null;

            if (raw !== "" && !isNaN(value) && ((min !== null && value < min) || (max !== null && value > max))) {
                say("Grade point must be between " + min + " and " + max + ".", true);
            } else if (name && raw !== "" && !isNaN(value)) {
                say("Saving " + name + " (" + value.toFixed(2) + ") for this course.", false);
            } else {
                say(DEFAULT, false);
            }
        }

        letter.addEventListener("input", update);
        point.addEventListener("input", update);

        // The dialog is filled by academic.js without input events: refresh when it opens
        var dialog = form.closest("dialog");
        if (dialog && "MutationObserver" in window) {
            new MutationObserver(function () { if (dialog.open) { last = null; update(); } })
                .observe(dialog, { attributes: true, attributeFilter: ["open"] });
        }
        update();
    }

    /* ---------- Init ---------- */

    initRing();
    ui.all("[data-cg-form]").forEach(initForm);
}());
