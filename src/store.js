const KEY_TTL_MS = 24 * 60 * 60 * 1000;

class IdempotencyStore {
  constructor() {
    this._store = new Map();
    setInterval(() => this._cleanup(), 30 * 60 * 1000);
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt.getTime() > KEY_TTL_MS) {
      this._store.delete(key);
      return null;
    }
    return entry;
  }

  startProcessing(key, bodyHash) {
    if (this._store.has(key)) return false;
    this._store.set(key, {
      state: "processing",
      bodyHash,
      response: null,
      statusCode: null,
      createdAt: new Date(),
      completedAt: null,
      waiters: [],
    });
    return true;
  }

  complete(key, statusCode, response) {
    const entry = this._store.get(key);
    if (!entry) return;
    entry.state = "completed";
    entry.statusCode = statusCode;
    entry.response = response;
    entry.completedAt = new Date();
    const waiters = entry.waiters.splice(0);
    for (const resolve of waiters) {
      resolve({ statusCode, response });
    }
  }

  waitForCompletion(key) {
    const entry = this._store.get(key);
    if (!entry) return Promise.reject(new Error("Key not found"));
    if (entry.state === "completed") {
      return Promise.resolve({ statusCode: entry.statusCode, response: entry.response });
    }
    return new Promise((resolve) => {
      entry.waiters.push(resolve);
    });
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this._store.entries()) {
      if (now - entry.createdAt.getTime() > KEY_TTL_MS) {
        this._store.delete(key);
      }
    }
  }

  stats() {
    let processing = 0;
    let completed = 0;
    for (const entry of this._store.values()) {
      if (entry.state === "processing") processing++;
      else completed++;
    }
    return { totalKeys: this._store.size, processing, completed };
  }
}

module.exports = new IdempotencyStore();
