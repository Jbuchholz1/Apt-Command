import { getApiToken, getApiBaseUrl } from './api';

// Server-Sent Events consumer built on fetch + ReadableStream rather than
// native EventSource. The reason: EventSource can't send custom headers, and
// our API server expects a Bearer JWT just like every other endpoint.
//
// Returns an unsubscribe function. The connection auto-reconnects with
// exponential backoff (capped at 30s). On a successful reconnect, the
// optional onReconnect handler fires so callers can re-fetch state and
// catch up on whatever they missed while disconnected.

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export function subscribeEventStream(path, handlers = {}) {
  const { onMessage, onReconnect, onError } = handlers;
  let aborted = false;
  let activeController = null;
  let backoff = INITIAL_BACKOFF_MS;
  let isFirstConnect = true;

  async function readStream() {
    if (aborted) return;
    let token;
    try {
      token = await getApiToken();
    } catch (err) {
      // A THROW here is typically transient (a network blip during MSAL silent
      // refresh) — not a clean "signed out", which returns a null token and is
      // handled by the 401 branch below. The old code bailed permanently on any
      // throw, so one transient hiccup killed the SSE stream until a full
      // remount. Reconnect with backoff instead; if the user really is signed
      // out, api.js's getToken triggers the MSAL redirect and the backoff stays
      // capped so this never tight-loops.
      scheduleReconnect(err);
      return;
    }

    const ctrl = new AbortController();
    activeController = ctrl;
    let res;
    try {
      res = await fetch(`${getApiBaseUrl()}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: ctrl.signal,
      });
    } catch (err) {
      if (aborted || err.name === 'AbortError') return;
      scheduleReconnect(err);
      return;
    }

    if (!res.ok) {
      // 401 likely means token expired; let the next attempt re-acquire.
      // Other 4xx/5xx → reconnect with backoff.
      const err = new Error(`Stream connect failed: ${res.status}`);
      err.status = res.status;
      scheduleReconnect(err);
      return;
    }

    backoff = INITIAL_BACKOFF_MS;
    if (!isFirstConnect && onReconnect) {
      try { onReconnect(); } catch (e) { console.error('onReconnect threw:', e); }
    }
    isFirstConnect = false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE messages are separated by a blank line (\n\n).
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';
        for (const msg of messages) {
          if (!msg) continue;
          // Heartbeats are comment lines (start with ':') — skip them.
          // The initial 'connected' event has both `event:` and `data:`
          // lines; we just parse the data line.
          const dataLine = msg.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          const raw = dataLine.slice(6);
          try {
            const payload = JSON.parse(raw);
            if (onMessage) onMessage(payload);
          } catch {
            // Non-JSON data line — ignore.
          }
        }
      }
    } catch (err) {
      if (aborted || err.name === 'AbortError') return;
      scheduleReconnect(err);
      return;
    }

    // Stream ended cleanly (server closed) — reconnect.
    if (!aborted) scheduleReconnect(new Error('Stream closed by server'));
  }

  function scheduleReconnect(err) {
    if (aborted) return;
    if (onError) {
      try { onError(err); } catch (e) { console.error('onError threw:', e); }
    }
    setTimeout(() => {
      if (!aborted) readStream();
    }, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }

  readStream();

  return () => {
    aborted = true;
    if (activeController) {
      try { activeController.abort(); } catch (e) { /* already aborted */ }
    }
  };
}
