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

// Monotonic counter bumped on every bust(). Snapshotted by cached() before
// starting a fetcher; if a bust happens *during* the fetch, the resolved
// value is returned to that one caller but NOT written back into the cache,
// because it represents a snapshot taken before a write that just landed.
// Without this guard, an in-flight read started before a write can re-populate
// the cache with stale data after the write's bust ran — leading to "edit
// disappears then reappears" symptoms on the client.
let bustGen = 0;

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
  bustGen += 1;
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
  bustGen += 1;
}

async function cached(key, ttlMs, fetcher) {
  const hit = get(key);
  if (hit !== undefined) return hit;
  const existing = inflight.get(key);
  if (existing) return existing;
  const startGen = bustGen;
  const promise = (async () => {
    try {
      const value = await fetcher();
      if (bustGen === startGen) set(key, value, ttlMs);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

// Periodic sweep. get() and bust() only evict lazily (on access), so expired
// entries from parameterized keys — e.g. per-query/per-user search caches that
// are never read again — would otherwise sit in the Map forever and grow the
// store without bound. Sweep expired entries on an interval. .unref() so this
// timer never keeps the process alive on its own (clean shutdown).
const SWEEP_MS = parseInt(process.env.CACHE_SWEEP_MS || '60000', 10);
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of store) {
    if (entry.expiresAt <= now) store.delete(k);
  }
}, SWEEP_MS);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

module.exports = { get, set, bust, clear, cached };
