// Status colors: if actual progress >= expected progress, green.
// Within 15 percentage points behind: yellow. Further behind: red.
// Expected progress = (days elapsed in period / total days) * 100.

import { periodProgress } from './period';

export const STATUS_COLORS = {
  green: '#16a34a',
  yellow: '#D3BF30',
  red: '#dc2626',
  gray: '#94a3b8',
};

export function calculatedStatus(progressPct, period, now = new Date()) {
  if (!period) return 'gray';
  const expected = periodProgress(period, now) * 100;
  if (progressPct >= expected) return 'green';
  if (expected - progressPct <= 15) return 'yellow';
  return 'red';
}

export function resolveStatus(goal, progressPct, period, now = new Date()) {
  return calculatedStatus(progressPct, period, now);
}

// Quarterly Ledger status vocabulary. Derives COMPLETE from pct before mapping
// the existing green/yellow/red traffic lights to editorial labels.
// Returns one of: 'on' | 'at-risk' | 'off' | 'complete'.
export function statusLabel(colorStatus, pct) {
  if (typeof pct === 'number' && pct >= 100) return 'complete';
  if (colorStatus === 'green') return 'on';
  if (colorStatus === 'yellow') return 'at-risk';
  return 'off';
}

export const LEDGER_STATUS_COPY = {
  on: 'ON TRACK',
  'at-risk': 'AT RISK',
  off: 'OFF TRACK',
  complete: 'COMPLETE',
};

export const LEDGER_STATUS_VAR = {
  on: 'var(--apt-success)',
  'at-risk': 'var(--apt-warning)',
  off: 'var(--apt-danger)',
  complete: 'var(--apt-navy-600)',
};
