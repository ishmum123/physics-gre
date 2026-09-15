// Loads content modules listed in content/manifest.js as sequential
// <script> tags (works from file:// — no fetch()), then boots the app.
window.APP = window.APP || {};

(function () {
  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => {
        console.error("Failed to load content module script:", src);
        resolve(); // keep booting even if one module fails to load
      };
      document.body.appendChild(s);
    });
  }

  async function loadContent() {
    const manifest = Array.isArray(window.PGRE_MANIFEST) ? window.PGRE_MANIFEST : [];
    for (const path of manifest) {
      await loadScript(path);
    }
  }

  function initTheme() {
    const btn = document.getElementById("theme-toggle");
    function apply(theme) {
      if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
      else document.documentElement.removeAttribute("data-theme");
      const label = theme === "dark" ? "dark" : theme === "light" ? "light" : "auto";
      if (btn) {
        btn.textContent = label;
        btn.setAttribute("aria-label", "Color theme: " + label + ". Click to change.");
      }
    }
    const stored = window.APP.storage.get("theme", null);
    apply(stored);
    if (btn) {
      btn.addEventListener("click", () => {
        const order = [null, "light", "dark"];
        const idx = order.indexOf(window.APP.storage.get("theme", null));
        const next = order[(idx + 1) % order.length];
        if (next === null) window.APP.storage.remove("theme");
        else window.APP.storage.set("theme", next);
        apply(next);
      });
    }
  }

  function initNav() {
    window.APP.setActiveNav = function (viewName) {
      document.querySelectorAll(".topnav a[data-view]").forEach((a) => {
        a.classList.toggle("active", a.dataset.view === viewName);
      });
    };
  }

  async function boot() {
    initTheme();
    initNav();
    await loadContent();
    window.APP.data.init();
    window.APP.router.start();
  }

  boot();
})();
