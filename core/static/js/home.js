
(() => {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const NS = 'http://www.w3.org/2000/svg';

    const el = (t, a = {}, p) => {
        const e = document.createElementNS(NS, t);

        for (const k in a) {
            e.setAttribute(k, a[k]);
        }

        p && p.appendChild(e);
        return e;
    };

    const toast = m => {
        const t = $('#toast');
        t.textContent = m;
        t.classList.add('show');
        clearTimeout(t._h);
        t._h = setTimeout(() => t.classList.remove('show'), 2200);
    };

    /* Full-width layout is handled by CSS.
       No JavaScript width manipulation is needed. */


    /* =========================================
       HERO ARC
    ========================================= */

    const S = [
        {
            n: 'Academic',
            href: $('#stage').dataset.academic,
            t: 'Manage Your Semester',
            d: 'Organize courses, manage routines, track attendance, and monitor semester progress.',
            c: 'Explore Academic',
            k: [
                ['Courses', 'Add every course and keep each semester organized.'],
                ['Attendance', 'Record attendance for each class.'],
                ['Progress', 'Follow your CGPA and academic performance.']
            ]
        },
        {
            n: 'Visual Lab',
            href: $('#stage').dataset.visual,
            t: 'Visualize Your Algorithms',
            d: 'Understand computer science concepts through interactive algorithm visualizations.',
            c: 'Explore Visual Lab',
            k: [
                ['Graph Algorithms', 'BFS, DFS, Dijkstra, Bellman-Ford and A*.'],
                ['Searching & Sorting', 'See how classic methods find and order data.'],
                ['Step-by-Step Execution', 'Pause and step through every operation.']
            ]
        },
        {
            n: 'Skill',
            href: $('#stage').dataset.skill,
            t: 'Build Your Skills',
            d: 'Improve programming, problem-solving, and technical skills through practical activities.',
            c: 'Explore Skill',
            k: [
                ['Programming', 'Track the languages and frameworks you learn.'],
                ['Problem Solving', 'Practice and record your progress.'],
                ['Skill Tracking', 'Link projects to skills and watch levels grow.']
            ]
        }
    ];

    const stage = $('#stage');
    const orbit = $('#orbit');
    const items = $('#items');
    const ttl = $('#ttl');
    const desc = $('#desc');
    const kws = $('#kws');
    const cta = $('#cta');
    const detail = $('.detail');
    const mob = matchMedia('(max-width:700px)');

    let active = 0;
    let rot = 0;
    let hover = false;
    let W = 0;
    let H = 0;
    let R = 0;
    let cx = 0;
    let cy = 0;
    let animating = false;
    let ready = false;
    let drawn = false;
    let drawId = 0;
    let arcs = [];

    const ease = k =>
        k < 0.5
            ? 4 * k * k * k
            : 1 - Math.pow(-2 * k + 2, 3) / 2;

    items.inert = detail.inert = true;

    const btns = S.map((s, i) => {
        const b = document.createElement('button');

        b.className = 'item';
        b.type = 'button';

        b.innerHTML = `
            <span class="il">${s.t}</span>
            <span class="im">${s.n}</span>
        `;

        b.setAttribute('aria-label', `${s.t} – ${s.n}`);
        b.onclick = () => go(i);

        items.appendChild(b);
        return b;
    });


    function draw() {
        W = stage.clientWidth;
        H = stage.clientHeight;

        cx = W / 2;
        cy = H * (mob.matches ? 0.82 : 0.95);
        R = Math.min(W * 0.44, H * (mob.matches ? 0.55 : 0.86));

        orbit.setAttribute('viewBox', `0 0 ${W} ${H}`);
        orbit.innerHTML = '';

        const defs = el('defs', {}, orbit);
        const g = el('linearGradient', { id: 'og' }, defs);

        const id = ++drawId;
        const instant = drawn || reduce;

        el('stop', { 'stop-color': '#43D9CE' }, g);
        el('stop', { offset: '.5', 'stop-color': '#648CFF' }, g);
        el('stop', { offset: '1', 'stop-color': '#8B6CFF' }, g);

        arcs = [];

        [[R, 3, 1], [R * 0.8, 1, 0.4], [R * 1.12, 1, 0.3]]
            .forEach(([r, w, o], k) => {

                const d = `M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}`;

                arcs.push(d);

                const p = el('path', {
                    d,
                    fill: 'none',
                    class: k ? 'arc2' : 'arc1',
                    stroke: k ? 'rgba(154,169,194,.6)' : 'url(#og)',
                    'stroke-width': w,
                    'stroke-linecap': k ? 'butt' : 'round',
                    opacity: o,
                    'stroke-dasharray': k ? '3 8' : 'none'
                }, orbit);

                if (k || instant) return;

                const L = p.getTotalLength();

                const h = el('circle', {
                    r: 4.5,
                    fill: '#fff',
                    style: 'filter:drop-shadow(0 0 8px #43D9CE)'
                }, orbit);

                const t0 = performance.now();

                p.style.strokeDasharray = L;
                p.style.strokeDashoffset = L;

                const f = t => {
                    if (id !== drawId) return;

                    const u = Math.min(1, (t - t0) / 2200);
                    const e = ease(u);
                    const pt = p.getPointAtLength(L * e);

                    p.style.strokeDashoffset = L * (1 - e);

                    h.setAttribute('cx', pt.x);
                    h.setAttribute('cy', pt.y);

                    u < 1
                        ? requestAnimationFrame(f)
                        : (h.remove(), reveal());
                };

                requestAnimationFrame(f);
            });

        if (mob.matches) {
            detail.style.cssText = '';
        } else {
            const h = R * 0.8 - 30;

            detail.style.top = (cy - h) + 'px';

            detail.style.width =
                Math.min(460, Math.sqrt(R * R - h * h) * 1.8) + 'px';
        }

        place();

        if (instant) {
            ready ? decor() : reveal();
        }
    }


    function reveal() {
        drawn = ready = true;

        stage.classList.add('ready');

        items.inert = detail.inert = false;

        decor();
    }


    function decor() {
        if (reduce) return;

        arcs.forEach((d, k) => {
            for (let j = 0; j < (k ? 2 : 3); j++) {

                const c = el('circle', {
                    class: 'odot',
                    r: k ? 1.8 : 2.8,
                    fill: k === 1 ? '#8B6CFF' : '#43D9CE'
                }, orbit);

                el('animateMotion', {
                    dur: (k ? 26 : 18) + j * 4 + 's',
                    repeatCount: 'indefinite',
                    path: d,
                    begin: '-' + j * 7 + 's',
                    keyPoints: k === 1 ? '1;0' : '0;1',
                    keyTimes: '0;1',
                    calcMode: 'linear'
                }, c);
            }
        });
    }


    function place() {
        btns.forEach((b, i) => {

            let o = ((i - rot) % 3 + 4.5) % 3 - 1.5;

            const RL = R * 0.8;
            const th = (90 - o * 58) * Math.PI / 180;

            const x = cx + RL * Math.cos(th);
            const y = cy - RL * Math.sin(th);

            const f = Math.max(0, 1 - Math.abs(o));

            const sc = 0.62 + 0.5 * f +
                (f > 0.5 ? 0.25 * (f - 0.5) * 2 : 0);

            b.style.left = x + 'px';
            b.style.top = y + 'px';

            b.style.transform =
                `translate(-50%,-50%) scale(${sc})`;

            b.style.opacity =
                Math.max(0, Math.min(1, 1.7 - Math.abs(o) * 1.05)) *
                (0.4 + 0.6 * f);

            b.style.color = f > 0.6 ? '#F1F5FF' : '#9AA9C2';

            b.style.pointerEvents =
                Math.abs(o) > 1.1 ? 'none' : 'auto';

            b.classList.toggle('on', f > 0.6);

            b.setAttribute('aria-pressed', i === active);
        });
    }


    function fill(i) {
        const s = S[i];

        ttl.textContent = s.t;
        desc.textContent = s.d;
        cta.textContent = s.c;
        cta.href = s.href;

        kws.replaceChildren(
            ...s.k.map(([n, tip]) => {

                const b = document.createElement('button');

                b.type = 'button';
                b.className = 'kw';
                b.textContent = n;
                b.dataset.tip = tip;

                b.setAttribute('aria-label', `${n}: ${tip}`);

                b.onclick = () => {
                    const on = b.classList.contains('show');

                    $$('.kw.show', kws).forEach(x =>
                        x.classList.remove('show')
                    );

                    if (!on) b.classList.add('show');
                };

                return b;
            })
        );
    }


    function setContent(i) {
        const rv = $$('.rv', detail);

        rv.forEach(e => e.classList.add('swap'));

        setTimeout(() => {
            fill(i);
            rv.forEach(e => e.classList.remove('swap'));
        }, reduce ? 0 : 300);
    }


    function go(i) {
        if (animating && i === active) return;

        let diff = ((i - active) % 3 + 4.5) % 3 - 1.5;

        diff = Math.round(diff);

        active = i;

        setContent(i);

        const from = rot;
        const to = Math.round(rot) + diff;
        const t0 = performance.now();
        const dur = reduce ? 1 : 1000;

        animating = true;

        const step = t => {
            const k = Math.min(1, (t - t0) / dur);
            const e = ease(k);

            rot = from + (to - from) * e;

            place();

            if (k < 1) {
                requestAnimationFrame(step);
            } else {
                animating = false;
                rot = ((to % 3) + 3) % 3;
            }
        };

        requestAnimationFrame(step);
    }


    [stage, detail].forEach(e => {
        e.addEventListener('mouseenter', () => hover = true);
        e.addEventListener('mouseleave', () => hover = false);
    });

    stage.addEventListener('focusin', () => hover = true);
    stage.addEventListener('focusout', () => hover = false);

    if (!reduce) {
        setInterval(() => {
            if (ready && !hover && !animating && !document.hidden) {
                go((active + 1) % 3);
            }
        }, 4800);
    }

    addEventListener('resize', draw);

    rot = 0;
    fill(0);
    draw();


    /* =========================================
       WHY THINKSPHERE — SCROLL STORY
       Fixed order: Algorithms -> Skills -> Academic -> Visual Learning.
       Only one pass. No repeated questions.
    ========================================= */

    const Q = [
        {
            q: 'Why does academic management matter?',
            s: 'Plan the semester, not just the day.',
            p: 'Students juggle courses, schedules and deadlines at once. Keeping course information, class routines and progress in one organized place reduces guesswork and makes study time easier to plan.',
            b: [
                'Clear overview of courses and weekly routine',
                'Attendance and progress visible at a glance',
                'Less time searching, more time studying'
            ],
            r: [
                'Academic planning and student performance',
                'Time management in higher education'
            ]
        },
        {
            q: 'Why is visual learning important?',
            s: 'See the idea, then understand it.',
            p: 'Visual representations show relationships that text leaves implicit. They support conceptual understanding, reduce the effort of processing complex information, and give abstract ideas a concrete form.',
            b: [
                'Conceptual understanding of abstract ideas',
                'Lower cognitive load while processing',
                'Learning through visual representations'
            ],
            r: [
                'Visual representations and learning',
                'Cognitive processing of multimedia content'
            ]
        },
        {
            q: 'Why should we visualize algorithms?',
            s: 'Watch the steps instead of memorizing them.',
            p: 'Stepping through an algorithm shows how it executes, how data structures change, and why some approaches cost more time and space than others.',
            b: [
                'See execution one step at a time',
                'Watch data structures change',
                'Compare time and space complexity'
            ],
            r: [
                'Algorithm visualization effectiveness',
                'Computer science education research'
            ]
        },
        {
            q: 'Why should students track their skills?',
            s: 'Progress you can see is progress you can steer.',
            p: 'Tracking supports continuous development: students assess where they stand, set goals and grow technical competency. Linking projects to skills turns project-based learning into visible evidence.',
            b: [
                'Honest self-assessment',
                'Clear, achievable goals',
                'Projects tied to the skills they build'
            ],
            r: [
                'Self-assessment and skill development',
                'Project-based learning outcomes'
            ]
        }
    ];

    const steps = $('#steps');
    const info = $('#info');
    const prog = $('#prog');
    const grid = $('.why-grid');

    const TABS = ['Why it matters', 'Key benefits', 'Research'];

    // One fixed sequence only.
    // Q keeps its original data order; STORY_ORDER controls the visible order.
    const STORY_ORDER = [2, 3, 0, 1];
    const STORY_STEPS = STORY_ORDER;

    let currentStep = 0;
    let currentQuestion = -1;
    let currentTab = 0;
    let paintTimer = 0;
    let showTimer = 0;
    let scrollFrame = 0;
    let lastProgress = -1;

    const questionButtons = Q.map((question, questionIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tq';
        button.setAttribute('aria-label', question.q);
        button.innerHTML = `
            <i class="dot" aria-hidden="true"></i>
            <span class="qt">
                <strong>${question.q}</strong>
                <small>${question.s}</small>
            </span>
        `;

        button.addEventListener('click', () => {
            const position = STORY_ORDER.indexOf(questionIndex);
            if (position < 0) return;

            if (window.matchMedia('(max-width: 860px)').matches) {
                setStoryStep(position);
            } else {
                scrollToQuestion(questionIndex);
            }
        });

        return button;
    });

    function renderTimeline(stepIndex) {
        // Reorder the four existing buttons into the requested pattern.
        STORY_ORDER.forEach(questionIndex => {
            steps.appendChild(questionButtons[questionIndex]);
        });

        const activeQuestion = STORY_STEPS[stepIndex];
        const activePosition = STORY_ORDER.indexOf(activeQuestion);

        questionButtons.forEach((button, questionIndex) => {
            const position = STORY_ORDER.indexOf(questionIndex);
            const isActive = questionIndex === activeQuestion;

            button.classList.toggle('on', isActive);
            button.classList.toggle('done', position < activePosition);
            button.setAttribute('aria-current', isActive ? 'step' : 'false');
        });

        requestAnimationFrame(() => {
            const activeButton = questionButtons[activeQuestion];
            if (!activeButton || !prog) return;

            const line = prog.parentElement;
            const lineRect = line.getBoundingClientRect();
            const buttonRect = activeButton.getBoundingClientRect();

            const progressHeight = Math.max(
                0,
                Math.min(
                    lineRect.height,
                    buttonRect.top + buttonRect.height / 2 - lineRect.top
                )
            );

            prog.style.height = `${progressHeight}px`;
        });
    }

    function renderQuestionBody(question, tabIndex) {
        if (tabIndex === 0) {
            return `<p>${question.p}</p>`;
        }

        if (tabIndex === 1) {
            return `<ul>${question.b.map(item => `<li>${item}</li>`).join('')}</ul>`;
        }

        return `<div class="refs">${question.r.map(reference => `
            <div class="ref">
                <span>
                    ${reference}<br>
                    <small>[Research paper to be added]</small>
                </span>
                <button type="button" data-placeholder>Read Research</button>
            </div>
        `).join('')}</div>`;
    }

    function paintQuestionContent() {
        const question = Q[currentQuestion];
        if (!question || !info) return;

        const panelBody = $('.panel-body', info);
        if (!panelBody) return;

        panelBody.classList.add('out');

        window.clearTimeout(paintTimer);
        paintTimer = window.setTimeout(() => {
            panelBody.innerHTML = `
                <h3>${question.q}</h3>
                ${renderQuestionBody(question, currentTab)}
            `;

            $$('[data-placeholder]', panelBody).forEach(button => {
                button.addEventListener('click', () => {
                    toast('Research link not added yet. Verified sources will go here.');
                });
            });

            panelBody.classList.remove('out');
        }, reduce ? 0 : 180);
    }

    function renderCard(questionIndex) {
        currentQuestion = questionIndex;
        currentTab = 0;

        const question = Q[questionIndex];
        if (!question) return;

        info.classList.add('out');
        window.clearTimeout(showTimer);

        showTimer = window.setTimeout(() => {
            info.innerHTML = `
                <div class="tabs" role="tablist" aria-label="Question details">
                    ${TABS.map((label, index) => `
                        <button type="button"
                                class="tab${index === 0 ? ' on' : ''}"
                                data-k="${index}"
                                role="tab"
                                aria-selected="${index === 0}">
                            ${label}
                        </button>
                    `).join('')}
                </div>
                <div class="panel">
                    <div class="panel-body"></div>
                </div>
            `;

            $$('.tab', info).forEach(button => {
                button.addEventListener('click', () => {
                    currentTab = Number(button.dataset.k);

                    $$('.tab', info).forEach((tabButton, index) => {
                        const selected = index === currentTab;
                        tabButton.classList.toggle('on', selected);
                        tabButton.setAttribute('aria-selected', String(selected));
                    });

                    paintQuestionContent();
                });
            });

            info.classList.remove('out');
            paintQuestionContent();
        }, reduce ? 0 : 220);
    }

    function setStoryStep(stepIndex) {
        const safeStep = Math.max(
            0,
            Math.min(STORY_STEPS.length - 1, stepIndex)
        );

        if (safeStep === currentStep && currentQuestion >= 0) return;

        currentStep = safeStep;
        const questionIndex = STORY_STEPS[safeStep];

        renderTimeline(safeStep);

        if (questionIndex !== currentQuestion) {
            renderCard(questionIndex);
        }
    }

    function getStoryProgress() {
        if (!grid) return 0;

        const rect = grid.getBoundingClientRect();
        const scrollDistance = Math.max(
            1,
            grid.offsetHeight - window.innerHeight
        );

        const passed = Math.max(
            0,
            Math.min(scrollDistance, -rect.top)
        );

        return passed / scrollDistance;
    }

    function updateStoryFromScroll() {
        scrollFrame = 0;

        if (!grid || !questionButtons.length) return;
        if (window.matchMedia('(max-width: 860px)').matches) return;

        const progressValue = getStoryProgress();

        if (Math.abs(progressValue - lastProgress) < 0.001) return;
        lastProgress = progressValue;

        const stepIndex = Math.min(
            STORY_STEPS.length - 1,
            Math.floor(progressValue * STORY_STEPS.length)
        );

        setStoryStep(stepIndex);
    }

    function requestStoryUpdate() {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(updateStoryFromScroll);
    }

    function scrollToQuestion(questionIndex) {
        const position = STORY_ORDER.indexOf(questionIndex);
        if (position < 0 || !grid) return;

        if (window.matchMedia('(max-width: 860px)').matches) {
            setStoryStep(position);
            return;
        }

        const rect = grid.getBoundingClientRect();
        const distance = Math.max(
            1,
            grid.offsetHeight - window.innerHeight
        );

        const targetProgress = (position + 0.5) / STORY_STEPS.length;
        const targetY = window.scrollY + rect.top + distance * targetProgress;

        window.scrollTo({
            top: Math.max(0, targetY),
            behavior: reduce ? 'auto' : 'smooth'
        });
    }

    // Desktop: the page scroll changes the active question.
    // Mobile: questions remain directly selectable.
    questionButtons.forEach(button => {
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                button.click();
            }
        });
    });

    window.addEventListener('scroll', requestStoryUpdate, { passive: true });

    window.addEventListener('resize', () => {
        lastProgress = -1;
        requestStoryUpdate();
    });

    setStoryStep(0);
    requestStoryUpdate();


    /* =========================================
       SVG NETWORK — ACADEMIC + ALGORITHM TREES
    ========================================= */

    const ICON = {
        layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
        book: 'M6 3h12v15H6zM6 18h12v3H6',
        chart: 'M4 20V11M10 20V4M16 20v-7M2 20h20',

        bfs: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M12 12m-9.5 0a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0-19 0',

        dfs: 'M8 4l2 5-2 4 4 3-1 5',

        dij: 'M12 4 4 18h16zM12 4m-1.5 0a1.5 1.5 0 1 0 3 0M4 18m-1.5 0a1.5 1.5 0 1 0 3 0M20 18m-1.5 0a1.5 1.5 0 1 0 3 0',

        bf: 'M20 12a8 8 0 0 0-14-5M4 4v4h4M4 12a8 8 0 0 0 14 5M20 20v-4h-4',

        astar: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 3v4M12 17v4M3 12h4M17 12h4',

        mm: 'M12 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 0 0-4 0M18 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M11 7 7 17M13 7l4 10'
    };


    Object.assign(ICON, {
        clock: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 0 0-18 0M12 7v5l3 2',
        clip: 'M8 4h8v3H8zM6 6h12v15H6zM9 12h6M9 16h6',
        check: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 0 0-18 0M8 12l3 3 5-6',
        sun: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M5 19l2-2',
        cal: 'M4 6h16v14H4zM4 11h16M8 3v4M16 3v4',
        award: 'M12 9m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M8.5 13.5 7 22l5-3 5 3-1.5-8.5'
    });


    function net(svg, nodes) {
        const by = Object.fromEntries(
            nodes.map(n => [n.id, n])
        );

        const eg = el('g', {}, svg);
        const ng = el('g', {}, svg);

        const E = {};
        const N = {};

        const hint = svg.closest('.viz').querySelector('[data-hint]');

        nodes.forEach(n => {
            if (!n.par) return;

            const p = by[n.par];

            let sx, sy;

            if (n.ax != null) {
                sx = n.ax;
                sy = n.ay;
            } else {
                sx = p.x;
                sy = p.y + (n.y > p.y ? p.r : -p.r);
            }

            const ex = n.x;
            const ey = n.y + (n.y > sy ? -n.r : n.r);
            const m = (sy + ey) / 2;

            E[n.par + n.id] = el('path', {
                class: 'e ' + (n.c || ''),
                style: n.col ? `--col:${n.col}` : '',
                d: n.side
                    ? `M${sx} ${sy}C${sx + (ex - sx) * 0.5} ${sy + (ey - sy) * 0.12},${ex} ${ey + (sy - ey) * 0.45},${ex} ${ey}`
                    : `M${sx} ${sy}C${sx} ${m},${ex} ${m},${ex} ${ey}`
            }, eg);
        });


        let sel = null;

        const text = n => `<b>${n.n}</b> — ${n.i}`;


        nodes.forEach(n => {
            if (n.kind === 'line') return;

            const g = el('g', {
                class: 'n ' + (n.c || ''),
                style: n.col ? `--col:${n.col}` : '',
                tabindex: 0,
                role: 'button',
                'aria-label': n.n
            }, ng);

            N[n.id] = g;

            if (n.kind === 'pill') {
                const w = n.n.length * 8.4 + 44;

                el('rect', {
                    x: n.x - w / 2,
                    y: n.y - n.r,
                    width: w,
                    height: n.r * 2,
                    rx: n.r
                }, g);

                el('text', {
                    class: 'pt',
                    x: n.x,
                    y: n.y + 4.5
                }, g).textContent = n.n;

            } else {
                el('circle', {
                    cx: n.x,
                    cy: n.y,
                    r: n.r
                }, g);

                const s = n.r / 24 * 0.95;

                if (n.ic) {
                    el('path', {
                        class: 'ic',
                        d: ICON[n.ic],
                        transform: `translate(${n.x - 12 * s} ${n.y - 12 * s}) scale(${s})`
                    }, g);
                }

                const L = n.lab || 'b';

                const t = el('text', {
                    class: 'lt',
                    x: L === 'r' ? n.x + n.r + 10 : n.x,
                    y: L === 't'
                        ? n.y - n.r - 10
                        : L === 'r'
                            ? n.y + 4.5
                            : n.y + n.r + 20,
                    'text-anchor': L === 'r' ? 'start' : 'middle'
                }, g);

                t.textContent = n.n;
            }

            const sh = () => hint.innerHTML = text(n);

            const back = () =>
                hint.innerHTML = sel
                    ? text(by[sel])
                    : 'Hover or click a node.';

            g.onmouseenter = sh;
            g.onfocus = sh;
            g.onmouseleave = back;
            g.onblur = back;

            const pick = () => {
                sel = sel === n.id ? null : n.id;
                hl(sel);
                back();
            };

            g.onclick = pick;

            g.onkeydown = e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick();
                }
            };
        });


        function hl(id) {
            Object.values(E).forEach(e =>
                e.classList.remove('hl')
            );

            Object.values(N).forEach(g =>
                g.classList.remove('sel', 'dim')
            );

            const main = svg.querySelector('.mainline');

            if (main) main.classList.remove('hl');

            if (!id) return;

            const keep = new Set([id]);

            nodes.forEach(n => {
                if (n.par === id) {
                    keep.add(n.id);
                    E[id + n.id].classList.add('hl');
                }
            });

            let c = by[id];

            while (c.par) {
                keep.add(c.par);

                if (E[c.par + c.id]) {
                    E[c.par + c.id].classList.add('hl');
                }

                c = by[c.par];
            }

            if (keep.has('r') && by.r.kind === 'line' && main) {
                main.classList.add('hl');
            }

            Object.entries(N).forEach(([k, g]) => {
                g.classList.add(keep.has(k) ? 'x' : 'dim');
            });

            N[id].classList.add('sel');
        }

        return { eg, ng };
    }


    /* =========================================
       ACADEMIC TREE
    ========================================= */

    (() => {
        const svg = $('#v-academic');

        svg.setAttribute('viewBox', '100 200 1620 740');

        const defs = el('defs', {}, svg);

        const lg = el('linearGradient', {
            id: 'mlg',
            x1: 0,
            x2: 1,
            y1: 0,
            y2: 0
        }, defs);

        el('stop', {
            offset: 0,
            'stop-color': '#6FEFFF'
        }, lg);

        el('stop', {
            offset: 1,
            'stop-color': '#C9B6FF'
        }, lg);

        const path = el('path', {
            class: 'mainline',
            d: 'M140 582C330 575 520 560 700 538S900 530 1020 545S1250 570 1380 577S1520 575 1582 565'
        }, svg);

        const L = path.getTotalLength();

        const at = x => {
            let lo = 0;
            let hi = L;

            for (let k = 0; k < 30; k++) {
                const m = (lo + hi) / 2;

                path.getPointAtLength(m).x < x
                    ? lo = m
                    : hi = m;
            }

            const p = path.getPointAtLength(lo);

            return {
                ax: p.x,
                ay: p.y
            };
        };

        const D = [
            ['Add Semester', 'Create a semester to organize your courses.', 399, 323, 'layers', 'u', 228],
            ['Add Courses', 'Add the courses you take in each semester.', 507, 698, 'book', 'd', 385],
            ['Manage Routine', 'Set up your weekly class routine.', 748, 817, 'clock', 'd', 545],
            ['Track Assignments', 'Keep your assignments in one list.', 805, 438, 'clip', 'u', 705],
            ['Record Attendance', 'Record attendance for each class.', 1054, 315, 'check', 'u', 862],
            ['Manage Holidays', 'Mark holidays so your schedule stays accurate.', 1177, 752, 'sun', 'd', 1020],
            ['View Timeline', 'See your academic activity on a timeline.', 1322, 392, 'cal', 'u', 1183],
            ['Track CGPA', 'Follow your CGPA across semesters.', 1555, 830, 'award', 'd', 1340],
            ['Analyse Performance', 'Review your academic progress and performance.', 1620, 432, 'chart', 'u', 1510]
        ];

        const cols = [
            '#2fc7d8',
            '#33bfe0',
            '#3fa9ea',
            '#4f95f0',
            '#5a8cf5',
            '#6a88f5',
            '#7a86f5',
            '#8a80f2',
            '#9a7cf0'
        ];

        const nodes = [
            {
                id: 'r',
                kind: 'line',
                n: 'Academic',
                i: 'Everything in your studies, in one flow.'
            }
        ].concat(
            D.map((d, i) => ({
                id: 'n' + i,
                n: d[0],
                i: d[1],
                par: 'r',
                x: d[2],
                y: d[3],
                r: 36,
                ic: d[4],
                kind: 'circle',
                lab: d[5] === 'u' ? 't' : 'b',
                side: true,
                col: cols[i],
                ...at(d[6])
            }))
        );

        net(svg, nodes);
    })();


    /* =========================================
       ALGORITHM TREE
    ========================================= */

    (() => {
        const svg = $('#v-algo');

        svg.setAttribute('viewBox', '0 0 900 440');

        const leaf = (id, n, i, par, x, ic, c) => ({
            id,
            n,
            i,
            par,
            x,
            y: 330,
            r: 28,
            ic,
            kind: 'circle',
            c,
            lab: 'b'
        });

        const nodes = [
            {
                id: 'r',
                n: 'Visual Lab',
                i: 'Interactive algorithm demonstrations, grouped by family.',
                x: 450,
                y: 44,
                r: 21,
                kind: 'pill',
                c: 'cb'
            },
            {
                id: 'g1',
                n: 'Graph traversal',
                i: 'Ways to explore a graph.',
                par: 'r',
                x: 195,
                y: 170,
                r: 20,
                kind: 'pill',
                c: 'cb'
            },
            {
                id: 'g2',
                n: 'Shortest path',
                i: 'Finding least-cost paths.',
                par: 'r',
                x: 450,
                y: 170,
                r: 20,
                kind: 'pill',
                c: 'cy'
            },
            {
                id: 'g3',
                n: 'Game AI',
                i: 'Decision search.',
                par: 'r',
                x: 700,
                y: 170,
                r: 20,
                kind: 'pill',
                c: 'cv'
            },

            leaf('bfs', 'BFS', 'Explores a graph level by level.', 'g1', 140, 'bfs', 'cb'),
            leaf('dfs', 'DFS', 'Explores as deep as possible before backtracking.', 'g1', 250, 'dfs', 'cb'),
            leaf('dij', 'Dijkstra', 'Shortest paths with non-negative weights.', 'g2', 345, 'dij', 'cy'),
            leaf('bf', 'Bellman-Ford', 'Shortest paths that allow negative weights.', 'g2', 450, 'bf', 'cy'),
            leaf('as', 'A*', 'Heuristic-guided search.', 'g2', 555, 'astar', 'cy'),
            leaf('mm', 'Minimax', 'Decision search for two-player situations.', 'g3', 700, 'mm', 'cv')
        ];

        net(svg, nodes);
    })();


    /* =========================================
       BFS DEMO GRAPH
    ========================================= */

    (() => {
        const svg = $('#v-graph');

        const P = [
            [40, 60],
            [110, 25],
            [110, 95],
            [190, 25],
            [190, 95],
            [260, 60],
            [320, 60]
        ];

        const Ed = [
            [0, 1],
            [0, 2],
            [1, 3],
            [2, 4],
            [3, 5],
            [4, 5],
            [5, 6]
        ];

        const L = Ed.map(([a, b]) =>
            el('line', {
                class: 'ge',
                x1: P[a][0],
                y1: P[a][1],
                x2: P[b][0],
                y2: P[b][1]
            }, svg)
        );

        const G = P.map((p, i) => {
            const g = el('g', { class: 'gn' }, svg);

            el('circle', {
                cx: p[0],
                cy: p[1],
                r: 11
            }, g);

            el('text', {
                x: p[0],
                y: p[1] + 3.5
            }, g).textContent = i;

            return g;
        });

        let k = 0;

        const tick = () => {
            if (k > 7) {
                k = 0;

                G.forEach(g => g.setAttribute('class', 'gn'));
                L.forEach(l => l.classList.remove('on'));

                return;
            }

            G.forEach(g => g.classList.remove('cur'));

            if (k > 0) {
                const n = k - 1;

                G[n].classList.add('vis', 'cur');

                const e = Ed.findIndex(([a, b]) => b === n);

                if (e >= 0) {
                    L[e].classList.add('on');
                }
            }

            k++;
        };

        setInterval(tick, reduce ? 2500 : 850);

        tick();

        const lab = el('text', {
            x: 180,
            y: 116,
            fill: '#9AA9C2',
            'font-size': 10,
            'text-anchor': 'middle'
        }, svg);

        lab.textContent = 'BFS from node 0 (illustrative)';
    })();


    /* =========================================
       SKILL TREE
    ========================================= */

    (() => {
        const host = $('#v-skill');
        const hint = host.closest('.viz').querySelector('[data-hint]');

        const SK = [
            {
                n: 'Programming',
                cat: 'Core languages',
                v: 85,
                kids: [
                    { n: 'C++', cat: 'Programming', v: 70 },
                    { n: 'Python', cat: 'Programming', v: 100 }
                ]
            },
            {
                n: 'Web Development',
                cat: 'Web',
                v: 68,
                kids: [
                    { n: 'Django', cat: 'Web', v: 55 },
                    { n: 'JavaScript', cat: 'Web', v: 80 }
                ]
            },
            {
                n: 'Machine Learning',
                cat: 'Data and AI',
                v: 18,
                kids: [
                    { n: 'Scikit-learn', cat: 'Data and AI', v: 35 },
                    { n: 'Data Processing', cat: 'Data and AI', v: 0 }
                ]
            }
        ];

        const PR = {
            n: 'Student Portal (sample)',
            links: ['Python', 'Django', 'JavaScript']
        };

        const pill = n => `
            <button class="pill ${n.v >= 100 ? 'done' : n.v > 0 ? 'prog' : 'none'}"
                    data-n="${n.n}">
                <span class="ring" style="--p:${n.v}">
                    <b>${n.v ? n.v + '%' : '–'}</b>
                </span>
                <span class="pl">
                    <strong>${n.n}</strong>
                    <small>${n.cat}</small>
                </span>
            </button>
        `;

        host.innerHTML =
            SK.map(g => `
                <div class="grp">
                    <div class="rootcol">
                        ${pill(g)}
                        <button class="badge" aria-label="Toggle ${g.n} children">
                            ${g.kids.length}
                        </button>
                    </div>

                    <div class="kids">
                        ${g.kids.map(k => `
                            <div class="kid">${pill(k)}</div>
                        `).join('')}
                    </div>
                </div>
            `).join('') +

            `
                <div class="grp">
                    <div class="rootcol">
                        <button class="pill proj" data-n="${PR.n}">
                            <span class="pl">
                                <strong>${PR.n}</strong>
                                <small>Project · linked to ${PR.links.length} skills</small>
                            </span>
                        </button>
                    </div>
                </div>
            `;


        const pills = $$('.pill', host);
        const grps = $$('.grp', host);

        const all = {};

        SK.forEach(g => {
            all[g.n] = g;

            g.kids.forEach(k => {
                all[k.n] = k;
            });
        });

        let sel = null;

        const clear = () => {
            pills.forEach(p =>
                p.classList.remove('sel', 'dim', 'link')
            );

            grps.forEach(g =>
                g.classList.remove('hl')
            );
        };

        const txt = n => {
            const o = all[n];

            return o
                ? `<b>${n}</b> — ${o.cat}, illustrative level ${o.v}%`
                : `<b>${PR.n}</b> — sample project connected to ${PR.links.join(', ')}`;
        };


        pills.forEach(p => {
            const n = p.dataset.n;

            p.onmouseenter = p.onfocus = () => {
                hint.innerHTML = txt(n);
            };

            p.onmouseleave = p.onblur = () => {
                hint.innerHTML = sel
                    ? txt(sel)
                    : 'Hover or click a node.';
            };

            p.onclick = () => {
                clear();

                if (sel === n) {
                    sel = null;
                    hint.innerHTML = 'Hover or click a node.';
                    return;
                }

                sel = n;
                hint.innerHTML = txt(n);

                const keep = new Set([n]);

                if (n === PR.n) {
                    PR.links.forEach(l => keep.add(l));
                } else {
                    const g = SK.find(g =>
                        g.n === n || g.kids.some(k => k.n === n)
                    );

                    keep.add(g.n);

                    g.kids.forEach(k => keep.add(k.n));
                }

                pills.forEach(q => {
                    const k = q.dataset.n;

                    q.classList.toggle('dim', !keep.has(k));

                    if (keep.has(k) && k !== n) {
                        q.classList.add('link');
                    }
                });

                p.classList.add('sel');

                grps.forEach(g => {
                    if (
                        $$('.pill', g).some(q =>
                            keep.has(q.dataset.n) && q.dataset.n !== PR.n
                        )
                    ) {
                        g.classList.add('hl');
                    }
                });
            };
        });


        $$('.badge', host).forEach(b => {
            b.onclick = () => {
                const g = b.closest('.grp');

                g.classList.toggle('collapsed');

                b.textContent = g.classList.contains('collapsed')
                    ? '+'
                    : g.querySelectorAll('.kid').length;
            };
        });


        const setAll = c => {
            $$('.grp', host).forEach(g => {
                const b = $('.badge', g);

                if (b) {
                    g.classList.toggle('collapsed', c);

                    b.textContent = c
                        ? '+'
                        : g.querySelectorAll('.kid').length;
                }
            });
        };

        $('#expand').onclick = () => setAll(false);
        $('#collapse').onclick = () => setAll(true);

    })();

})();
