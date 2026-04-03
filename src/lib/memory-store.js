class RollingMemoryStore {
  constructor(limit = 3) {
    this.limit = limit;
    this.store = new Map();
  }

  get(key) {
    return this.store.get(key) || [];
  }

  push(key, message) {
    const history = this.get(key);
    history.push(message);
    this.store.set(key, history.slice(-this.limit));
    return this.get(key);
  }

  replace(key, messages) {
    this.store.set(key, (messages || []).slice(-this.limit));
    return this.get(key);
  }
}

module.exports = { RollingMemoryStore };
