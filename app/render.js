// Markdown (marked) + maths (KaTeX auto-render) rendering helpers.
// Every function here is defensive: a missing/undefined/null field renders
// as empty rather than throwing, since content modules are authored
// separately and optional fields are common.
//
// Trust model: module content (including markdown fields and the `svg`
// field) comes from the same authoring pipeline as the engine itself, not
// from end users, so marked's raw-HTML passthrough is intentionally left
// on — content authors can drop the odd `<br>` or similar. scripts/smoke.mjs
// separately flags raw HTML tags in md fields (outside the `svg` field) as
// a warning, so that passthrough stays a deliberate choice per field, not
// an accident. Never route untrusted/user-entered text through mdToHtml,
// mdInline, or svgInto.
window.APP = window.APP || {};

(function () {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Renders a maths segment (extracted by APP.mathsplit.extractMath) with
  // KaTeX directly from its raw LaTeX source — marked never sees it, so it
  // can't mangle backslash-escapes, underscores, or angle brackets inside
  // maths. Falls back to the escaped original `$...$` text if KaTeX itself
  // fails to parse the LaTeX (throwOnError: false already covers most
  // cases, but renderToString can still throw for a handful of inputs).
  function renderMathSegment(seg) {
    try {
      if (window.katex && typeof window.katex.renderToString === "function") {
        return window.katex.renderToString(seg.content, { throwOnError: false, displayMode: seg.display });
      }
    } catch (e) {
      console.warn("KaTeX render failed", e);
    }
    return escapeHtml(seg.source);
  }

  // Splits maths out before markdown, runs `parseFn` over the placeholder
  // text, then substitutes each placeholder for its KaTeX output.
  function mdWithMath(text, parseFn) {
    const str = String(text);
    const split = (window.APP.mathsplit && window.APP.mathsplit.extractMath)
      ? window.APP.mathsplit.extractMath(str)
      : { text: str, segments: [] };
    let html = parseFn(split.text);
    split.segments.forEach(function (seg) {
      html = html.split(seg.token).join(renderMathSegment(seg));
    });
    return html;
  }

  function mdToHtml(text) {
    if (text === undefined || text === null || text === "") return "";
    try {
      if (window.marked && typeof window.marked.parse === "function") {
        return mdWithMath(text, function (t) { return window.marked.parse(t); });
      }
      if (window.marked && typeof window.marked === "function") {
        return mdWithMath(text, function (t) { return window.marked(t); });
      }
    } catch (e) {
      // fall through to plain-text fallback
    }
    return "<p>" + escapeHtml(text) + "</p>";
  }

  // Inline-only markdown (no wrapping <p>, no block elements) for short
  // strings that live inside another element — MC/drill/checkpoint
  // options, titles, breadcrumb/nav labels. Lets `$...$` maths and light
  // emphasis through without producing block-level HTML in the wrong spot.
  function mdInline(text) {
    if (text === undefined || text === null || text === "") return "";
    try {
      if (window.marked && typeof window.marked.parseInline === "function") {
        return mdWithMath(text, function (t) { return window.marked.parseInline(t); });
      }
      // No parseInline available: fall back to full parse and strip a
      // single wrapping <p>...</p> if marked produced one.
      const html = mdToHtml(text);
      const m = /^<p>([\s\S]*)<\/p>\s*$/.exec(html.trim());
      return m ? m[1] : html;
    } catch (e) {
      return escapeHtml(text);
    }
  }

  // Runs KaTeX auto-render over an already-inserted DOM element. Safe to
  // call even if KaTeX failed to load (vendoring problem) — logs once.
  // Idempotent: KaTeX replaces matched delimiters with <span class="katex">
  // nodes, so re-running over an already-enhanced subtree is a harmless
  // no-op for the parts that were already rendered.
  function enhanceMath(el) {
    if (!el) return;
    try {
      if (typeof window.renderMathInElement === "function") {
        window.renderMathInElement(el, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      }
    } catch (e) {
      console.warn("KaTeX render failed", e);
    }
  }

  // Sets el's HTML from markdown text and runs maths over it in one step.
  function mdInto(el, text) {
    if (!el) return;
    el.innerHTML = mdToHtml(text);
    enhanceMath(el);
  }

  // Same, but inline (no wrapping <p>) — for options, titles, and other
  // short strings that must stay inline within a larger element.
  function mdInlineInto(el, text) {
    if (!el) return;
    el.innerHTML = mdInline(text);
    enhanceMath(el);
  }

  // Inserts a trusted inline SVG string (from a module's optional `svg`
  // field) into a wrapper element. Never throws on missing/malformed svg.
  function svgInto(el, svgString) {
    if (!el) return;
    if (!svgString || typeof svgString !== "string") {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    try {
      el.innerHTML = svgString;
    } catch (e) {
      el.innerHTML = "";
      el.hidden = true;
    }
  }

  window.APP.render = { mdToHtml, mdInline, enhanceMath, mdInto, mdInlineInto, svgInto, escapeHtml };
})();
