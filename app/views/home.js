// Home (curriculum map) and module overview views.
window.APP = window.APP || {};
window.APP.views = window.APP.views || {};

(function () {
  const C = () => window.APP.components;
  const esc = (s) => window.APP.render.escapeHtml(s);

  window.APP.views.home = function (root) {
    const data = window.APP.data;
    const modules = data.modules;
    const overall = window.APP.progress.overallProgressPercent();

    if (!modules.length) {
      root.innerHTML =
        '<h1>Physics GRE</h1><p class="empty-note">No content modules are loaded yet. ' +
        "Add module files to <span class=\"mono\">content/manifest.js</span> — see the README.</p>";
      return;
    }

    let rows = "";
    modules.forEach((m) => {
      const stats = window.APP.progress.moduleStats(m.id);
      const locked = !data.prereqsMet(m);
      const prereqTitles = (m.prereqs || []).map((pid) => (data.byId[pid] ? data.byId[pid].title : pid));
      rows += C().spineRow(m, stats, prereqTitles, locked);
    });

    root.innerHTML =
      '<h1>Physics GRE</h1>' +
      '<p class="blurb">A discovery-path study plan: work the curriculum in order, drill each ' +
      "module to mastery, then test it. " +
      '<span class="num">' + overall + "%</span> of lessons read overall.</p>" +
      '<div class="spine">' + rows + "</div>";
    window.APP.render.enhanceMath(root);
  };

  window.APP.views.moduleDetail = function (root, params) {
    const data = window.APP.data;
    const m = data.byId[params.id];
    if (!m) {
      root.innerHTML = '<p>Unknown module. <a href="#/">Back to the curriculum map</a>.</p>';
      return;
    }
    const stats = window.APP.progress.moduleStats(m.id);
    const prereqTitles = (m.prereqs || []).map((pid) => (data.byId[pid] ? data.byId[pid].title : pid));

    let lessonRows = "";
    (m.lessons || []).forEach((l, i) => {
      const read = window.APP.progress.isLessonRead(l.id);
      lessonRows +=
        '<div class="spine-row"><div class="spine-order num">' + String(i + 1).padStart(2, "0") + "</div>" +
        '<div class="spine-main"><div class="spine-title-row"><a class="spine-title" href="#/lesson/' +
        esc(l.id) + '">' + esc(l.title) + "</a>" +
        (read ? '<span class="spine-prereq mono">read</span>' : "") + "</div>" +
        '<p class="spine-blurb">' + esc(l.discovery || "") + "</p></div></div>";
    });

    root.innerHTML =
      '<p class="breadcrumb"><a href="#/">curriculum</a> / ' + esc(m.title) + "</p>" +
      "<h1>" + esc(m.title) + "</h1>" +
      '<p class="blurb">' + esc(m.blurb || "") + "</p>" +
      (prereqTitles.length ? '<p class="locked-note">needs: ' + esc(prereqTitles.join(", ")) + "</p>" : "") +
      '<div class="btn-row">' +
      '<a class="btn btn-primary" href="#/drill/' + esc(m.id) + '">drill this module</a>' +
      '<a class="btn" href="#/test/' + esc(m.id) + '">take the test (' + (m.test ? m.test.length : 0) + " questions)</a>" +
      "</div>" +
      "<h2>Lessons (" + stats.lessonsRead + "/" + stats.lessonsTotal + " read)</h2>" +
      '<div class="spine">' + (lessonRows || '<p class="empty-note">No lessons yet.</p>') + "</div>";
    window.APP.render.enhanceMath(root);
  };

  window.APP.views.notFound = function (root) {
    root.innerHTML =
      "<h1>Page not found</h1>" +
      '<p class="blurb">There\'s nothing at this address. <a href="#/">Back to the curriculum map</a>.</p>';
  };
})();
