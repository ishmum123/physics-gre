// Lesson view: discovery-path sections, inline checkpoints after
// "discovery", mark-read on reaching the end, prev/next across the whole
// curriculum.
window.APP = window.APP || {};
window.APP.views = window.APP.views || {};

(function () {
  const esc = (s) => window.APP.render.escapeHtml(s);

  function flattenLessons() {
    const out = [];
    window.APP.data.modules.forEach((m) => {
      (m.lessons || []).forEach((l) => out.push({ lesson: l, module: m }));
    });
    return out;
  }

  function renderCheckpoint(cp, idx, lessonId) {
    const wrap = document.createElement("div");
    wrap.className = "checkpoint";
    wrap.innerHTML =
      '<p class="checkpoint-label">checkpoint ' + (idx + 1) + "</p>" +
      '<div class="checkpoint-q md"></div>' +
      '<ul class="option-list"></ul>' +
      '<div class="explain md" hidden></div>';
    window.APP.render.mdInto(wrap.querySelector(".checkpoint-q"), cp.q);
    const list = wrap.querySelector(".option-list");
    const options = Array.isArray(cp.options) ? cp.options : [];
    // Shuffle display order, deterministic per lesson+checkpoint so it's
    // stable if this checkpoint is ever re-rendered within the same view.
    // `buttons` stays indexed by the ORIGINAL option index so grading
    // logic (choose/cp.answer) is unaffected by display order.
    const order = window.APP.components.seededShuffleIndices(options.length, lessonId + ":cp" + idx);
    const buttons = new Array(options.length);
    order.forEach((origIdx, displayPos) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-btn";
      btn.innerHTML = '<span class="opt-key mono">' + String.fromCharCode(65 + displayPos) + "</span><span></span>";
      window.APP.render.mdInlineInto(btn.querySelector("span:last-child"), options[origIdx]);
      btn.addEventListener("click", () => choose(origIdx));
      li.appendChild(btn);
      list.appendChild(li);
      buttons[origIdx] = btn;
    });

    function choose(i) {
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === cp.answer) b.classList.add(j === i ? "correct" : "correct-unchosen");
        else if (j === i) b.classList.add("wrong");
      });
      const explainEl = wrap.querySelector(".explain");
      explainEl.hidden = false;
      window.APP.render.mdInto(explainEl, cp.explain);
    }

    return wrap;
  }

  window.APP.views.lesson = function (root, params) {
    const entry = window.APP.data.lessonsById[params.id];
    if (!entry) {
      root.innerHTML = '<p>Unknown lesson. <a href="#/">Back to the curriculum map</a>.</p>';
      return;
    }
    const { lesson, module } = entry;

    root.innerHTML =
      '<p class="breadcrumb"><a href="#/">curriculum</a> / <a href="#/module/' + esc(module.id) + '">' +
      esc(module.title) + '</a></p>' +
      "<h1>" + esc(lesson.title) + "</h1>" +
      '<p class="lesson-meta">' + (lesson.minutes ? lesson.minutes + " min read" : "") + "</p>" +
      '<div class="lesson-body"></div>' +
      '<div class="lesson-sentinel" style="height:1px"></div>' +
      '<nav class="lesson-nav"></nav>';

    const body = root.querySelector(".lesson-body");
    const sections = Array.isArray(lesson.sections) ? lesson.sections : [];
    sections.forEach((sec) => {
      const secEl = document.createElement("section");
      secEl.className = "lesson-section";
      secEl.dataset.kind = sec.kind || "";
      const labelEl = document.createElement("p");
      labelEl.className = "section-kind mono";
      labelEl.textContent = sec.kind || "";
      secEl.appendChild(labelEl);
      const mdEl = document.createElement("div");
      mdEl.className = "md";
      secEl.appendChild(mdEl);
      if (sec.svg) {
        const svgWrap = document.createElement("div");
        svgWrap.className = "lesson-svg";
        secEl.appendChild(svgWrap);
        window.APP.render.svgInto(svgWrap, sec.svg);
      }
      body.appendChild(secEl);
      window.APP.render.mdInto(mdEl, sec.md);

      if (sec.kind === "discovery" && Array.isArray(lesson.checkpoints) && lesson.checkpoints.length) {
        const cpWrap = document.createElement("div");
        cpWrap.className = "checkpoints";
        lesson.checkpoints.forEach((cp, i) => cpWrap.appendChild(renderCheckpoint(cp, i, lesson.id)));
        body.appendChild(cpWrap);
      }
    });

    // Prev/next across the whole curriculum, in module-order then lesson-order.
    const flat = flattenLessons();
    const idx = flat.findIndex((x) => x.lesson.id === lesson.id);
    const prev = idx > 0 ? flat[idx - 1] : null;
    const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
    const nav = root.querySelector(".lesson-nav");
    nav.innerHTML =
      (prev ? '<a href="#/lesson/' + esc(prev.lesson.id) + '">&larr; ' + esc(prev.lesson.title) + "</a>" : '<span class="nav-empty">&larr; start</span>') +
      (next ? '<a href="#/lesson/' + esc(next.lesson.id) + '">' + esc(next.lesson.title) + " &rarr;</a>" : '<span class="nav-empty">end &rarr;</span>');

    // Titles/breadcrumb/nav are built with escaped plain text above, which
    // can still contain literal "$...$" maths — run KaTeX over the whole
    // view once now (idempotent: harmless to re-run over the section
    // bodies, which mdInto already enhanced individually).
    window.APP.render.enhanceMath(root);

    // Mark read once the reader both reaches the sentinel at the end AND
    // either scrolled or spent >=3s on the page — so a lesson shorter than
    // the viewport (sentinel visible immediately on arrival) doesn't get
    // marked read before it's actually been read.
    const sentinel = root.querySelector(".lesson-sentinel");
    const mountedAt = Date.now();
    let userScrolled = false;
    let sentinelVisible = false;
    let done = false;
    let io = null;
    let timeoutId = null;

    function tryMark() {
      if (done) return;
      if (sentinelVisible && (userScrolled || Date.now() - mountedAt >= 3000)) {
        done = true;
        window.APP.progress.markLessonRead(lesson.id);
        if (io) io.disconnect();
      }
    }
    function onScroll() {
      userScrolled = true;
      tryMark();
    }

    if ("IntersectionObserver" in window && sentinel) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { sentinelVisible = e.isIntersecting; });
        tryMark();
      }, { threshold: 0.01 });
      io.observe(sentinel);
    } else {
      // No IntersectionObserver support: fall back to a time-only gate.
      sentinelVisible = true;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    timeoutId = setTimeout(tryMark, 3000);

    window.APP.router.onTeardown(() => {
      if (io) io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (timeoutId) clearTimeout(timeoutId);
    });
  };
})();
