// Shared timed-exam engine (5-option MC, palette, mark-for-review, submit,
// review) used by both module tests (#/test/:moduleId) and the mock exam
// (#/mock). test.js/mock.js just build a question set and hand it here.
window.APP = window.APP || {};
window.APP.views = window.APP.views || {};

(function () {
  const esc = (s) => window.APP.render.escapeHtml(s);
  const C = () => window.APP.components;

  function secondsPerQuestion() {
    const cfg = window.APP.EXAM;
    return Math.round((cfg.totalMinutes * 60) / cfg.questionCount);
  }

  // opts: { questions, timeSeconds, title (raw, unescaped), breadcrumbHtml,
  // note, onFinish(result) }
  function runExam(root, opts) {
    const questions = opts.questions || [];
    if (!questions.length) {
      root.innerHTML = (opts.breadcrumbHtml || "") + "<h1>" + esc(opts.title) + "</h1>" +
        '<p class="empty-note">No test questions are available yet.</p>';
      return;
    }

    const answers = new Array(questions.length).fill(null); // chosen index or null
    const marked = new Array(questions.length).fill(false);
    let cur = 0;
    let submitted = false;

    // Per-question option order, shuffled once for this attempt and
    // cached — seeded by question id + attempt start so re-rendering the
    // same question (prev/next/palette) never reorders it mid-attempt.
    const attemptSeed = Date.now();
    const optionOrders = questions.map((q) =>
      C().seededShuffleIndices(Array.isArray(q.options) ? q.options.length : 0, q.id + ":" + attemptSeed)
    );

    // Deadline-based timer: survives background-tab throttling without
    // drift, since remaining time is always recomputed from wall-clock
    // time rather than decremented once per interval tick.
    const deadline = Date.now() + opts.timeSeconds * 1000;
    function computeRemaining() {
      return Math.max(0, Math.round((deadline - Date.now()) / 1000));
    }

    root.innerHTML =
      (opts.breadcrumbHtml || "") +
      "<h1>" + esc(opts.title) + "</h1>" +
      (opts.note ? '<p class="locked-note">' + esc(opts.note) + "</p>" : "") +
      '<div class="stage-head"><span id="exam-progress"></span><span class="stage-timer num" id="exam-timer"></span></div>' +
      '<div id="exam-palette" class="palette" role="group" aria-label="Question palette"></div>' +
      '<div id="exam-stage" class="question-stage"></div>';
    // Title/breadcrumb/note are escaped plain text that can still contain
    // literal "$...$" maths (e.g. a module title) — enhance once here; the
    // stage itself is enhanced per-question as it's built below.
    window.APP.render.enhanceMath(root);

    const stage = root.querySelector("#exam-stage");
    const paletteEl = root.querySelector("#exam-palette");
    const progressEl = root.querySelector("#exam-progress");
    const timerEl = root.querySelector("#exam-timer");

    function renderTimer(remaining) {
      timerEl.textContent = C().fmtTime(remaining);
      timerEl.className = "stage-timer num" + (remaining <= opts.timeSeconds * 0.1 ? " low" : "");
    }

    function tick() {
      if (submitted) { clearInterval(timerId); return; }
      const remaining = computeRemaining();
      renderTimer(remaining);
      if (remaining <= 0) finish();
    }
    const timerId = setInterval(tick, 1000);
    // Navigating away mid-exam must stop the timer immediately, before
    // it can fire again on a stale closure or (on revisit) stack a second
    // interval — and must never let a late tick call finish() and write a
    // bogus 0% result after the view is gone.
    window.APP.router.onTeardown(() => {
      submitted = true;
      clearInterval(timerId);
    });

    function renderPalette() {
      let html = "";
      questions.forEach((q, i) => {
        let cls = "palette-cell";
        if (i === cur) cls += " current";
        if (answers[i] !== null) cls += " answered";
        if (marked[i]) cls += " marked";
        if (submitted) cls += answers[i] === q.answer ? " review-correct" : " review-wrong";
        html += '<button type="button" class="' + cls + '" data-i="' + i + '">' + (i + 1) + "</button>";
      });
      paletteEl.innerHTML = html;
      paletteEl.querySelectorAll("[data-i]").forEach((btn) => {
        btn.addEventListener("click", () => { cur = parseInt(btn.dataset.i, 10); renderQuestion(); });
      });
    }

    // Only updates classes on the existing option buttons — no re-render,
    // so the clicked button keeps focus and the prompt/options aren't
    // rebuilt (and re-run through marked/KaTeX) on every click. `origIdx`
    // is the option's ORIGINAL (unshuffled) index — what gets stored and
    // graded.
    function selectOption(origIdx) {
      answers[cur] = origIdx;
      stage.querySelectorAll(".option-btn").forEach((btn) => {
        btn.classList.toggle("chosen", parseInt(btn.dataset.i, 10) === origIdx);
      });
      renderPalette();
    }

    function renderQuestion() {
      progressEl.textContent = "question " + (cur + 1) + "/" + questions.length;
      const q = questions[cur];
      const opts5 = Array.isArray(q.options) ? q.options : [];
      // Cached per-question shuffle order (seeded, stable for this whole
      // attempt) — re-rendering the same question via prev/next/palette
      // must not reorder its options.
      const order = optionOrders[cur];
      let optsHtml = '<ul class="option-list">';
      order.forEach((origIdx, displayPos) => {
        const chosen = answers[cur] === origIdx;
        optsHtml += '<li><button type="button" class="option-btn' + (chosen ? " chosen" : "") +
          '" data-i="' + origIdx + '"><span class="opt-key mono">' + String.fromCharCode(65 + displayPos) +
          "</span><span></span></button></li>";
      });
      optsHtml += "</ul>";
      stage.innerHTML =
        '<div class="prompt md"></div>' + optsHtml +
        '<div class="btn-row">' +
        '<button type="button" class="btn" id="mark-btn">' + (marked[cur] ? "unmark for review" : "mark for review") + "</button>" +
        '<button type="button" class="btn" id="prev-btn"' + (cur === 0 ? " disabled" : "") + '>previous</button>' +
        '<button type="button" class="btn" id="next-btn"' + (cur === questions.length - 1 ? " disabled" : "") + '>next</button>' +
        '<button type="button" class="btn btn-primary" id="submit-btn">submit exam</button>' +
        "</div>";
      window.APP.render.mdInto(stage.querySelector(".prompt"), q.prompt);
      stage.querySelectorAll(".option-list .option-btn").forEach((btn) => {
        const origIdx = parseInt(btn.dataset.i, 10);
        window.APP.render.mdInlineInto(btn.querySelector("span:last-child"), opts5[origIdx]);
      });
      stage.querySelectorAll(".option-btn").forEach((btn) => {
        const origIdx = parseInt(btn.dataset.i, 10);
        btn.addEventListener("click", () => selectOption(origIdx));
      });
      stage.querySelector("#mark-btn").addEventListener("click", () => { marked[cur] = !marked[cur]; renderPalette(); renderQuestion(); });
      stage.querySelector("#prev-btn").addEventListener("click", () => { cur = Math.max(0, cur - 1); renderQuestion(); });
      stage.querySelector("#next-btn").addEventListener("click", () => { cur = Math.min(questions.length - 1, cur + 1); renderQuestion(); });
      stage.querySelector("#submit-btn").addEventListener("click", () => { finish(); });
      renderPalette();
    }

    function finish() {
      if (submitted) return;
      submitted = true;
      clearInterval(timerId);
      const perQ = questions.map((q, i) => ({ id: q.id, chosen: answers[i], correct: answers[i] === q.answer }));
      const score = perQ.filter((a) => a.correct).length;
      const usedSeconds = opts.timeSeconds - computeRemaining();
      const result = {
        at: Date.now(),
        score,
        total: questions.length,
        percent: Math.round((score / questions.length) * 100),
        minutesUsed: Math.round(usedSeconds / 60),
        answers: perQ,
      };
      if (typeof opts.onFinish === "function") opts.onFinish(result);
      C().announce("Exam submitted: " + result.percent + "% (" + result.score + "/" + result.total + ").");
      renderReview(result);
    }

    function renderReview(result) {
      progressEl.textContent = "reviewing " + questions.length + " questions";
      timerEl.textContent = "done";
      renderPalette();
      let html =
        '<div class="session-summary"><span class="summary-stat num">' + result.percent + "%</span>" +
        '<p class="summary-label">' + result.score + "/" + result.total + " correct &middot; " + result.minutesUsed + " min used</p></div>";
      questions.forEach((q, i) => {
        const a = result.answers[i];
        const opts5 = Array.isArray(q.options) ? q.options : [];
        const chosenText = a.chosen === null ? "no answer" : window.APP.render.mdInline(opts5[a.chosen] || "");
        const correctText = window.APP.render.mdInline(opts5[q.answer] || "");
        const lessonEntry = q.lesson ? window.APP.data.lessonsById[q.lesson] : null;
        html +=
          '<div class="review-item"><p class="verdict ' + (a.correct ? "correct" : "wrong") + ' mono">' +
          (a.correct ? "correct" : "incorrect") + "</p>" +
          '<div class="prompt md review-prompt-' + i + '"></div>' +
          '<p>your answer: ' + chosenText + (a.correct ? "" : " &middot; correct: " + correctText) + "</p>" +
          '<div class="explain md review-sol-' + i + '"></div>' +
          (lessonEntry ? '<p><a href="#/lesson/' + esc(q.lesson) + '">review lesson: ' + esc(lessonEntry.lesson.title) + "</a></p>" : "") +
          "</div>";
      });
      stage.innerHTML = html;
      questions.forEach((q, i) => {
        window.APP.render.mdInto(stage.querySelector(".review-prompt-" + i), q.prompt);
        window.APP.render.mdInto(stage.querySelector(".review-sol-" + i), q.solution);
      });
      // Covers the inline "your answer / correct" option text and the
      // "review lesson" link title, both set via raw innerHTML above.
      window.APP.render.enhanceMath(stage);
    }

    renderTimer(computeRemaining());
    renderQuestion();
  }

  window.APP.views.test = function (root, params) {
    const module = window.APP.data.byId[params.moduleId];
    if (!module) { root.innerHTML = '<p>Unknown module. <a href="#/">Back to the curriculum map</a>.</p>'; return; }
    const questions = (module.test || []).slice();
    window.APP.leitner.shuffle(questions);
    const breadcrumb = '<p class="breadcrumb"><a href="#/">curriculum</a> / <a href="#/module/' + esc(module.id) + '">' + esc(module.title) + "</a></p>";
    runExam(root, {
      questions,
      timeSeconds: secondsPerQuestion() * questions.length,
      title: module.title + " test",
      breadcrumbHtml: breadcrumb,
      onFinish: (result) => window.APP.progress.recordTestResult(module.id, result),
    });
  };

  function sampleMockQuestions() {
    const cfg = window.APP.EXAM;
    const pool = window.APP.data.modules.filter((m) => (m.greWeight || 0) > 0 && (m.test || []).length > 0);
    if (!pool.length) return { questions: [], shortfall: true, target: cfg.questionCount };
    const totalWeight = pool.reduce((s, m) => s + m.greWeight, 0) || 1;
    const target = cfg.questionCount;
    const want = pool.map((m) => ({ id: m.id, cap: m.test.length, raw: (m.greWeight / totalWeight) * target }));
    const alloc = {};
    want.forEach((w) => { alloc[w.id] = Math.min(Math.floor(w.raw), w.cap); });
    let remaining = target - Object.values(alloc).reduce((a, b) => a + b, 0);
    const byFrac = want.slice().sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw)));
    let guard = 0;
    while (remaining > 0 && guard < byFrac.length * 50) {
      const w = byFrac[guard % byFrac.length];
      if (alloc[w.id] < w.cap) { alloc[w.id]++; remaining--; }
      guard++;
    }
    let questions = [];
    pool.forEach((m) => {
      const n = alloc[m.id] || 0;
      const shuffled = m.test.slice();
      window.APP.leitner.shuffle(shuffled);
      questions = questions.concat(shuffled.slice(0, n));
    });
    window.APP.leitner.shuffle(questions);
    return { questions, shortfall: questions.length < target, target };
  }

  window.APP.views.mock = function (root) {
    const { questions, shortfall, target } = sampleMockQuestions();
    const cfg = window.APP.EXAM;
    // Scale the time limit proportionally when the loaded content can't
    // fill a full-length mock, rather than giving a short mock the full
    // real-exam time budget.
    const timeSeconds = shortfall && target
      ? Math.max(60, Math.round((cfg.totalMinutes * 60 * questions.length) / target))
      : cfg.totalMinutes * 60;
    runExam(root, {
      questions,
      timeSeconds,
      title: "Mock exam",
      breadcrumbHtml: '<p class="breadcrumb"><a href="#/">curriculum</a> / mock exam</p>',
      note: shortfall
        ? "Using " + questions.length + " of the real exam's " + target + " questions — not enough content is loaded yet for a full-length mock. Time limit scaled to " + Math.round(timeSeconds / 60) + " minutes."
        : questions.length + " questions, " + cfg.totalMinutes + " minutes — matches the real exam's length.",
      onFinish: (result) => window.APP.progress.recordMockResult(result),
    });
  };
})();
