// Content registry (built from loaded modules) + progress/state helpers
// layered on top of APP.storage. Everything here tolerates missing
// optional fields and missing modules.
window.APP = window.APP || {};

(function () {
  const S = () => window.APP.storage;

  // ---- Content registry --------------------------------------------
  const data = {
    modules: [],
    byId: {},
    lessonsById: {}, // lessonId -> { lesson, module }
    drillsById: {},  // drillId -> { drill, module }
    testQById: {},   // questionId -> { question, module }
    init() {
      const raw = (window.PGRE && Array.isArray(window.PGRE.modules)) ? window.PGRE.modules : [];
      this.modules = raw.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      this.byId = {};
      this.lessonsById = {};
      this.drillsById = {};
      this.testQById = {};
      this.modules.forEach((m) => {
        this.byId[m.id] = m;
        (m.lessons || []).forEach((l) => { this.lessonsById[l.id] = { lesson: l, module: m }; });
        (m.drills || []).forEach((d) => { this.drillsById[d.id] = { drill: d, module: m }; });
        (m.test || []).forEach((q) => { this.testQById[q.id] = { question: q, module: m }; });
      });
    },
    prereqsMet(module) {
      if (!module || !Array.isArray(module.prereqs) || !module.prereqs.length) return true;
      return module.prereqs.every((pid) => {
        const stats = progress.moduleStats(pid);
        return stats.lessonsRead > 0;
      });
    },
  };

  // ---- Lesson read tracking -----------------------------------------
  function lessonKey(id) { return "lesson:" + id; }
  function isLessonRead(id) { return !!S().get(lessonKey(id), null); }
  function markLessonRead(id) {
    if (!id) return;
    S().set(lessonKey(id), { read: true, at: Date.now() });
  }

  // ---- Test results ---------------------------------------------------
  function testKey(moduleId) { return "test:" + moduleId; }
  function getTestRecord(moduleId) {
    const rec = S().get(testKey(moduleId), { best: null, history: [] });
    // Type-guard against corrupted/foreign storage content.
    if (!rec || typeof rec !== "object") return { best: null, history: [] };
    return {
      best: rec.best && typeof rec.best === "object" ? rec.best : null,
      history: Array.isArray(rec.history) ? rec.history : [],
    };
  }
  function recordTestResult(moduleId, result) {
    const rec = getTestRecord(moduleId);
    rec.history = rec.history.concat([result]).slice(-10);
    if (!rec.best || result.percent > rec.best.percent) rec.best = result;
    S().set(testKey(moduleId), rec);
    return rec;
  }

  // ---- Mock exam history ----------------------------------------------
  function mockHistory() {
    const hist = S().get("mock:history", []);
    return Array.isArray(hist) ? hist : [];
  }
  function recordMockResult(result) {
    const hist = mockHistory().concat([result]).slice(-10);
    S().set("mock:history", hist);
    return hist;
  }

  // ---- Aggregate per-module stats for the curriculum map / progress ---
  function moduleStats(moduleId) {
    const m = data.byId[moduleId];
    const lessons = m ? (m.lessons || []) : [];
    const drills = m ? (m.drills || []) : [];
    const lessonsRead = lessons.filter((l) => isLessonRead(l.id)).length;
    const drillIds = drills.map((d) => d.id);
    const mastery = window.APP.leitner ? window.APP.leitner.moduleMastery(drillIds) : 0;
    const testRec = getTestRecord(moduleId);
    return {
      moduleId,
      lessonsTotal: lessons.length,
      lessonsRead,
      drillsTotal: drills.length,
      mastery,
      bestTestPercent: testRec.best ? testRec.best.percent : null,
    };
  }

  // ---- Weak tags: lowest-accuracy tags across drills + test/mock -----
  function weakTags(limit) {
    limit = limit || 8;
    const acc = {}; // tag -> { correct, total }
    function bump(tag, correct) {
      if (!tag) return;
      acc[tag] = acc[tag] || { correct: 0, total: 0 };
      acc[tag].total++;
      if (correct) acc[tag].correct++;
    }

    // Drills: use Leitner per-drill correct/attempts against the drill's tags.
    Object.keys(data.drillsById).forEach((id) => {
      const entry = data.drillsById[id];
      const st = window.APP.leitner ? window.APP.leitner.getState(id) : null;
      if (!st || !st.attempts) return;
      const tags = (entry.drill.tags || []);
      // Approximate: distribute this drill's lifetime accuracy across its tags.
      const correctShare = st.correct / st.attempts;
      tags.forEach((t) => {
        acc[t] = acc[t] || { correct: 0, total: 0 };
        acc[t].total += st.attempts;
        acc[t].correct += st.attempts * correctShare;
      });
    });

    // Tests + mock: walk stored per-question answers against question tags.
    data.modules.forEach((m) => {
      const rec = getTestRecord(m.id);
      (rec.history || []).forEach((h) => {
        (h.answers || []).forEach((a) => {
          const q = data.testQById[a.id];
          const tags = q ? (q.question.tags || []) : [];
          tags.forEach((t) => bump(t, a.correct));
        });
      });
    });
    mockHistory().forEach((h) => {
      (h.answers || []).forEach((a) => {
        const q = data.testQById[a.id];
        const tags = q ? (q.question.tags || []) : [];
        tags.forEach((t) => bump(t, a.correct));
      });
    });

    return Object.keys(acc)
      .map((t) => ({ tag: t, accuracy: acc[t].total ? acc[t].correct / acc[t].total : 0, total: Math.round(acc[t].total) }))
      // Require at least 3 attempts before a tag is confident enough to list
      // as "weak" — otherwise one unlucky guess looks like a mastered gap.
      .filter((x) => x.total >= 3)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, limit);
  }

  function overallProgressPercent() {
    if (!data.modules.length) return 0;
    let sum = 0;
    data.modules.forEach((m) => {
      const s = moduleStats(m.id);
      const lessonFrac = s.lessonsTotal ? s.lessonsRead / s.lessonsTotal : 0;
      sum += lessonFrac;
    });
    return Math.round((sum / data.modules.length) * 100);
  }

  // Clears all progress (lessons, drills, test/mock history) but keeps
  // user preferences like the theme choice — those aren't "progress".
  // APP.storage.clearAll() remains available for a true full wipe.
  function resetAll() {
    const keep = new Set(["theme"]);
    S().keysWithPrefix("").forEach((k) => {
      if (!keep.has(k)) S().remove(k);
    });
  }

  // ---- Numeric drill tolerance check ----------------------------------
  function checkNumeric(value, answer, tolerance) {
    const tol = typeof tolerance === "number" ? tolerance : (window.APP.EXAM ? window.APP.EXAM.numericToleranceDefault : 0.03);
    if (typeof value !== "number" || isNaN(value)) return false;
    if (answer === 0) return Math.abs(value) <= tol;
    return Math.abs(value - answer) <= tol * Math.abs(answer);
  }

  const progress = {
    isLessonRead, markLessonRead,
    getTestRecord, recordTestResult,
    mockHistory, recordMockResult,
    moduleStats, weakTags, overallProgressPercent,
    resetAll, checkNumeric,
  };

  window.APP.data = data;
  window.APP.progress = progress;
})();
