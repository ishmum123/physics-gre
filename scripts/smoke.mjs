#!/usr/bin/env node
// Content smoke test. Loads content/manifest.js and every module it lists
// in a vm sandbox with a fake `window` (exactly how index.html loads them
// as <script> tags), then validates each module against
// docs/CONTENT_SCHEMA.md. Run with: node scripts/smoke.mjs
//
// This is also the script content authors run against their own module
// files before adding them to the manifest — error messages always name
// the module id, item id, and field so a defect is easy to locate.

import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const katex = require(path.join(ROOT, "vendor/katex/katex.min.js"));
const { extractMath } = require(path.join(ROOT, "app/mathsplit.js"));
const errors = []; // { module, item, field, message }
const warnings = [];

function err(mod, item, field, message) {
  errors.push({ module: mod, item, field, message });
}
function warn(mod, item, field, message) {
  warnings.push({ module: mod, item, field, message });
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ---- 0. Directory-wide syntax check + manifest completeness ------------
// Runs first (and never exits early) so a syntax error in one file, or a
// file nobody added to the manifest yet, is still reported even if the
// manifest-loading pass below later hits a FATAL error.

const modulesDirRel = "content/modules";
let allModuleFiles = [];
try {
  allModuleFiles = fs
    .readdirSync(path.join(ROOT, modulesDirRel))
    .filter((f) => f.endsWith(".js"))
    .map((f) => modulesDirRel + "/" + f)
    .sort();
} catch (e) {
  // No content/modules directory yet — nothing to scan.
}

allModuleFiles.forEach((relPath) => {
  const src = readFile(relPath);
  try {
    // eslint-disable-next-line no-new
    new vm.Script(src, { filename: relPath }); // syntax-only check, doesn't run it
  } catch (e) {
    err("(file)", relPath, "syntax", "does not parse as valid JavaScript: " + e.message);
  }
});

const manifestPathForScan = "content/manifest.js";
let manifestForScan = [];
try {
  const scanSandbox = { window: {}, console };
  vm.createContext(scanSandbox);
  vm.runInContext(readFile(manifestPathForScan), scanSandbox, { filename: manifestPathForScan });
  manifestForScan = Array.isArray(scanSandbox.window.PGRE_MANIFEST) ? scanSandbox.window.PGRE_MANIFEST : [];
} catch (e) {
  // Manifest itself is broken — the main pass below will report this fatally.
}
const manifestBasenames = new Set(manifestForScan.map((p) => path.basename(p)));
allModuleFiles.forEach((relPath) => {
  const base = path.basename(relPath);
  if (base !== "_demo.js" && !manifestBasenames.has(base)) {
    warn("(unlisted)", relPath, "manifest", modulesDirRel + "/" + base + " exists but is not listed in content/manifest.js");
  }
});

// ---- 1. Load manifest + modules in a vm sandbox --------------------------

const sandbox = { window: {}, console };
vm.createContext(sandbox);

const manifestPath = "content/manifest.js";
vm.runInContext(readFile(manifestPath), sandbox, { filename: manifestPath });

const manifest = Array.isArray(sandbox.window.PGRE_MANIFEST) ? sandbox.window.PGRE_MANIFEST : null;
if (!manifest) {
  console.error("FATAL: content/manifest.js did not set window.PGRE_MANIFEST to an array.");
  process.exit(1);
}

// Maps each index in window.PGRE.modules back to the file that registered
// it, by counting registrations before/after loading each file — a module
// file that registers zero or more than one module (instead of exactly
// one) would otherwise silently desync manifest[i] from modules[i].
const fileForModuleIndex = [];
for (const modPath of manifest) {
  let src;
  try {
    src = readFile(modPath);
  } catch (e) {
    console.error("FATAL: could not read manifest entry " + modPath + ": " + e.message);
    process.exit(1);
  }
  const before = (sandbox.window.PGRE && Array.isArray(sandbox.window.PGRE.modules)) ? sandbox.window.PGRE.modules.length : 0;
  try {
    vm.runInContext(src, sandbox, { filename: modPath });
  } catch (e) {
    console.error("FATAL: " + modPath + " threw while loading: " + e.message);
    process.exit(1);
  }
  const after = (sandbox.window.PGRE && Array.isArray(sandbox.window.PGRE.modules)) ? sandbox.window.PGRE.modules.length : 0;
  const registered = after - before;
  if (registered !== 1) {
    err("(file)", modPath, "registration", "registered " + registered + " module(s) via window.PGRE.modules.push — expected exactly 1");
  }
  for (let k = before; k < after; k++) fileForModuleIndex[k] = modPath;
}

const modules = (sandbox.window.PGRE && Array.isArray(sandbox.window.PGRE.modules)) ? sandbox.window.PGRE.modules : [];
if (!modules.length) {
  console.error("FATAL: no modules registered onto window.PGRE.modules after loading the manifest.");
  process.exit(1);
}

// ---- 2. Validate -----------------------------------------------------

const KEBAB_RE = /^[a-z_][a-z0-9_]*(-[a-z0-9]+)*$/; // allows a leading "_demo"-style dev prefix
const SECTION_KINDS = ["problem", "candidates", "failures", "discovery", "formal", "apply", "transfer"];
// Schema says text/markdown fields carry "No HTML" (maths + \text{} only).
// A "<" immediately followed by a letter is treated as a raw tag. Content
// inside $...$/$$...$$ maths is stripped first so an inequality like
// "$n<n_0$" isn't mistaken for a tag — the `svg` field is exempt entirely
// (see the trust-model comment in app/render.js: content is trusted and
// HTML passes through by design there; this rule just keeps *markdown*
// fields honoring the schema's own "No HTML" rule).
const HTML_TAG_RE = /<[a-zA-Z]/;
// Uses the SAME extractor the real render pipeline uses (app/mathsplit.js)
// so "what counts as a maths segment" — code-span skipping, escaped `\$`,
// single-line inline maths — can't drift between this check and what
// actually reaches KaTeX at render time. The placeholder it leaves behind
// is an HTML comment (`<!--...-->`), which never matches HTML_TAG_RE
// (that requires `<` immediately followed by a letter), so it's safe to
// check for raw HTML tags directly against the substituted text.
function stripMath(text) {
  return extractMath(String(text)).text;
}
function checkNoHtml(modId, item, field, text) {
  if (typeof text !== "string") return;
  if (HTML_TAG_RE.test(stripMath(text))) {
    err(modId, item, field, "contains a raw HTML tag — schema requires \"No HTML\" in markdown fields (use maths or \\text{} instead)");
  }
}

// ---- KaTeX render check --------------------------------------------------
// Extracts every $...$/$$...$$ segment and actually renders it with the
// vendored KaTeX (throwOnError: true) — catches LaTeX that would blow up
// or silently fail to render in the real app (e.g. \cdot used directly
// inside \text{}, which is undefined there). Identical expressions are
// rendered once and cached, since the same snippet (units, common
// formulas) repeats across a lot of content.
const katexCache = new Map(); // "D:"|"I:" + content -> null (ok) or error message
function renderKatexCached(content, displayMode) {
  const key = (displayMode ? "D:" : "I:") + content;
  if (katexCache.has(key)) return katexCache.get(key);
  let result = null;
  try {
    katex.renderToString(content, { throwOnError: true, displayMode });
  } catch (e) {
    result = e.message;
  }
  katexCache.set(key, result);
  return result;
}
// Belt-and-braces: an unescaped "%" inside a maths segment is valid LaTeX
// syntax-wise from KaTeX's perspective at the character level — KaTeX
// reads it as a comment-to-end-of-line, silently dropping the rest of the
// expression rather than erroring. That's the exact defect class behind
// `$\delta L/L=0.5\%$` degrading to `0.5%` when marked strips the escaping
// backslash: even with the maths-before-markdown fix, an author who
// forgets the backslash in the first place gets a silently truncated
// render instead of the intended literal percent sign, so flag it here.
const UNESCAPED_PERCENT_RE = /(?<!\\)%/;
function checkKatex(modId, item, field, text) {
  if (typeof text !== "string") return;
  const { segments } = extractMath(text);
  segments.forEach((seg) => {
    const errMsg = renderKatexCached(seg.content, seg.display);
    if (errMsg) {
      err(modId, item, field, "KaTeX failed to render \"" + seg.source + "\": " + errMsg);
    }
    if (UNESCAPED_PERCENT_RE.test(seg.content)) {
      err(modId, item, field, "maths segment \"" + seg.source + "\" contains an unescaped \"%\" — KaTeX reads it as a comment and silently drops the rest of the expression; use \\% for a literal percent sign");
    }
  });
}
function checkKatexOptions(modId, item, field, options) {
  if (!Array.isArray(options)) return;
  options.forEach((opt, oi) => checkKatex(modId, item, field + "[" + oi + "]", opt));
}

// ---- Content-quality warnings (not schema violations, but worth flagging) -
// Author scratch text accidentally left in copy ("actually check", "✓..",
// "hmm", "wait,") and characters that read fine in a doc but break KaTeX
// or look wrong rendered (a literal middle dot "·" instead of \cdot /
// \, spacing, or \textsuperscript instead of ^{}).
const SCRATCH_TEXT_RE = /actually check|✓\.\.|\bhmm\b|\bwait,|think again/i;
const BAD_CHAR_RE = /·|\\textsuperscript/;
function checkContentWarnings(modId, item, field, text) {
  if (typeof text !== "string") return;
  if (SCRATCH_TEXT_RE.test(text)) {
    warn(modId, item, field, "looks like author scratch text was left in (matched " + SCRATCH_TEXT_RE.source + ")");
  }
  if (BAD_CHAR_RE.test(text)) {
    warn(modId, item, field, "contains a literal middle dot (·) or \\textsuperscript — both tend to break or misrender in KaTeX; use \\cdot or ^{} instead");
  }
}

// ---- MC answer-key position bias ------------------------------------
// Content authors keying answers non-uniformly (e.g. "B" a suspicious
// fraction of the time) is a real, recurring defect class — flag any
// module where one key position accounts for >45% of its MC-style items,
// checked separately for 4-option items (checkpoints + mc drills) and
// 5-option items (test questions), each only once there's enough items
// to be meaningful.
const keyBias = {}; // modId -> { opt4: number[4], opt4Total, opt5: number[5], opt5Total }
function biasFor(modId) {
  keyBias[modId] = keyBias[modId] || { opt4: [0, 0, 0, 0], opt4Total: 0, opt5: [0, 0, 0, 0, 0], opt5Total: 0 };
  return keyBias[modId];
}
const BIAS_MIN_ITEMS = 6;
const BIAS_THRESHOLD = 0.45;

const seenModuleIds = new Set();
const seenLessonIds = new Set();
const seenDrillIds = new Set();
const seenTestIds = new Set();

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function isNumber(v) {
  return typeof v === "number" && !Number.isNaN(v);
}
function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function validateModule(m, filePath) {
  const modId = isNonEmptyString(m.id) ? m.id : "(missing id, file " + filePath + ")";

  if (!isNonEmptyString(m.id)) err(modId, "module", "id", "missing or empty");
  else {
    if (!KEBAB_RE.test(m.id)) err(modId, "module", "id", "must be kebab-case, got \"" + m.id + "\"");
    const base = path.basename(filePath, ".js");
    if (m.id !== base) err(modId, "module", "id", "id \"" + m.id + "\" does not match filename \"" + base + ".js\"");
    if (seenModuleIds.has(m.id)) err(modId, "module", "id", "duplicate module id");
    seenModuleIds.add(m.id);
  }
  if (!isNonEmptyString(m.title)) err(modId, "module", "title", "missing or empty");
  else checkKatex(modId, "module", "title", m.title);
  if (!isNumber(m.order)) err(modId, "module", "order", "must be a number");
  if (!isNumber(m.greWeight) || m.greWeight < 0 || m.greWeight > 1) err(modId, "module", "greWeight", "must be a number in [0,1]");
  if (!Array.isArray(m.prereqs) || !isStringArray(m.prereqs)) err(modId, "module", "prereqs", "must be an array of strings");
  if (!isNonEmptyString(m.blurb)) err(modId, "module", "blurb", "missing or empty");
  if (!Array.isArray(m.lessons)) err(modId, "module", "lessons", "must be an array");
  if (!Array.isArray(m.drills)) err(modId, "module", "drills", "must be an array");
  if (!Array.isArray(m.test)) err(modId, "module", "test", "must be an array");

  const lessonIdsInModule = new Set();
  (m.lessons || []).forEach((l, i) => validateLesson(l, i, modId, lessonIdsInModule));
  (m.drills || []).forEach((d, i) => validateDrill(d, i, modId, lessonIdsInModule));
  (m.test || []).forEach((q, i) => validateTestQuestion(q, i, modId, lessonIdsInModule));

  return {
    id: modId,
    lessons: (m.lessons || []).length,
    drills: (m.drills || []).length,
    test: (m.test || []).length,
  };
}

function validateLesson(l, idx, modId, lessonIdsInModule) {
  const item = isNonEmptyString(l && l.id) ? l.id : "lesson#" + idx;
  if (!l || typeof l !== "object") { err(modId, item, "lesson", "not an object"); return; }
  if (!isNonEmptyString(l.id)) err(modId, item, "id", "missing or empty");
  else {
    if (l.id.indexOf(modId + "-") !== 0) warn(modId, item, "id", "lesson id should start with \"" + modId + "-\"");
    if (seenLessonIds.has(l.id)) err(modId, item, "id", "duplicate lesson id across all modules");
    seenLessonIds.add(l.id);
    lessonIdsInModule.add(l.id);
  }
  if (!isNonEmptyString(l.title)) err(modId, item, "title", "missing or empty");
  else checkKatex(modId, item, "title", l.title);
  if (!isNumber(l.minutes)) err(modId, item, "minutes", "must be a number");
  if (!isNonEmptyString(l.discovery)) err(modId, item, "discovery", "missing or empty");

  if (!Array.isArray(l.sections)) {
    err(modId, item, "sections", "must be an array");
  } else {
    if (l.sections.length !== SECTION_KINDS.length) {
      err(modId, item, "sections", "expected " + SECTION_KINDS.length + " sections, got " + l.sections.length);
    }
    l.sections.forEach((s, si) => {
      const expected = SECTION_KINDS[si];
      if (!s || typeof s !== "object") { err(modId, item, "sections[" + si + "]", "not an object"); return; }
      if (expected && s.kind !== expected) {
        err(modId, item, "sections[" + si + "].kind", "expected \"" + expected + "\" at position " + si + ", got \"" + s.kind + "\"");
      } else if (!expected && !SECTION_KINDS.includes(s.kind)) {
        err(modId, item, "sections[" + si + "].kind", "unknown section kind \"" + s.kind + "\"");
      }
      if (!isNonEmptyString(s.md)) err(modId, item, "sections[" + si + "].md", "missing or empty");
      else {
        checkNoHtml(modId, item, "sections[" + si + "].md", s.md);
        checkKatex(modId, item, "sections[" + si + "].md", s.md);
        checkContentWarnings(modId, item, "sections[" + si + "].md", s.md);
      }
      if (s.svg !== undefined && !isNonEmptyString(s.svg)) err(modId, item, "sections[" + si + "].svg", "svg, if present, must be a non-empty string");
    });
  }

  if (!Array.isArray(l.checkpoints) || l.checkpoints.length < 1 || l.checkpoints.length > 3) {
    err(modId, item, "checkpoints", "must be an array of 1-3 checkpoints");
  } else {
    l.checkpoints.forEach((cp, ci) => {
      const cpTag = "checkpoints[" + ci + "]";
      if (!cp || typeof cp !== "object") { err(modId, item, cpTag, "not an object"); return; }
      if (!isNonEmptyString(cp.q)) err(modId, item, cpTag + ".q", "missing or empty");
      else {
        checkNoHtml(modId, item, cpTag + ".q", cp.q);
        checkKatex(modId, item, cpTag + ".q", cp.q);
        checkContentWarnings(modId, item, cpTag + ".q", cp.q);
      }
      if (!Array.isArray(cp.options) || cp.options.length !== 4 || !isStringArray(cp.options)) {
        err(modId, item, cpTag + ".options", "must be an array of exactly 4 strings");
      } else {
        checkKatexOptions(modId, item, cpTag + ".options", cp.options);
      }
      if (!Number.isInteger(cp.answer) || cp.answer < 0 || cp.answer > 3) {
        err(modId, item, cpTag + ".answer", "must be an integer 0-3");
      } else {
        const b = biasFor(modId);
        b.opt4[cp.answer]++;
        b.opt4Total++;
      }
      if (!isNonEmptyString(cp.explain)) err(modId, item, cpTag + ".explain", "missing or empty");
      else {
        checkNoHtml(modId, item, cpTag + ".explain", cp.explain);
        checkKatex(modId, item, cpTag + ".explain", cp.explain);
        checkContentWarnings(modId, item, cpTag + ".explain", cp.explain);
      }
    });
  }
}

function validateDrill(d, idx, modId, lessonIdsInModule) {
  const item = isNonEmptyString(d && d.id) ? d.id : "drill#" + idx;
  if (!d || typeof d !== "object") { err(modId, item, "drill", "not an object"); return; }
  if (!isNonEmptyString(d.id)) err(modId, item, "id", "missing or empty");
  else {
    if (seenDrillIds.has(d.id)) err(modId, item, "id", "duplicate drill id across all modules");
    seenDrillIds.add(d.id);
  }
  if (!isNonEmptyString(d.lesson)) err(modId, item, "lesson", "missing or empty");
  else if (!lessonIdsInModule.has(d.lesson)) err(modId, item, "lesson", "does not resolve to a lesson id in module \"" + modId + "\" (got \"" + d.lesson + "\")");

  if (d.type !== "mc" && d.type !== "numeric") {
    err(modId, item, "type", "must be \"mc\" or \"numeric\", got \"" + d.type + "\"");
  }
  if (!isNonEmptyString(d.prompt)) err(modId, item, "prompt", "missing or empty");
  else {
    checkNoHtml(modId, item, "prompt", d.prompt);
    checkKatex(modId, item, "prompt", d.prompt);
    checkContentWarnings(modId, item, "prompt", d.prompt);
  }

  if (d.type === "mc") {
    if (!Array.isArray(d.options) || d.options.length !== 4 || !isStringArray(d.options)) {
      err(modId, item, "options", "mc drill must have exactly 4 string options");
    } else {
      checkKatexOptions(modId, item, "options", d.options);
    }
    if (!Number.isInteger(d.answer) || d.answer < 0 || d.answer > 3) {
      err(modId, item, "answer", "mc drill answer must be an integer 0-3");
    } else {
      const b = biasFor(modId);
      b.opt4[d.answer]++;
      b.opt4Total++;
    }
  } else if (d.type === "numeric") {
    if (typeof d.answer !== "number" || Number.isNaN(d.answer)) err(modId, item, "answer", "numeric drill answer must be a number");
    if (d.tolerance !== undefined && !isNumber(d.tolerance)) err(modId, item, "tolerance", "if present, must be a number");
    if (d.unit !== undefined && !isNonEmptyString(d.unit)) err(modId, item, "unit", "if present, must be a non-empty string");
  }

  if (!isNonEmptyString(d.hint)) err(modId, item, "hint", "missing or empty");
  else {
    checkNoHtml(modId, item, "hint", d.hint);
    checkKatex(modId, item, "hint", d.hint);
    checkContentWarnings(modId, item, "hint", d.hint);
  }
  if (!isNonEmptyString(d.solution)) err(modId, item, "solution", "missing or empty");
  else {
    checkNoHtml(modId, item, "solution", d.solution);
    checkKatex(modId, item, "solution", d.solution);
    checkContentWarnings(modId, item, "solution", d.solution);
  }
  if (![1, 2, 3].includes(d.difficulty)) err(modId, item, "difficulty", "must be 1, 2, or 3");
  if (!isStringArray(d.tags) || !d.tags.length) err(modId, item, "tags", "must be a non-empty array of strings");
}

function validateTestQuestion(q, idx, modId, lessonIdsInModule) {
  const item = isNonEmptyString(q && q.id) ? q.id : "test#" + idx;
  if (!q || typeof q !== "object") { err(modId, item, "test", "not an object"); return; }
  if (!isNonEmptyString(q.id)) err(modId, item, "id", "missing or empty");
  else {
    if (seenTestIds.has(q.id)) err(modId, item, "id", "duplicate test question id across all modules");
    seenTestIds.add(q.id);
  }
  if (!isNonEmptyString(q.prompt)) err(modId, item, "prompt", "missing or empty");
  else {
    checkNoHtml(modId, item, "prompt", q.prompt);
    checkKatex(modId, item, "prompt", q.prompt);
    checkContentWarnings(modId, item, "prompt", q.prompt);
  }
  if (!Array.isArray(q.options) || q.options.length !== 5 || !isStringArray(q.options)) {
    err(modId, item, "options", "must be an array of exactly 5 strings");
  } else {
    checkKatexOptions(modId, item, "options", q.options);
  }
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 4) {
    err(modId, item, "answer", "must be an integer 0-4");
  } else {
    const b = biasFor(modId);
    b.opt5[q.answer]++;
    b.opt5Total++;
  }
  if (!isNonEmptyString(q.solution)) err(modId, item, "solution", "missing or empty");
  else {
    checkNoHtml(modId, item, "solution", q.solution);
    checkKatex(modId, item, "solution", q.solution);
    checkContentWarnings(modId, item, "solution", q.solution);
  }
  if (![1, 2, 3].includes(q.difficulty)) err(modId, item, "difficulty", "must be 1, 2, or 3");
  if (!isStringArray(q.tags) || !q.tags.length) err(modId, item, "tags", "must be a non-empty array of strings");
  if (q.lesson !== undefined) {
    if (!isNonEmptyString(q.lesson)) err(modId, item, "lesson", "if present, must be a non-empty string");
    else if (!lessonIdsInModule.has(q.lesson)) err(modId, item, "lesson", "does not resolve to a lesson id in module \"" + modId + "\" (got \"" + q.lesson + "\")");
  }
}

// ---- 3. Run + report ---------------------------------------------------

const summaries = modules.map((m, i) => validateModule(m, fileForModuleIndex[i] || manifest[i] || "(unknown file)"));

Object.keys(keyBias).forEach((modId) => {
  const b = keyBias[modId];
  if (b.opt4Total >= BIAS_MIN_ITEMS) {
    b.opt4.forEach((count, i) => {
      const frac = count / b.opt4Total;
      if (frac > BIAS_THRESHOLD) {
        warn(modId, "module", "answer-bias", "option " + String.fromCharCode(65 + i) + " is the answer for " +
          Math.round(frac * 100) + "% of this module's 4-option items (checkpoints + mc drills, n=" + b.opt4Total + ") — consider rebalancing");
      }
    });
  }
  if (b.opt5Total >= BIAS_MIN_ITEMS) {
    b.opt5.forEach((count, i) => {
      const frac = count / b.opt5Total;
      if (frac > BIAS_THRESHOLD) {
        warn(modId, "module", "answer-bias", "option " + String.fromCharCode(65 + i) + " is the answer for " +
          Math.round(frac * 100) + "% of this module's 5-option test items (n=" + b.opt5Total + ") — consider rebalancing");
      }
    });
  }
});

console.log("Physics GRE content smoke test — " + modules.length + " module(s) from " + manifestPath + "\n");
summaries.forEach((s) => {
  const modErrors = errors.filter((e) => e.module === s.id);
  const status = modErrors.length ? "FAIL (" + modErrors.length + ")" : "ok";
  console.log(
    "  " + s.id.padEnd(24) + " lessons=" + s.lessons + " drills=" + s.drills + " test=" + s.test + "  " + status
  );
});

if (warnings.length) {
  console.log("\nWarnings:");
  warnings.forEach((w) => console.log("  [" + w.module + " / " + w.item + " / " + w.field + "] " + w.message));
}

if (errors.length) {
  console.log("\nErrors:");
  errors.forEach((e) => console.log("  [" + e.module + " / " + e.item + " / " + e.field + "] " + e.message));
  console.log("\n" + errors.length + " error(s) across " + summaries.length + " module(s).");
  process.exit(1);
} else {
  console.log("\nAll " + summaries.length + " module(s) passed schema validation.");
  process.exit(0);
}
