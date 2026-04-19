// Change this to 7 for a July-start fiscal year, etc.
// Fiscal year is named by the calendar year in which it ENDS.
const FISCAL_YEAR_START_MONTH = 1;

function getPeriodForDate(date = new Date()) {
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

function getCurrentPeriod() {
  return getPeriodForDate(new Date());
}

function periodBounds(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) throw new Error(`Invalid period: ${period}`);
  const fiscalYear = parseInt(match[1], 10);
  const qNum = parseInt(match[2], 10);

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

function shiftPeriod(period, delta) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) throw new Error(`Invalid period: ${period}`);
  const fiscalYear = parseInt(match[1], 10);
  const qNum = parseInt(match[2], 10);

  const totalQs = fiscalYear * 4 + (qNum - 1) + delta;
  const newFY = Math.floor(totalQs / 4);
  const newQ = (totalQs % 4) + 1;
  return `${newFY}-Q${newQ}`;
}

function listPeriods(current = getCurrentPeriod(), before = 4, after = 2) {
  const out = [];
  for (let i = -before; i <= after; i++) {
    out.push(shiftPeriod(current, i));
  }
  return out;
}

function periodProgress(period, now = new Date()) {
  const { start, end } = periodBounds(period);
  const total = end.getTime() - start.getTime();
  const elapsed = Math.min(Math.max(now.getTime() - start.getTime(), 0), total);
  return total === 0 ? 0 : elapsed / total;
}

function formatPeriod(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) return period;
  return `Q${match[2]} ${match[1]}`;
}

module.exports = {
  FISCAL_YEAR_START_MONTH,
  getCurrentPeriod,
  getPeriodForDate,
  periodBounds,
  shiftPeriod,
  listPeriods,
  periodProgress,
  formatPeriod,
};
