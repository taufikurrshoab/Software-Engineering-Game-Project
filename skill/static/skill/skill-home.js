/* Skill page: tree growth, expand/collapse, selected skill or project panel, form slider, reveal.
   The page still works without this file: nodes are normal links. */
(function () {
    "use strict";

    var page = document.querySelector(".skill-page");
    if (!page) { return; }

    var root = document.documentElement;
    var reduce = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var hasObserver = "IntersectionObserver" in window;
    var motion = !reduce && hasObserver;

    function all(selector, context) {
        return Array.prototype.slice.call((context || page).querySelectorAll(selector));
    }

    /* ---------- Reveal on scroll ---------- */

    var items = all("[data-reveal]");

    // Mark what is already on screen first so the top of the page doesn't flash.
    if (motion) {
        var vh = window.innerHeight || document.documentElement.clientHeight;
        items.forEach(function (el) {
            if (el.getBoundingClientRect().top < vh) { el.classList.add("is-visible"); }
        });
    }

    root.classList.add("sk-js");

    if (motion) {
        root.classList.add("sk-motion");
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
    }

    /* ---------- Tree growth: level by level ---------- */

    function depthOf(branch) {
        var depth = 0;
        var parent = branch.parentElement.closest(".sk-branch");
        while (parent) {
            depth += 1;
            parent = parent.parentElement.closest(".sk-branch");
        }
        return depth;
    }

    function growTree(tree) {
        all(".sk-branch", tree).forEach(function (branch) {
            if (!motion) {
                branch.classList.add("is-in");
                return;
            }
            setTimeout(function () { branch.classList.add("is-in"); }, depthOf(branch) * 170);
        });
    }

    all("[data-skill-tree]").forEach(function (tree) {
        if (!motion) {
            growTree(tree);
            return;
        }
        var observer = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) {
                growTree(tree);
                observer.disconnect();
            }
        }, { threshold: 0.1 });
        observer.observe(tree);
    });

    /* ---------- Expand and collapse ---------- */

    function setCollapsed(branch, collapsed) {
        var button = branch.querySelector(":scope > .sk-card > .sk-toggle");
        if (!button) { return; }
        branch.classList.toggle("is-collapsed", collapsed);
        button.setAttribute("aria-expanded", collapsed ? "false" : "true");
        var name = branch.querySelector(".sk-node strong");
        button.setAttribute(
            "aria-label",
            (collapsed ? "Expand " : "Collapse ") + (name ? name.textContent : "skill")
        );
    }

    page.addEventListener("click", function (event) {
        var toggle = event.target.closest("[data-toggle]");
        if (!toggle) { return; }
        var branch = toggle.closest(".sk-branch");
        setCollapsed(branch, !branch.classList.contains("is-collapsed"));
    });

    function setAll(collapsed) {
        all(".sk-branch").forEach(function (branch) { setCollapsed(branch, collapsed); });
    }
    var expandAll = page.querySelector("[data-expand-all]");
    var collapseAll = page.querySelector("[data-collapse-all]");
    if (expandAll) { expandAll.addEventListener("click", function () { setAll(false); }); }
    if (collapseAll) { collapseAll.addEventListener("click", function () { setAll(true); }); }

    /* ---------- Hide or show project nodes ---------- */

    var projectsButton = page.querySelector("[data-toggle-projects]");
    var canvas = page.querySelector(".sk-canvas:not(.sk-canvas--example)");
    if (projectsButton && canvas) {
        if (!canvas.querySelector("[data-pnode]")) {
            projectsButton.hidden = true;  // nothing to hide
        }
        projectsButton.addEventListener("click", function () {
            var hidden = canvas.classList.toggle("sk-hide-projects");
            projectsButton.textContent = hidden ? "Show projects" : "Hide projects";
            projectsButton.setAttribute("aria-pressed", hidden ? "true" : "false");
        });
    }

    /* ---------- Selected skill or project panel ---------- */

    var panel = page.querySelector("[data-detail]");
    if (panel) {
        var emptyText = panel.querySelector("[data-detail-empty]");
        var skillBody = panel.querySelector("[data-detail-body]");
        var projectBody = panel.querySelector("[data-pdetail]");

        // Skill parts
        var ring = panel.querySelector("[data-d-ring]");
        var percent = panel.querySelector("[data-d-percent]");
        var nameOut = panel.querySelector("[data-d-name]");
        var categoryOut = panel.querySelector("[data-d-category]");
        var statusOut = panel.querySelector("[data-d-status]");
        var assessForm = panel.querySelector("[data-d-assess-form]");
        var editLink = panel.querySelector("[data-d-edit]");
        var childLink = panel.querySelector("[data-d-child]");

        // Project parts
        var pImage = panel.querySelector("[data-p-image]");
        var pName = panel.querySelector("[data-p-name]");
        var pDate = panel.querySelector("[data-p-date]");
        var pDescription = panel.querySelector("[data-p-description]");
        var pTech = panel.querySelector("[data-p-tech]");
        var pSkills = panel.querySelector("[data-p-skills]");
        var pOpen = panel.querySelector("[data-p-open]");
        var pLink = panel.querySelector("[data-p-link]");

        function clamp(value) {
            var n = parseInt(value, 10);
            if (isNaN(n)) { return 0; }
            return Math.min(100, Math.max(0, n));
        }

        function showProgress(value) {
            ring.style.setProperty("--sk-value", value);
            percent.textContent = value;
        }

        function clearSelection() {
            all(".sk-node.is-selected, .sk-pnode.is-selected").forEach(function (el) {
                el.classList.remove("is-selected");
            });
        }

        function reveal() {
            emptyText.hidden = true;
            // On small screens the panel sits below the tree, so bring it into view
            if (window.matchMedia("(max-width: 960px)").matches) {
                panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
            }
        }

        function selectSkill(node) {
            clearSelection();
            node.classList.add("is-selected");

            var data = node.dataset;
            var progress = clamp(data.progress);

            nameOut.textContent = data.name;
            categoryOut.textContent = data.category;
            statusOut.textContent = data.statusLabel;
            statusOut.className = "skill-status skill-status--" + data.status;
            ring.className = "sk-ring sk-ring--lg" + (data.status === "completed" ? " sk-ring--completed" : "");

            showProgress(progress);
            assessForm.action = data.assessUrl;
            editLink.href = data.editUrl;
            childLink.href = data.childUrl;

            projectBody.hidden = true;
            skillBody.hidden = false;
            reveal();
        }

        function selectProject(node) {
            clearSelection();
            node.classList.add("is-selected");

            var data = node.dataset;
            pName.textContent = data.name;
            pDate.textContent = data.date ? "Completed " + data.date : "No completion date";
            pDescription.textContent = data.description;
            pSkills.textContent = data.skills || "None linked";

            if (data.image) {
                pImage.src = data.image;
                pImage.alt = "Screenshot of " + data.name;
                pImage.hidden = false;
            } else {
                pImage.removeAttribute("src");
                pImage.hidden = true;
            }

            pTech.textContent = "";
            (data.tech ? data.tech.split(", ") : []).forEach(function (name) {
                var chip = document.createElement("span");
                chip.className = "skill-tag";
                chip.textContent = name;
                pTech.appendChild(chip);
            });
            if (!pTech.firstChild) { pTech.textContent = "None added"; }

            pOpen.href = data.detailUrl;
            if (data.link) {
                pLink.href = data.link;
                pLink.hidden = false;
            } else {
                pLink.hidden = true;
            }

            skillBody.hidden = true;
            projectBody.hidden = false;
            reveal();
        }

        // Plain click selects. Ctrl/Cmd/Shift click still opens the page normally.
        page.addEventListener("click", function (event) {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) { return; }
            var skillNode = event.target.closest("a[data-node]");
            if (skillNode) {
                event.preventDefault();
                selectSkill(skillNode);
                return;
            }
            var projectNode = event.target.closest("a[data-pnode]");
            if (projectNode) {
                event.preventDefault();
                selectProject(projectNode);
            }
        });

    }

})();