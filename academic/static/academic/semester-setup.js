/* Semester setup: add and remove routine rows, keep the Django formset in sync. */
(function () {
    "use strict";

    var form = document.querySelector("[data-routine-form]");
    if (!form) { return; }

    var list = form.querySelector("[data-routine-list]");
    var template = document.querySelector("[data-routine-template]");
    var addButton = form.querySelector("[data-add-row]");
    var totalInput = form.querySelector('input[name="routine-TOTAL_FORMS"]');
    if (!list || !template || !addButton || !totalInput) { return; }

    var MAX_ROWS = 30;
    var REMOVE_MS = 200;
    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function getRows() {
        return Array.prototype.filter.call(list.children, function (el) {
            return el.hasAttribute("data-routine-row") && !el.classList.contains("is-removing");
        });
    }

    // Rewrites routine-<n>-field in every name, id and label so numbers stay 0..n-1.
    function renumber() {
        var rows = getRows();
        rows.forEach(function (row, index) {
            var targets = row.querySelectorAll("[name], [id], label[for]");
            Array.prototype.forEach.call(targets, function (el) {
                ["name", "id", "for"].forEach(function (attr) {
                    var value = el.getAttribute(attr);
                    if (value) {
                        el.setAttribute(
                            attr,
                            value.replace(/routine-(\d+|__prefix__)-/, "routine-" + index + "-")
                        );
                    }
                });
            });
        });
        totalInput.value = rows.length;
        addButton.disabled = rows.length >= MAX_ROWS;
    }

    function addRow() {
        if (getRows().length >= MAX_ROWS) { return; }

        var row = template.content.firstElementChild.cloneNode(true);
        row.classList.add("is-new");
        list.appendChild(row);
        renumber();

        row.addEventListener("animationend", function () {
            row.classList.remove("is-new");
        }, { once: true });

        var first = row.querySelector("select, input:not([type='hidden'])");
        if (first) { first.focus({ preventScroll: false }); }
    }

    function removeRow(row) {
        function finish() {
            row.remove();
            renumber();
        }
        if (reduceMotion) {
            finish();
            return;
        }
        row.classList.add("is-removing");
        renumber(); // count updates right away
        setTimeout(function () { row.remove(); }, REMOVE_MS);
    }

    addButton.addEventListener("click", addRow);

    list.addEventListener("click", function (event) {
        var button = event.target.closest("[data-remove-row]");
        if (!button) { return; }
        var row = button.closest("[data-routine-row]");
        if (row) { removeRow(row); }
    });

    /* End date can't be picked before the start date. */
    var startDate = form.querySelector('input[name="start_date"]');
    var endDate = form.querySelector('input[name="end_date"]');

    function syncDates() {
        if (startDate && endDate) { endDate.min = startDate.value || ""; }
    }
    if (startDate) { startDate.addEventListener("change", syncDates); }
    syncDates();

    renumber();
})();