import { showToast } from './toast';

// Statuses where a quick retry is worth a shot: rate-limited or transient
// gateway failures. 5xx responses with no status are treated like network
// errors and also retried once.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(err) {
  if (!err) return false;
  if (err.status && RETRYABLE_STATUSES.has(err.status)) return true;
  // Browsers surface connection failures as TypeError("Failed to fetch") with
  // no status — one retry is low-cost and covers flaky Wi-Fi.
  if (!err.status && err.name === 'TypeError') return true;
  return false;
}

function buildFailureToast(err, fallback) {
  if (err && err.status === 409) {
    // Conflict dialogs surface their own UI via onConflict — no toast.
    return null;
  }
  if (err && err.message) {
    // Server-provided messages are already user-friendly; show them verbatim.
    return `${fallback}: ${err.message}`;
  }
  return fallback;
}

/**
 * Wrap a write-path API call with consistent failure UX.
 *
 *   await saveWithToast(
 *     () => updateJobOverrides(jobId, { notes }),
 *     {
 *       onRollback: () => setJobs(previous),
 *       failureMessage: 'Could not save notes',
 *     },
 *   );
 *
 * Responsibilities:
 *   - Show a toast on failure so the user actually finds out (today errors
 *     are swallowed with console.error).
 *   - Retry once on 429 / 502 / 503 / 504 / network errors.
 *   - Invoke `onRollback` on terminal failure so optimistic UI reverts.
 *   - Invoke `onConflict(err)` on HTTP 409 (wired up in a later step for the
 *     optimistic-locking flow); falls through to the normal failure toast
 *     if no handler is provided.
 *
 * Returns `{ ok, data, error }` — callers can branch on `.ok` if they need
 * to chain additional behavior after a success/failure.
 */
export async function saveWithToast(fn, opts = {}) {
  const {
    onRollback,
    onConflict,
    failureMessage = 'Save failed — please try again',
    successMessage,
    retry = true,
  } = opts;

  const attempt = () => fn();

  try {
    const data = await attempt();
    if (successMessage) showToast(successMessage);
    return { ok: true, data };
  } catch (firstErr) {
    let err = firstErr;
    if (retry && isRetryable(err)) {
      await sleep(800);
      try {
        const data = await attempt();
        if (successMessage) showToast(successMessage);
        return { ok: true, data };
      } catch (retryErr) {
        err = retryErr;
      }
    }

    if (err && err.status === 409 && typeof onConflict === 'function') {
      try { onConflict(err); } catch (e) { console.error('conflict handler threw:', e); }
    } else {
      const toast = buildFailureToast(err, failureMessage);
      if (toast) showToast(toast);
    }

    if (typeof onRollback === 'function') {
      try { onRollback(err); } catch (e) { console.error('rollback threw:', e); }
    }
    return { ok: false, error: err };
  }
}
