// Keep in sync with server/lib/period.js
export const FISCAL_YEAR_START_MONTH = 1;

export function getPeriodForDate(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  let fiscalYear;
  let fiscalMonthIndex;
  if (month >= FISCAL_YEAR_START_MONTH) {
    fiscalYear = FISCAL_YEAR_START_MONTH === 1 ? year : year + 1;
    fiscalMonthIndex = month - FISCAL_YEAR_START_MONTH;
  } else {
    fiscalYear = year;
    fiscalMonthIndex = 12 + month - FISCAL_YEAR_START_MONTH;
  }
  const quarterNum = Math.floor(fiscalMonthIndex / 3) + 1;
  return `${fiscalYear}-Q${quarterNum}`;
}

export function getCurrentPeriod() {
  return getPeriodForDate(new Date());
}

export function periodBounds(period) {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!m) throw new Error(`Invalid period: ${period}`);
  const fiscalYear = parseInt(m[1], 10);
  const qNum = parseInt(m[2], 10);
  const monthsFromFYStart = (qNum - 1) * 3;
  const absStartMonth = FISCAL_YEAR_START_MONTH + monthsFromFYStart;
  let startYear, startMonth;
  if (absStartMonth > 12) {
    startYear = fiscalYear;
    startMonth = absStartMonth - 12;
  } else {
    startYear = FISCAL_YEAR_START_MONTH === 1 ? fiscalYear : fiscalYear - 1;
    startMonth = absStartMonth;
  }
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(startYear, startMonth - 1 + 3, 0, 23, 59, 59, 999);
  return { start, end };
}

export function shiftPeriod(period, delta) {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!m) throw new Error(`Invalid period: ${period}`);
  const fy = parseInt(m[1], 10);
  const q = parseInt(m[2], 10);
  const total = fy * 4 + (q - 1) + delta;
  return `${Math.floor(total / 4)}-Q${(total % 4) + 1}`;
}

export function periodProgress(period, now = new Date()) {
  const { start, end } = periodBounds(period);
  const total = end.getTime() - start.getTime();
  const elapsed = Math.min(Math.max(now.getTime() - start.getTime(), 0), total);
  return total === 0 ? 0 : elapsed / total;
}

export function formatPeriod(period) {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!m) return period;
  return `Q${m[2]} ${m[1]}`;
}

export function formatPeriodRange(period) {
  const { start, end } = periodBounds(period);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}
