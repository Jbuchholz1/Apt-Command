// Tiny in-memory TTL cache with in-flight request de-duplication.
//
// Goals for the req board:
//   - 30 users loading the board within seconds should only trigger 1 call
//     to Bullhorn / Supabase for a given query (thundering-herd protection).
//   - Cache TTL stays well under the frontend's 5-minute poll interval, so
//     no new staleness is introduced beyond what already exists today.
//   - Writes explicitly bust relevant keys, so a user who just edited a
//     field always sees their change on the next read.
//
// Keys are short strings; wildcards are supported via a trailing `:*`.
// Stored values are read-only snapshots — never mutate a cached value.
//
// This module has no external dependencies on purpose: it's trivial to
// reason about, easy to rip out, and survives redeploys without state.

const store = new Map(); // key -> { value, expiresAt }
const inflight = new Map(); // key -> Promise<value>

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function bust(keyOrPrefix) {
  if (!keyOrPrefix) return;
  if (keyOrPrefix.endsWith(':*')) {
    const prefix = keyOrPrefix.slice(0, -1);
    for (const k of Array.from(store.keys())) {
      if (k.startsWith(prefix)) store.delete(k);
    }
  } else {
    store.delete(keyOrPrefix);
  }
}

function clear() {
  store.clear();
  inflight.clear();
}

async function cached(key, ttlMs, fetcher) {
  const hit = get(key);
  if (hit !== undefined) return hit;
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const value = await fetcher();
      set(key, value, ttlMs);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

module.exports = { get, set, bust, clear, cached };
