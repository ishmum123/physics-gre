// Progress page: per-module stats, Leitner box histogram, test/mock
// history, weak tags, reset (inline confirm, not window.confirm).
window.APP = window.APP || {};
window.APP.views = window.APP.views || {};

(function () {
  const esc = (s) => window.APP.render.escapeHtml(s);
  const C = () => window.APP.components;

  function renderHistogram(allDrillIds) {
    const dist = window.APP.leitner.boxDistribution(allDrillIds);
    const max = Math.max(1, ...dist.boxCounts);
    let html = '<div class="hist">';
    dist.boxCounts.forEach((n, i) => {
      const h = Math.round((n / max) * 100);
      html += '<div class="hist-box"><div class="hist-bar"><span style="height:' + h + '%"></span></div>' +
        '<p class="hist-label">box ' + i + " &middot; " + n + "</p></div>";
    });
    html += "</div>";
    return { html, dist };
  }

  function renderHistoryList(title, rows) {
    if (!rows.length) return "<h2>" + esc(title) + '</h2><p class="empty-note">Nothing recorded yet.</p>';
    let html = "<h2>" + esc(title) + '</h2><ul class="tag-list">';
    rows.forEach((r) => {
      html += "<li><span>" + esc(r.label) + '</span><span class="tag-acc num">' + r.value + "</span></li>";
    });
    html += "</ul>";
    return html;
  }

  window.APP.views.progress = function (root) {
    const data = window.APP.data;
    const modules = data.modules;
    const overall = window.APP.progress.overallProgressPercent();

    let spine = "";
    modules.forEach((m) => {
      const stats = window.APP.progress.moduleStats(m.id);
      const locked = !data.prereqsMet(m);
      spine += C().spineRow(m, stats, [], locked);
    });

    const allDrillIds = [];
    modules.forEach((m) => (m.drills || []).forEach((d) => allDrillIds.push(d.id)));
    const { html: histHtml } = renderHistogram(allDrillIds);

    const testRows = [];
    modules.forEach((m) => {
      const rec = window.APP.progress.getTestRecord(m.id);
      if (rec.best) testRows.push({ label: m.title, value: rec.best.percent + "%" });
    });
    const mockHist = window.APP.progress.mockHistory();
    const mockRows = mockHist.slice().reverse().map((h) => ({
      label: new Date(h.at).toLocaleDateString(),
      value: h.percent + "% (" + h.score + "/" + h.total + ")",
    }));

    const weak = window.APP.progress.weakTags();
    let weakHtml = "<h2>Weak tags</h2>";
    if (!weak.length) {
      weakHtml += '<p class="empty-note">Not enough drill/test attempts yet to identify weak tags.</p>';
    } else {
      weakHtml += '<ul class="tag-list">';
      weak.forEach((w) => {
        weakHtml += "<li><span>" + esc(w.tag) + '</span><span class="tag-acc num">' + Math.round(w.accuracy * 100) + "% (" + w.total + ")</span></li>";
      });
      weakHtml += "</ul>";
    }

    root.innerHTML =
      "<h1>Progress</h1>" +
      '<div class="progress-summary"><div class="stat-block"><span class="summary-stat num">' + overall + '%</span>' +
      '<p class="summary-label">lessons read overall</p></div></div>' +
      '<div class="spine">' + spine + "</div>" +
      "<h2>Drill boxes (all modules)</h2>" + histHtml +
      renderHistoryList("Module test bests", testRows) +
      renderHistoryList("Mock exam history", mockRows) +
      weakHtml +
      '<h2>Reset</h2>' +
      '<button type="button" class="btn btn-danger" id="reset-btn">reset all progress</button>' +
      '<div id="reset-confirm" hidden></div>';
    window.APP.render.enhanceMath(root);

    root.querySelector("#reset-btn").addEventListener("click", () => {
      const box = root.querySelector("#reset-confirm");
      box.hidden = false;
      box.className = "confirm-inline";
      box.innerHTML =
        "<p>This clears every lesson-read mark, drill box, and test/mock score stored in this browser " +
        "(your theme preference is kept). It can't be undone.</p>" +
        '<div class="btn-row">' +
        '<button type="button" class="btn btn-danger" id="reset-yes">yes, reset everything</button>' +
        '<button type="button" class="btn" id="reset-no">cancel</button>' +
        "</div>";
      box.querySelector("#reset-yes").addEventListener("click", () => {
        window.APP.progress.resetAll();
        window.APP.router.render();
      });
      box.querySelector("#reset-no").addEventListener("click", () => { box.hidden = true; box.innerHTML = ""; });
    });
  };
})();
