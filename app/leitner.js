// Leitner-box scheduling for drills. Pure logic over APP.storage; no DOM.
window.APP = window.APP || {};

(function () {
  const S = () => window.APP.storage;
  const cfg = () => (window.APP.EXAM && window.APP.EXAM.leitner) || { boxCount: 5, boxIntervalsDays: [0, 1, 3, 7, 14] };

  function key(drillId) {
    return "drill:" + drillId;
  }

  function getState(drillId) {
    const def = { box: 0, dueAt: 0, seen: false, lastResult: null, attempts: 0, correct: 0, tags: [] };
    const st = S().get(key(drillId), def);
    if (!st || typeof st !== "object") return def;
    const { boxCount } = cfg();
    // Clamp against corrupted storage or a boxCount that shrank since the
    // value was written.
    const box = Number.isInteger(st.box) ? Math.max(0, Math.min(boxCount - 1, st.box)) : 0;
    return {
      box,
      dueAt: typeof st.dueAt === "number" ? st.dueAt : 0,
      seen: !!st.seen,
      lastResult: st.lastResult === true || st.lastResult === false ? st.lastResult : null,
      attempts: typeof st.attempts === "number" ? st.attempts : 0,
      correct: typeof st.correct === "number" ? st.correct : 0,
      tags: Array.isArray(st.tags) ? st.tags : [],
    };
  }

  function isDue(drillId, now) {
    now = now || Date.now();
    const st = getState(drillId);
    return !st.seen || st.dueAt <= now;
  }

  function recordAnswer(drillId, wasCorrect, tags) {
    const { boxCount, boxIntervalsDays } = cfg();
    const st = getState(drillId);
    const nextBox = wasCorrect ? Math.min(boxCount - 1, st.box + 1) : 0;
    const days = boxIntervalsDays[nextBox] !== undefined ? boxIntervalsDays[nextBox] : boxIntervalsDays[boxIntervalsDays.length - 1];
    const updated = {
      box: nextBox,
      dueAt: Date.now() + days * 24 * 60 * 60 * 1000,
      seen: true,
      lastResult: !!wasCorrect,
      attempts: (st.attempts || 0) + 1,
      correct: (st.correct || 0) + (wasCorrect ? 1 : 0),
      tags: Array.isArray(tags) ? tags : st.tags || [],
    };
    S().set(key(drillId), updated);
    return updated;
  }

  // Builds a fixed-length study session from a module's drill list: due
  // drills first (most-overdue first), then never-seen drills, then the
  // rest at random, capped at `size` (default 15). This is the whole
  // session — no requeue happens within it; a wrong answer still resets
  // the drill's Leitner box, it just doesn't reappear until the next
  // session.
  function buildSession(drills, size) {
    const now = Date.now();
    const withState = (drills || []).map((d) => ({ drill: d, state: getState(d.id) }));
    const due = withState.filter((x) => x.state.seen && x.state.dueAt <= now)
      .sort((a, b) => a.state.dueAt - b.state.dueAt);
    const unseen = withState.filter((x) => !x.state.seen);
    const rest = withState.filter((x) => x.state.seen && x.state.dueAt > now);
    shuffle(rest);
    shuffle(unseen);
    const ordered = due.concat(unseen, rest).map((x) => x.drill);
    const cap = size || 15;
    return ordered.slice(0, cap);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Returns { boxCounts: [n0..n(k-1)], total, mastered } for a set of drill ids.
  function boxDistribution(drillIds) {
    drillIds = drillIds || [];
    const { boxCount } = cfg();
    const counts = new Array(boxCount).fill(0);
    let seenCount = 0;
    drillIds.forEach((id) => {
      const st = getState(id);
      if (st.seen) {
        counts[st.box] = (counts[st.box] || 0) + 1;
        seenCount++;
      }
    });
    return { boxCounts: counts, total: drillIds.length, seen: seenCount, mastered: counts[boxCount - 1] || 0 };
  }

  // Rough module mastery %: mean of (box / (boxCount-1)) over drills that
  // have been seen at least once; unseen drills count as 0.
  function moduleMastery(drillIds) {
    const { boxCount } = cfg();
    if (!drillIds || !drillIds.length) return 0;
    let sum = 0;
    drillIds.forEach((id) => {
      const st = getState(id);
      sum += st.seen ? st.box / (boxCount - 1) : 0;
    });
    return Math.round((sum / drillIds.length) * 100);
  }

  window.APP.leitner = { getState, isDue, recordAnswer, buildSession, boxDistribution, moduleMastery, shuffle };
})();
