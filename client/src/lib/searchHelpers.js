const STORAGE_KEY = 'apt_recent_searches';
const MAX_RECENT = 5;

const ICONS = {
  email:     { emoji: '📧', label: 'Email' },
  file:      { emoji: '📄', label: 'File' },
  event:     { emoji: '📅', label: 'Calendar' },
  person:    { emoji: '👤', label: 'Person' },
  job:       { emoji: '💼', label: 'Job' },
  candidate: { emoji: '🧑', label: 'Candidate' },
};

export const RESULT_GROUP_ORDER = ['person', 'job', 'candidate', 'file', 'email', 'event'];

export function getResultIcon(type) {
  return ICONS[type] || { emoji: '•', label: 'Result' };
}

export function formatResultDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

  if (d >= today) {
    return `Today ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (d >= yesterday) return 'Yesterday';
  if (d >= weekAgo) {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function getRecentSearches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function saveRecentSearch(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return;
  try {
    const existing = getRecentSearches();
    const filtered = existing.filter(r => r.query.toLowerCase() !== trimmed.toLowerCase());
    filtered.unshift({ query: trimmed, timestamp: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
  } catch {
    // localStorage unavailable — non-fatal
  }
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // non-fatal
  }
}
