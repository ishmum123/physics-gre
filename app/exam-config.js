// Real-exam facts, verified 2026-09-15 against ETS's own pages (see README
// "Exam facts" section for sources). Keep this file the single source of
// truth for anything that mimics the real test's shape or scoring.
window.APP = window.APP || {};
window.APP.EXAM = {
  // ETS GRE Physics Test: ~70 five-choice questions, 120 minutes total,
  // no penalty for wrong/blank answers, percent-correct (0-100) scoring
  // since the September 2023 format change.
  questionCount: 70,
  totalMinutes: 120,
  optionCount: 5,
  penalizeWrong: false,
  scoring: "percent-correct", // 0-100, unanswered counts as incorrect
  // Leitner drill scheduling.
  leitner: {
    boxCount: 5,
    boxIntervalsDays: [0, 1, 3, 7, 14],
  },
  numericToleranceDefault: 0.03,
};
