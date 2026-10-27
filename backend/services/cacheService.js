import { GITHUB_CONFIG } from '../config/github.config.js';

class MemoryTTLCache {
  constructor(maxEntries = GITHUB_CONFIG.CACHE.MAX_ENTRIES, defaultTTL = GITHUB_CONFIG.CACHE.TTL_MS) {
    this.maxEntries = maxEntries;
    this.defaultTTL = defaultTTL;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    const entry = this.cache.get(key);
    const now = Date.now();

    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    return {
      data: entry.data,
      fetchedAt: entry.fetchedAt,
    };
  }

  set(key, data, fetchedAt = new Date().toISOString(), ttl = this.defaultTTL) {
    // If capacity reached, evict oldest entry
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      fetchedAt,
      expiresAt: Date.now() + ttl,
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

export const githubCache = new MemoryTTLCache();
