// Small shared view helpers. Pure string-building + DOM utilities used by
// app/views/*.js. No routing/content logic here.
window.APP = window.APP || {};

(function () {
  const esc = (window.APP.render && window.APP.render.escapeHtml) || String;

  function traceBar(fraction, opts) {
    opts = opts || {};
    const pct = Math.max(0, Math.min(1, fraction || 0)) * 100;
    const cls = opts.amber ? "trace amber" : "trace";
    return '<div class="' + cls + '" role="img" aria-label="' + esc(opts.label || "") +
      '"><span style="width:' + pct.toFixed(0) + '%"></span></div>';
  }

  function statLine(label, barHtml, valueText) {
    return '<div class="stat-line"><span>' + esc(label) + '</span>' + barHtml +
      '<span class="num">' + esc(valueText) + "</span></div>";
  }

  // One row of the curriculum spine, shared by the home view and the
  // progress page. `stats` comes from APP.progress.moduleStats.
  function spineRow(module, stats, prereqTitles, locked) {
    const lessonFrac = stats.lessonsTotal ? stats.lessonsRead / stats.lessonsTotal : 0;
    const testText = stats.bestTestPercent === null ? "—" : stats.bestTestPercent + "%";
    const drillText = stats.drillsTotal ? (stats.mastery + "%") : "—";
    const prereqHtml = prereqTitles && prereqTitles.length
      ? '<span class="spine-prereq">needs: ' + esc(prereqTitles.join(", ")) + "</span>"
      : "";
    return (
      '<div class="spine-row' + (locked ? " is-locked" : "") + '">' +
      '<div class="spine-order num">' + String(module.order ?? "").padStart(2, "0") + "</div>" +
      '<div class="spine-main">' +
      '<div class="spine-title-row"><a class="spine-title" href="#/module/' + esc(module.id) + '">' +
      esc(module.title) + "</a>" + prereqHtml + "</div>" +
      '<p class="spine-blurb">' + esc(module.blurb || "") + "</p>" +
      statLine("lessons", traceBar(lessonFrac, { label: "lessons read" }), stats.lessonsRead + "/" + stats.lessonsTotal) +
      statLine("drills", traceBar(stats.mastery / 100, { label: "drill mastery", amber: true }), drillText) +
      statLine("test", traceBar((stats.bestTestPercent || 0) / 100, { label: "best test score" }), testText) +
      '<div class="spine-actions">' +
      '<a href="#/module/' + esc(module.id) + '">overview</a>' +
      '<a href="#/drill/' + esc(module.id) + '">drill</a>' +
      '<a href="#/test/' + esc(module.id) + '">test</a>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function fmtPercent(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return Math.round(n) + "%";
  }

  function fmtTime(seconds) {
    seconds = Math.max(0, Math.round(seconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function el(html) {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    return wrap.firstElementChild;
  }

  // Posts a short status message to the single shared live region
  // (index.html #live-region) for screen readers — drill feedback, exam
  // submit confirmation, and similar transient outcomes that don't need
  // (and shouldn't get) the whole view re-announced.
  function announce(text) {
    const live = document.getElementById("live-region");
    if (live) live.textContent = text || "";
  }

  // Deterministic per-seed shuffle: same (n, seed) always produces the
  // same permutation, so re-rendering the same question mid-attempt (e.g.
  // navigating prev/next/palette in a test) doesn't reorder its options.
  // Returns an array `order` of length n where order[displayPosition] =
  // originalIndex.
  function hashSeed(str) {
    let h = 2166136261;
    str = String(str);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffleIndices(n, seed) {
    const rand = mulberry32(hashSeed(seed));
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  window.APP.components = { traceBar, statLine, spineRow, fmtPercent, fmtTime, esc, el, announce, seededShuffleIndices };
})();
