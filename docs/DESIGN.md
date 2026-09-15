# Design plan — Physics GRE study site

## Subject read
A self-study tool for someone climbing from GCSE physics to grad-school
physics, alone, over months, with a fixed exam at the end. The honest visual
world for that is not a marketing site — it's the physical objects around
that work: a lab notebook, graph paper, an oscilloscope trace, a brass
instrument dial, a fountain-pen annotation in a margin. Precision and
measurement are the content's own vocabulary, so the UI borrows it directly:
numbers get a different typographic voice than prose, progress is a trace
not a badge, and structure reads like an instrument panel, not a SaaS
dashboard.

## Color (light)
- `--paper: #EEF1EA` — pale sage-vellum background, not cream/terracotta.
- `--ink: #16202A` — blue-black fountain-pen text, not pure/tinted black.
- `--rule: #C9D1C4` — faint sage grid/rule lines (graph-paper structure).
- `--signal: #3A6EA5` — steel-blue, primary interactive accent (instrument
  casing / chalkboard chalk).
- `--amber: #B8792A` — ochre-brass, used for "correct" / mastery / highlight.
- `--brick: #A6433D` — muted brick red, used for "incorrect" / due / warning.

## Color (dark) — `prefers-color-scheme: dark` or manual toggle
- `--paper: #121A20`, `--ink: #E7EAE2`, `--rule: #2A343A`,
  `--signal: #7FB0DE`, `--amber: #D9A45C`, `--brick: #E28A83`.

## Type
- Body/reading (lessons, prose): **Literata** (serif, built for long-form
  reading), weights 400/600/700 + 400 italic. Line length capped ~68ch,
  line-height 1.6.
- Structure/UI/numbers (nav, labels, stats, timers, scores, tags, palette
  numbers, code-like fields): **IBM Plex Mono**, weights 400/600. Numbers are
  *always* mono, even inline in prose ("box 3", "62%"), so a reader's eye
  learns to scan for measured values the way it would in a lab notebook.
- No third display face. Hierarchy comes from size/weight/color, not a
  second decorative typeface.

## Layout concept
Single left-aligned column, max content width ~760px, generous top/bottom
rhythm. No card grids anywhere — nothing in this app is a tile of equal
importance to its neighbor.

**Home (curriculum map):** a vertical spine, not a grid of cards.

```
Physics GRE                                         [progress: 12%]

  01  Mechanics                                    lessons 3/6 ████░░
      the language everything else borrows          drills  box~2.4
      |                                              test    71%
      |
  02  Electromagnetism  (needs: Mechanics)          lessons 0/5 ░░░░░░
      |                                              drills  —
      |                                              test    —
  03  Quantum & Atomic   (needs: Mechanics, EM)      ...
```
Each module is a row: order number, title, one-line blurb, a thin
horizontal trace (like an oscilloscope sweep) per progress metric instead
of a percentage pill. Prereqs shown as plain text + a connecting rule
between rows, dashed when not yet started. Nothing is truly locked — a
dashed line signals "not yet", not a disabled button.

**Lesson:** one flowing document, sections in schema order, each section
kind marked by a small mono label in the margin/gutter (`problem`,
`candidates`, `failures`, `discovery`, `formal`, `apply`, `transfer`) rather
than a boxed card — the discovery-path structure should read like marginal
notes in a notebook, not seven identical boxes.

```
mechanics · newton's second law            ← plain text breadcrumb, no eyebrow caps

problem     A block on a frictionless incline...
candidates  A. ...   B. ...
failures    A fails because...
discovery   ★ the idea this lesson lands
formal      F = ma, defined precisely
apply       back to the block: ...
transfer    same pattern shows up in ...

  [ checkpoint: quick check ]

← prev lesson            next lesson →
```

**Drill / Test / Mock:** single-question focus stage, centered content,
generous white space, one question visible at a time — not a form with all
questions stacked. Palette (test/mock only) is a strip of small numbered
mono cells, not a grid of colored squares.

**Progress:** a stat sheet — module rows again (reusing the spine
component), Leitner box histogram as a horizontal bar-per-box, weak tags as
a plain ranked list, not a tag cloud.

Alignment: left-aligned throughout; centered only for the single active
question in drill/test/mock (the one place the page has exactly one focal
object).

## Principles
1. **Numbers are mono, prose is serif.** This one rule does most of the
   work of feeling like an instrument rather than a content site.
2. **Progress is a trace, not a badge.** Horizontal line-sweeps and
   histograms instead of percentage pills/rounded chips — ties to the
   oscilloscope/graph-paper world instead of generic SaaS "card kit" cues.
3. **Structure is a spine, not a grid.** Curriculum and progress are linear
   sequences with real prerequisite relationships; a grid of equal cards
   would misrepresent that, so nothing is a card grid.
4. **One accent used with restraint.** Steel-blue carries all primary
   interaction; ochre/brick are reserved strictly for correct/incorrect
   feedback so they stay meaningful instead of decorative.
5. **No template chrome.** No ALL-CAPS eyebrows, no middle-dot meta
   strings, no arrow-suffixed buttons, no identical rounded shadow cards.
   Section kind labels, breadcrumbs, and buttons are plain sentence case.

## Self-check against generic defaults
- Not cream+terracotta (sage-vellum + steel-blue+ochre instead), not
  black+acid-green.
- Not a broadsheet/hairline-newspaper pastiche — grid lines are structural
  (graph paper) not decorative rules, and layout is a spine, not columns.
- Not the SaaS card kit — deliberately zero repeating rounded-card-with-
  shadow components; the one recurring shape (module row / question stage)
  is functionally justified by the content being sequential.
- No tracked-out caps eyebrows, no middle dots, no "→" on buttons — checked
  and removed during copy pass in the build step.
