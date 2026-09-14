const STORAGE_KEY = "tank1990_leaderboard";
let memoryFallback = null;

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* localStorage access can throw in privacy modes */
  }
  return null;
}

function ensureMemory() {
  if (memoryFallback) return memoryFallback;
  memoryFallback = {
    data: {},
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this.data, k)
        ? this.data[k]
        : null;
    },
    setItem(k, v) {
      this.data[k] = String(v);
    },
  };
  return memoryFallback;
}

function readAll() {
  const ls = storage();
  const store = ls ?? ensureMemory();
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  const ls = storage();
  const store = ls ?? ensureMemory();
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* swallow errors so the leaderboard is purely best-effort */
  }
}

export const Leaderboard = {
  add(entry) {
    const list = readAll();
    list.push(entry);
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wave !== a.wave) return b.wave - a.wave;
      return a.date - b.date;
    });
    writeAll(list.slice(0, 50));
    return list;
  },
  top(n = 10) {
    const list = readAll();
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wave !== a.wave) return b.wave - a.wave;
      return a.date - b.date;
    });
    return list.slice(0, n);
  },
  clear() {
    writeAll([]);
  },
  size() {
    return readAll().length;
  },
};