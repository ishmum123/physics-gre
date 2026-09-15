// Minimal hash router. No history API dependency (works from file://).
window.APP = window.APP || {};

(function () {
  const routes = [
    { pattern: "/", view: "home" },
    { pattern: "/module/:id", view: "moduleDetail" },
    { pattern: "/lesson/:id", view: "lesson" },
    { pattern: "/drill/:moduleId", view: "drill" },
    { pattern: "/test/:moduleId", view: "test" },
    { pattern: "/mock", view: "mock" },
    { pattern: "/progress", view: "progress" },
  ];

  // Views register cleanup work (interval/timeout clears, event listener
  // removals, IntersectionObserver disconnects) via APP.router.onTeardown.
  // render() drains this registry right before wiping #app-view, so a view
  // never has to guess whether it's still mounted.
  let teardownFns = [];
  function onTeardown(fn) {
    if (typeof fn === "function") teardownFns.push(fn);
  }
  function runTeardown() {
    const fns = teardownFns;
    teardownFns = [];
    fns.forEach((fn) => {
      try { fn(); } catch (e) { console.error("Teardown handler failed", e); }
    });
  }

  function parseHash() {
    let hash = window.location.hash || "#/";
    if (hash.indexOf("#") === 0) hash = hash.slice(1);
    if (!hash) hash = "/";
    const [path] = hash.split("?");
    const segments = path.split("/").filter((s) => s.length > 0);
    return segments;
  }

  function safeDecode(seg) {
    try { return decodeURIComponent(seg); } catch (e) { return seg; }
  }

  function match(segments) {
    for (const route of routes) {
      const routeSegs = route.pattern.split("/").filter((s) => s.length > 0);
      if (routeSegs.length !== segments.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < routeSegs.length; i++) {
        if (routeSegs[i].charAt(0) === ":") {
          params[routeSegs[i].slice(1)] = safeDecode(segments[i]);
        } else if (routeSegs[i] !== segments[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { view: route.view, params };
    }
    return null;
  }

  function mount() {
    return document.getElementById("app-view");
  }

  function render() {
    const el = mount();
    if (!el) return;
    runTeardown();
    const segments = parseHash();
    const found = match(segments) || { view: "notFound", params: {} };
    const viewFn = window.APP.views && window.APP.views[found.view];
    el.innerHTML = "";
    if (typeof viewFn !== "function") {
      el.innerHTML = "<p>That page could not be found. <a href=\"#/\">Back to the curriculum map</a>.</p>";
      return;
    }
    try {
      viewFn(el, found.params || {});
    } catch (e) {
      console.error("View render failed", found.view, e);
      el.innerHTML = "<p>Something went wrong rendering this page. <a href=\"#/\">Back to the curriculum map</a>.</p>";
    }
    window.scrollTo(0, 0);
    if (typeof window.APP.setActiveNav === "function") window.APP.setActiveNav(found.view);
  }

  function start() {
    window.addEventListener("hashchange", render);
    if (!window.location.hash) window.location.hash = "#/";
    render();
  }

  function navigate(hash) {
    window.location.hash = hash;
  }

  // Re-renders the current route from scratch (fresh view-fn call, full
  // teardown first) without touching the URL. For links that mean "start
  // over" on a route the user is already on — a plain <a href="#/same">
  // there is a no-op because the hash doesn't change, so no hashchange
  // event fires and the view never re-runs.
  function reload() {
    render();
  }

  window.APP.router = { start, render, navigate, reload, onTeardown };
})();
