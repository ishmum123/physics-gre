# Physics GRE study site

A static, no-backend, no-build study tool for the ETS Physics GRE subject
test: curriculum map, discovery-path lessons, Leitner-scheduled drills,
timed module tests, and a proportional mock exam. Opens directly from
`file://` or any static file host — plain HTML/CSS/JS, no bundler, no npm
at runtime.

## Run it

Either works:

- Open `index.html` directly in a browser (double-click, or `open index.html`).
- Or serve it (avoids any browser file:// quirks): `python3 -m http.server`
  from this directory, then visit `http://localhost:8000`.

No build step, no install step.

## Add a content module

1. Write `content/modules/<your-module-id>.js` following
   `docs/CONTENT_SCHEMA.md` exactly — it's the authoritative schema for
   both the engine and content authors.
2. Add its path to the `window.PGRE_MANIFEST` array in
   `content/manifest.js`, in curriculum order.
3. Validate it: `node scripts/smoke.mjs`. This loads the manifest and
   every module it lists in a sandboxed `window`, exactly as `index.html`
   does, and checks every required field, section order, option count,
   answer range, and id reference. Errors name the module id, item id, and
   field — run this before adding a module to the manifest for real.
4. `content/modules/_demo.js` is a development-only fixture (1 lesson, 4
   drills, 5 test questions) exercising every schema field, including
   `svg` and a numeric drill. Never add it to a production manifest.

## Vendored libraries (no runtime CDN)

Downloaded once with curl into `vendor/`, pinned:

| Library | Version | Files |
|---|---|---|
| KaTeX | 0.16.11 | `vendor/katex/katex.min.js`, `katex.min.css`, `vendor/katex/contrib/auto-render.min.js`, 20 `.woff2` fonts in `vendor/katex/fonts/` |
| marked | 12.0.2 | `vendor/marked/marked.min.js` |
| Literata (Google Fonts, OFL) | v40, latin subset, static instances (400/600/700 + 400 italic) | `vendor/fonts/literata-*.woff2` |
| IBM Plex Mono (Google Fonts, OFL) | v20, latin subset (400/600) | `vendor/fonts/plex-mono-*.woff2` |

`vendor/fonts/fonts.css` declares the `@font-face` rules for both font
families against the local files. Google's variable-font serving was
avoided deliberately (a variable-range Literata file was returned first
and silently ignored the requested static weight — fetched again with a
pre-variable-font browser UA to get real static instances per weight).

## Exam facts (verified 2026-09-15, from ETS's own pages)

- **70** five-choice questions.
- **120 minutes** total.
- **No penalty** for wrong or blank answers (rights-only scoring).
- Scored as **percent correct, 0–100** (this replaced the older 200–990
  scale for tests taken from September 2023 onward).

Sources: [GRE Subject Test Content and Structure](https://www.ets.org/gre/test-takers/subject-tests/about/content-structure.html),
[GRE Subject Tests — score reporting](https://www.ets.org/gre/score-users/about/subject-tests.html),
corroborated by [Are You Penalized for Wrong Answers on the GRE?](https://gre.blog.targettestprep.com/are-you-penalized-for-wrong-answers-on-the-gre/).

These live in `app/exam-config.js` as the single source of truth for
question count, time limit, option count, and scoring rule — the mock
exam and each module test both read from it.

## App structure

- `index.html` — the shell: loads `vendor/`, `content/manifest.js`, then
  `app/` in dependency order, as plain sequential `<script>` tags (no ES
  modules, no `fetch()` — required for `file://` to work).
- `content/manifest.js` + `content/modules/*.js` — content, authored
  separately; modules self-register onto `window.PGRE.modules`.
- `app/exam-config.js` — real-exam facts (question count, time, scoring).
- `app/storage.js` — `localStorage` wrapper, all keys under `pgre:`,
  tolerates missing/corrupt/blocked storage (falls back to an in-memory
  Map so the app still works, just without persistence).
- `app/mathsplit.js` — extracts `$...$`/`$$...$$` maths segments out of
  content text before markdown runs (see below), shared between the render
  pipeline and `scripts/smoke.mjs`.
- `app/render.js` — markdown (marked) + maths (KaTeX, via `app/mathsplit.js`)
  rendering, plus safe inline-SVG insertion; every function is a no-op on
  missing/undefined content.
- `app/leitner.js` — Leitner-box drill scheduling (5 boxes, 0/1/3/7/14
  day intervals, configurable in `app/exam-config.js`).
- `app/state.js` — content registry (built from loaded modules) and
  progress aggregation (lesson-read tracking, test/mock history, weak
  tags, numeric-tolerance checking).
- `app/components.js` — small shared view-building helpers (the
  curriculum "spine" row, trace bars, formatting).
- `app/router.js` — minimal hash router (`#/`, `#/module/:id`,
  `#/lesson/:id`, `#/drill/:moduleId`, `#/test/:moduleId`, `#/mock`,
  `#/progress`).
- `app/views/*.js` — one view module per route family: `home.js` (map +
  module overview), `lesson.js`, `drill.js`, `exam.js` (shared
  timed-exam engine used by both module tests and the mock exam),
  `progress.js`.
- `app/loader.js` — injects each `content/manifest.js` path as a
  `<script>` tag in order, then boots (`APP.data.init()` +
  `APP.router.start()`).

## localStorage keys

Everything lives under the `pgre:` prefix, one JSON value per key:

| Key | Shape | Meaning |
|---|---|---|
| `pgre:theme` | `"light"` \| `"dark"` (absent = follow system) | Manual theme override |
| `pgre:lesson:<lessonId>` | `{ read: true, at }` | Lesson reached its end |
| `pgre:drill:<drillId>` | `{ box, dueAt, seen, lastResult, attempts, correct, tags }` | Leitner state per drill |
| `pgre:test:<moduleId>` | `{ best, history: [...] }` | Module test results (best + last 10) |
| `pgre:mock:history` | `[{ at, score, total, percent, minutesUsed, answers }]` | Last 10 mock exam attempts |

The progress page's "reset all progress" button clears every `pgre:` key
**except `pgre:theme`** (inline confirmation, not `window.confirm`) — a
theme choice is a preference, not progress. `APP.storage.clearAll()`
remains available for a true full wipe including the theme, if ever needed.

## Prerequisites are advisory, not enforced

A module's `prereqs` control only how the curriculum map *looks* — a
module with unmet prereqs renders with a dimmed row and a "needs: ..."
note, but every link (lesson, drill, test) stays live. Nothing in the
router or the views actually blocks navigation on prereqs; this is
intentional (see the brief: "locked-looking but never actually blocked"),
so don't rely on `prereqs` for gating if you're extending the engine.

## Markdown/HTML trust model

Content modules are authored through the same pipeline as the engine —
not by end users — so `app/render.js` intentionally leaves marked's raw
HTML passthrough on (see the comment at the top of that file). The schema
itself says content fields should contain "No HTML" (maths + `\text{}`
only), and `scripts/smoke.mjs` enforces that as a hard error: any `md` /
`prompt` / `solution` / `explain` / `hint` / checkpoint `q` field
containing a raw `<tag` (outside `$...$`/`$$...$$` maths) fails the smoke
test. The `svg` field is exempt — it's HTML/SVG by definition.

Maths is extracted (`app/mathsplit.js`) and rendered to KaTeX HTML *before*
the remaining text is handed to marked, so marked's own escaping/emphasis
rules never get a chance to corrupt LaTeX source (e.g. turn `\%` into `%`
or `x_1$ ... $y_1` into emphasis) before KaTeX sees it.

## Design

See `docs/DESIGN.md` for the full design plan (palette, type, layout,
principles) this UI implements — a graph-paper/lab-notebook/instrument
visual language chosen for the subject matter, deliberately avoiding the
generic AI-default look (no cream+terracotta, no card-grid kit, no
ALL-CAPS eyebrows).

## Known state of content (as of this build)

`content/manifest.js` now lists six real modules — `foundations`,
`mechanics`, `em`, `waves-optics`, `thermo`, `qm` — and `node
scripts/smoke.mjs` passes cleanly against all of them.
`content/modules/_demo.js` is still present as the dev fixture but is no
longer in the manifest (never add it to a production manifest).
`scripts/smoke.mjs` also scans the whole `content/modules/` directory
regardless of the manifest, so it currently warns that `atomic.js` and
`relativity.js` exist but aren't listed yet — add them to
`PGRE_MANIFEST` (in curriculum order) once the content pipeline is ready
to wire them in; the warning will clear itself.
