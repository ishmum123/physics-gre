# Project notes

## Status (2026-09-15)
Static site complete: 9 modules, 87 lessons, 413 drills, 191 test questions (after 2026-09-15 ETS syllabus gap fill: partial derivatives, heat transfer, fields in matter, identical particles, perturbation theory, particles in matter, Stark/Zeeman, Bragg, computation items). All modules pass
`scripts/smoke.mjs` (schema + KaTeX render + HTML/scratch-text checks) and an independent
per-item physics review (every drill/checkpoint/test key reworked; defects fixed).

## Known / accepted
- **Answer-key position bias** in authored content (option B keyed 50–89% per module). Mitigated
  at render time: the engine shuffles MC options deterministically per attempt, so displayed
  position is uniform. smoke.mjs still warns so future authors see it. Re-keying source files is
  optional cleanup.
- Prerequisites are advisory (shown, never enforced).
- Mock exam scales its time limit to the sampled question count when banks are short of 70.

## How to extend
- New module: write `content/modules/<id>.js` per `docs/CONTENT_SCHEMA.md`, append to
  `content/manifest.js`, run `node scripts/smoke.mjs` until clean.
- Content gotchas caught by review: no `·` or `\cdot`/control sequences inside `\text{}`;
  no `\textsuperscript`; no author scratch text ("actually check", "✓..") in solutions; keep
  drills distinct from their lesson's checkpoints; ids must be `<lesson-id>-d<n>`.
- Maths is extracted from Markdown before marked runs (app/mathsplit.js); smoke.mjs uses the same
  extractor, so anything smoke renders is exactly what the page renders.
- Node on this machine: `~/.nvm/versions/node/v24.15.0/bin/node` (shell `node` wrapper broken).

## Possible follow-ups
- Full-length practice: banks give 166 test Qs total, so repeated mocks overlap heavily.
  More test questions per module would improve mock variety.
- Import real past-paper questions (ETS releases 4 practice tests) as an optional bank.
- Track checkpoint answers in progress (currently unrecorded).

## Deployment
GitHub Pages from `main` root: https://ishmum123.github.io/physics-gre/ (repo ishmum123/physics-gre). Push to main redeploys.
