/* Project form: screenshot preview and technology chips.
   The form works without this file; this only adds feedback. */
(function () {
    "use strict";

    var form = document.querySelector("[data-project-form]");
    if (!form) { return; }

    var MAX_BYTES = 5 * 1024 * 1024;

    /* Screenshot preview and size check */
    var fileInput = form.querySelector("[data-sp-file]");
    var preview = form.querySelector("[data-sp-preview]");
    var fileError = form.querySelector("[data-sp-file-error]");
    var previewUrl = null;

    function clearPreview() {
        if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
        preview.hidden = true;
        preview.querySelector("img").removeAttribute("src");
    }

    if (fileInput && preview) {
        fileInput.addEventListener("change", function () {
            clearPreview();
            fileError.hidden = true;
            var file = fileInput.files && fileInput.files[0];
            if (!file) { return; }

            if (file.type.indexOf("image/") !== 0) {
                fileError.textContent = "Please choose an image file.";
                fileError.hidden = false;
                fileInput.value = "";
                return;
            }
            if (file.size > MAX_BYTES) {
                fileError.textContent = "Image must be smaller than 5 MB.";
                fileError.hidden = false;
                fileInput.value = "";
                return;
            }
            previewUrl = URL.createObjectURL(file);
            preview.querySelector("img").src = previewUrl;
            preview.hidden = false;
        });
    }

    /* Technology chips */
    var techInput = form.querySelector('input[name="technologies_text"]');
    var techBox = form.querySelector("[data-sp-tech-preview]");

    function renderTech() {
        var seen = {};
        var names = techInput.value.split(",").map(function (s) {
            return s.replace(/\s+/g, " ").trim();
        }).filter(function (s) {
            var key = s.toLowerCase();
            if (!s || seen[key]) { return false; }
            seen[key] = true;
            return true;
        });

        techBox.textContent = "";
        names.forEach(function (name) {
            var chip = document.createElement("span");
            chip.className = "skill-tag";
            chip.textContent = name;
            techBox.appendChild(chip);
        });
    }

    if (techInput && techBox) {
        techInput.addEventListener("input", renderTech);
        renderTech();
    }
})();