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
