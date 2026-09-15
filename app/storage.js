// Thin localStorage wrapper. Every key lives under the "pgre:" prefix,
// every value is JSON. Tolerates missing/corrupt/unavailable storage so a
// blocked localStorage (private mode, sandboxed file://) never throws.
window.APP = window.APP || {};

(function () {
  const PREFIX = "pgre:";
  let memoryFallback = null; // used if localStorage itself throws

  function backingStore() {
    if (memoryFallback) return memoryFallback;
    try {
      const testKey = PREFIX + "__probe__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (e) {
      memoryFallback = memoryFallback || new Map();
      return memoryFallback;
    }
  }

  function storeGet(store, key) {
    if (store instanceof Map) return store.has(key) ? store.get(key) : null;
    return store.getItem(key);
  }
  function storeSet(store, key, val) {
    if (store instanceof Map) { store.set(key, val); return; }
    store.setItem(key, val);
  }
  function storeRemove(store, key) {
    if (store instanceof Map) { store.delete(key); return; }
    store.removeItem(key);
  }
  function storeKeys(store) {
    if (store instanceof Map) return Array.from(store.keys());
    const out = [];
    for (let i = 0; i < store.length; i++) out.push(store.key(i));
    return out;
  }

  const storage = {
    get(key, fallback) {
      try {
        const store = backingStore();
        const raw = storeGet(store, PREFIX + key);
        if (raw === null || raw === undefined) return fallback;
        const parsed = JSON.parse(raw);
        // A stored JSON "null" is never a meaningful domain value here —
        // treat it the same as "missing" so callers always get their
        // fallback shape (object/array) rather than null.
        return parsed === null ? fallback : parsed;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        const store = backingStore();
        storeSet(store, PREFIX + key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try {
        storeRemove(backingStore(), PREFIX + key);
      } catch (e) { /* ignore */ }
    },
    // All suffixes (without the pgre: prefix) currently stored, optionally
    // filtered to those starting with `sub`.
    keysWithPrefix(sub) {
      try {
        const store = backingStore();
        const keys = storeKeys(store)
          .filter((k) => typeof k === "string" && k.indexOf(PREFIX) === 0)
          .map((k) => k.slice(PREFIX.length));
        return sub ? keys.filter((k) => k.indexOf(sub) === 0) : keys;
      } catch (e) {
        return [];
      }
    },
    clearAll() {
      try {
        const store = backingStore();
        storeKeys(store)
          .filter((k) => typeof k === "string" && k.indexOf(PREFIX) === 0)
          .forEach((k) => storeRemove(store, k));
      } catch (e) { /* ignore */ }
    },
  };

  window.APP.storage = storage;
})();
