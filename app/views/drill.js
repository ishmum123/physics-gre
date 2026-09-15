// Drill mode: Leitner-scheduled reps, instant feedback, one question at a
// time. Fixed-length session (no requeue within it): up to 15 drills,
// due -> unseen -> random. Keyboard: 1-4 selects an MC option (mapped to
// displayed position), Enter submits/advances.
window.APP = window.APP || {};
window.APP.views = window.APP.views || {};

(function () {
  const esc = (s) => window.APP.render.escapeHtml(s);
  const C = () => window.APP.components;

  window.APP.views.drill = function (root, params) {
    const module = window.APP.data.byId[params.moduleId];
    if (!module) {
      root.innerHTML = '<p>Unknown module. <a href="#/">Back to the curriculum map</a>.</p>';
      return;
    }
    const drills = module.drills || [];
    if (!drills.length) {
      root.innerHTML =
        '<p class="breadcrumb"><a href="#/">curriculum</a> / <a href="#/module/' + esc(module.id) + '">' +
        esc(module.title) + '</a></p><h1>Drill</h1><p class="empty-note">This module has no drills yet.</p>';
      return;
    }

    const session = window.APP.leitner.buildSession(drills); // fixed length, no requeue
    const sessionSeed = Date.now(); // shuffle seed base — stable option order for this session
    const results = []; // { drill, correct, box }
    let pos = 0;
    let answered = false;

    root.innerHTML =
      '<p class="breadcrumb"><a href="#/">curriculum</a> / <a href="#/module/' + esc(module.id) + '">' +
      esc(module.title) + '</a></p>' +
      '<div class="stage-head"><span>drill &middot; ' + esc(module.title) + '</span>' +
      '<span class="num" id="drill-progress"></span></div>' +
      '<div id="drill-stage" class="question-stage"></div>';

    const stage = root.querySelector("#drill-stage");
    const progressEl = root.querySelector("#drill-progress");

    function onKeydown(e) {
      if (e.key === "Enter") {
        const nextBtn = stage.querySelector("#advance-btn") || stage.querySelector("#submit-btn");
        if (nextBtn && !nextBtn.disabled) nextBtn.click();
        return;
      }
      const n = parseInt(e.key, 10);
      if (!answered && n >= 1 && n <= 4) {
        // Positional: querySelectorAll order follows displayed (shuffled)
        // order, so key "2" always picks whatever shows as option B.
        const opt = stage.querySelectorAll(".option-btn")[n - 1];
        if (opt) opt.click();
      }
    }
    document.addEventListener("keydown", onKeydown);
    window.APP.router.onTeardown(() => document.removeEventListener("keydown", onKeydown));

    function renderQuestion() {
      answered = false;
      const drill = session[pos];
      progressEl.textContent = (pos + 1) + "/" + session.length;
      const opts = drill.type !== "numeric" && Array.isArray(drill.options) ? drill.options : [];
      const order = drill.type !== "numeric" ? C().seededShuffleIndices(opts.length, drill.id + ":" + sessionSeed) : [];
      stage.innerHTML =
        '<div class="prompt md"></div>' +
        (drill.type === "numeric" ? renderNumericInput(drill) : renderOptions(opts, order)) +
        '<div class="hint-box" hidden></div>' +
        '<div class="feedback" hidden></div>' +
        '<div class="btn-row">' +
        '<button type="button" class="btn" id="hint-btn">hint</button>' +
        (drill.type === "numeric" ? '<button type="button" class="btn btn-primary" id="submit-btn">submit</button>' : "") +
        "</div>";
      window.APP.render.mdInto(stage.querySelector(".prompt"), drill.prompt);

      if (drill.type !== "numeric") {
        // Spans are inserted in display order; fill each with the option
        // text its data-i (original index) points to.
        stage.querySelectorAll(".option-list .option-btn").forEach((btn) => {
          const origIdx = parseInt(btn.dataset.i, 10);
          window.APP.render.mdInlineInto(btn.querySelector("span:last-child"), opts[origIdx]);
        });
      }

      stage.querySelector("#hint-btn").addEventListener("click", () => {
        const hintEl = stage.querySelector(".hint-box");
        hintEl.hidden = false;
        window.APP.render.mdInto(hintEl, drill.hint || "No hint for this one.");
      });

      if (drill.type === "numeric") {
        const submitBtn = stage.querySelector("#submit-btn");
        const input = stage.querySelector("#numeric-input");
        submitBtn.addEventListener("click", () => submitNumeric(drill));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // Stop this keydown from also reaching the document-level
            // handler, which would otherwise see the same Enter bubble up
            // and immediately click the #advance-btn that submitNumeric()
            // just created — collapsing submit+advance into one keypress
            // and skipping the feedback entirely.
            e.stopPropagation();
            submitNumeric(drill);
          }
        });
      } else {
        stage.querySelectorAll(".option-btn").forEach((btn) => {
          const origIdx = parseInt(btn.dataset.i, 10);
          btn.addEventListener("click", () => submitOption(drill, origIdx));
        });
      }
    }

    // `order[displayPosition] = originalIndex`. Renders in display order,
    // labels A/B/C/D by display position, but tags each button with its
    // original option index (data-i) so grading is unaffected by shuffle.
    function renderOptions(opts, order) {
      let html = '<ul class="option-list">';
      order.forEach((origIdx, displayPos) => {
        html += '<li><button type="button" class="option-btn" data-i="' + origIdx + '">' +
          '<span class="opt-key mono">' + (displayPos + 1) + "</span><span></span></button></li>";
      });
      html += "</ul>";
      return html;
    }

    function renderNumericInput(drill) {
      return (
        '<div class="numeric-row">' +
        '<input type="text" inputmode="decimal" autocomplete="off" ' +
        'placeholder="e.g. 0.75 or 3/4" id="numeric-input" aria-label="Your answer, as a decimal or a/b fraction">' +
        (drill.unit ? '<span class="numeric-unit mono">' + esc(drill.unit) + "</span>" : "") +
        "</div>"
      );
    }

    function showResult(correct, drill) {
      answered = true;
      const updated = window.APP.leitner.recordAnswer(drill.id, correct, drill.tags);
      results.push({ drill, correct, box: updated.box });
      const fb = stage.querySelector(".feedback");
      fb.hidden = false;
      fb.className = "feedback " + (correct ? "correct" : "wrong");
      fb.innerHTML = '<p class="feedback-label mono">' + (correct ? "correct" : "not quite") + '</p><div class="md"></div>';
      window.APP.render.mdInto(fb.querySelector(".md"), drill.solution);
      C().announce(correct ? "Correct." : "Not quite — see the solution.");
      stage.querySelector("#hint-btn").disabled = true;
      const numericSubmit = stage.querySelector("#submit-btn");
      if (numericSubmit) numericSubmit.disabled = true;
      let row = stage.querySelector(".btn-row");
      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.id = "advance-btn";
      nextBtn.className = "btn btn-primary";
      nextBtn.textContent = pos + 1 < session.length ? "next" : "finish";
      nextBtn.addEventListener("click", advance);
      row.appendChild(nextBtn);
      nextBtn.focus();
    }

    function submitOption(drill, origIdx) {
      if (answered) return;
      const correct = origIdx === drill.answer;
      stage.querySelectorAll(".option-btn").forEach((b) => {
        const j = parseInt(b.dataset.i, 10);
        b.disabled = true;
        if (j === drill.answer) b.classList.add(j === origIdx ? "correct" : "correct-unchosen");
        else if (j === origIdx) b.classList.add("wrong");
      });
      showResult(correct, drill);
    }

    function submitNumeric(drill) {
      if (answered) return;
      const input = stage.querySelector("#numeric-input");
      const value = window.APP.progress.parseNumericInput(input.value);
      const correct = window.APP.progress.checkNumeric(value, drill.answer, drill.tolerance);
      input.disabled = true;
      stage.querySelector("#submit-btn").disabled = true;
      showResult(correct, drill);
    }

    function advance() {
      pos++;
      if (pos < session.length) renderQuestion();
      else renderSummary();
    }

    function renderSummary() {
      document.removeEventListener("keydown", onKeydown);
      const correctCount = results.filter((r) => r.correct).length;
      const boxCount = (window.APP.EXAM && window.APP.EXAM.leitner && window.APP.EXAM.leitner.boxCount) || 5;
      const boxCounts = new Array(boxCount).fill(0);
      results.forEach((r) => { boxCounts[r.box] = (boxCounts[r.box] || 0) + 1; });
      const maxBox = Math.max(1, ...boxCounts);
      let histHtml = '<h2>Box moves this session</h2><div class="hist">';
      boxCounts.forEach((n, i) => {
        const h = Math.round((n / maxBox) * 100);
        histHtml += '<div class="hist-box"><div class="hist-bar"><span style="height:' + h + '%"></span></div>' +
          '<p class="hist-label">box ' + i + " &middot; " + n + "</p></div>";
      });
      histHtml += "</div>";

      const missed = results.filter((r) => !r.correct);
      let missedHtml = "<h2>Missed this session</h2>";
      if (!missed.length) {
        missedHtml += '<p class="empty-note">None — every drill this session was correct.</p>';
      } else {
        missedHtml += '<ul class="tag-list missed-list">';
        missed.forEach((r) => {
          const lessonEntry = r.drill.lesson ? window.APP.data.lessonsById[r.drill.lesson] : null;
          missedHtml += '<li><div class="missed-prompt md"></div>' +
            (lessonEntry ? '<a href="#/lesson/' + esc(r.drill.lesson) + '">review lesson: ' + esc(lessonEntry.lesson.title) + "</a>" : "") +
            "</li>";
        });
        missedHtml += "</ul>";
      }

      stage.innerHTML =
        '<div class="session-summary">' +
        '<span class="summary-stat num">' + correctCount + "/" + results.length + "</span>" +
        '<p class="summary-label">correct this session</p>' +
        "</div>" +
        histHtml + missedHtml +
        '<div class="btn-row">' +
        '<button type="button" class="btn btn-primary" id="drill-again-btn">another session</button>' +
        '<a class="btn" href="#/module/' + esc(module.id) + '">back to module</a>' +
        "</div>";
      missed.forEach((r, i) => {
        window.APP.render.mdInto(stage.querySelectorAll(".missed-prompt")[i], r.drill.prompt);
      });
      // A plain <a href="#/drill/:id"> here would be a no-op: it's the
      // same hash as the current route, so no hashchange fires and the
      // session never resets. Reset via the router's reload() instead,
      // which re-runs this view from scratch (fresh session, fresh seed).
      const againBtn = stage.querySelector("#drill-again-btn");
      if (againBtn) {
        againBtn.addEventListener("click", () => window.APP.router.reload());
      }
      C().announce("Session complete: " + correctCount + " of " + results.length + " correct.");
      progressEl.textContent = "done";
    }

    renderQuestion();
    window.APP.render.enhanceMath(root);
  };
})();
