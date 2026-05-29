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

// Only getCurrentPeriod is consumed (server/routes/goals.js). The former
// periodBounds / shiftPeriod / listPeriods / periodProgress / formatPeriod
// helpers were exported but never imported anywhere, so they were removed —
// see git history if a richer period API is ever needed again. (The client
// keeps its own copy at client/src/modules/goal-tracking/lib/period.js.)
module.exports = {
  getCurrentPeriod,
};
