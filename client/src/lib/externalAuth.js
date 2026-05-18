// External (non-Azure) user session helpers. Stored in localStorage because
// the server is strictly Bearer-header — no session cookies (see
// server/CLAUDE.md rule #7). XSS is the residual risk; the existing CSP
// and absence of inline scripts are the main mitigations.
const STORAGE_KEY = 'apt:externalAuthToken';

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function getExternalToken() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setExternalToken(token) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage disabled — fail closed (no session persists).
  }
}

export function clearExternalToken() {
  setExternalToken(null);
}

export function hasExternalSession() {
  const token = getExternalToken();
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 > Date.now();
}
