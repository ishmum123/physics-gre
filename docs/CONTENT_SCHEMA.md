# Content schema (authoritative — engine and all content files follow this)

Static site, no build step. Every module is one file `content/modules/<id>.js` that
registers itself:

```js
window.PGRE = window.PGRE || {}; window.PGRE.modules = window.PGRE.modules || [];
window.PGRE.modules.push({ /* Module */ });
```

`content/manifest.js` lists module file paths in curriculum order; the loader
injects them as `<script>` tags, then the app starts.

## Text fields
All `md` / `prompt` / `solution` / `explain` / `hint` fields are Markdown.
Inline maths `$...$`, display maths `$$...$$` (KaTeX). Use `\text{}` for units.
No HTML. Keep prompts self-contained (no "see figure"). If a diagram is
essential, describe it in words or use an inline SVG string in an optional
`svg` field (viewBox-based, stroke `currentColor`, no fixed colours).

## Module
```ts
{
  id: string,            // kebab, matches filename
  title: string,
  order: number,         // curriculum position (0 = foundations)
  greWeight: number,     // fraction of the real exam (0 for foundations)
  prereqs: string[],     // module ids
  blurb: string,         // one sentence, what it unlocks
  lessons: Lesson[],
  drills: Drill[],
  test: TestQuestion[]
}
```

## Lesson (teach-like-an-inventor structure; ONE discovery per lesson)
```ts
{
  id: string,            // "<module>-<slug>"
  title: string,
  minutes: number,       // reading estimate
  discovery: string,     // the single idea this lesson lands, one line
  sections: [            // in this order; every kind present
    { kind: "problem",    md },  // concrete situation, cost of no solution
    { kind: "candidates", md },  // 2-3 approaches, ≥1 intuitive-but-wrong
    { kind: "failures",   md },  // counterexample that kills each
    { kind: "discovery",  md },  // idea that survives, by elimination
    { kind: "formal",     md },  // name, definition, notation — last
    { kind: "apply",      md },  // worked application to original problem
    { kind: "transfer",   md }   // abstract pattern, where else it appears
  ],
  checkpoints: [         // 1-3 quick inline checks, shown after "discovery"
    { q: md, options: string[4], answer: number /*0-based*/, explain: md }
  ]
}
```

## Drill (fast reps, instant feedback, Leitner-scheduled by the engine)
```ts
{
  id: string,            // "<lesson-id>-d<n>"
  lesson: string,        // lesson id
  type: "mc" | "numeric",
  prompt: md,
  options?: string[],    // mc: 4 options
  answer: number,        // mc: 0-based index; numeric: the value
  tolerance?: number,    // numeric: relative, default 0.03
  unit?: string,         // numeric: shown next to input
  hint: md,
  solution: md,          // full worked solution
  difficulty: 1 | 2 | 3,
  tags: string[]
}
```

## TestQuestion (real-exam style: 5 options, no calculator, 1-2 min each)
```ts
{
  id: string,            // "<module>-t<n>"
  prompt: md,
  options: string[5],
  answer: number,        // 0-based
  solution: md,          // includes the fast/estimation route an examinee would use
  difficulty: 1 | 2 | 3,
  tags: string[],
  lesson?: string        // nearest lesson id for "review this" links
}
```

## Quality bar for content authors
- Every numeric answer verified by working it twice (the solution shows the working).
- Options in MC are plausible distractors from real mistakes (sign, factor 2, wrong unit power).
- GRE-style: symbolic answers, orders of magnitude, limiting cases, dimensional analysis.
- Assume reader knows GCSE physics only + whatever earlier modules in `prereqs` taught.
