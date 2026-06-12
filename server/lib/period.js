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

// --- America/Chicago calendar-day bounds -----------------------------------
// Dashboards pick a date RANGE as 'YYYY-MM-DD' calendar days and mean Central
// business days. Naive `new Date('YYYY-MM-DD')` parses as UTC midnight and
// `endDate.setHours(...)` runs in the server's local zone (UTC on Railway), so
// windows landed ~6h early — evening Central activity fell into the next day.
// These helpers return the correct UTC ms for a Central wall-clock time and are
// DST-aware (offset resolved at the target instant). No date library needed.
const CENTRAL_TZ = 'America/Chicago';

// Offset such that: Central-wall-clock(instant) expressed as UTC = instant + offset.
function centralOffsetMs(instant) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(instant))) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  // Round to whole minutes: TZ offsets are always whole minutes, and asUTC has
  // no millisecond component (formatToParts omits ms), so without rounding the
  // source instant's ms (e.g. an end-of-day .999) would leak into the offset.
  return Math.round((asUTC - instant) / 60000) * 60000;
}

// UTC ms for the given Central wall-clock date/time. Resolves the offset at the
// target instant and re-checks once so DST-transition days land correctly.
function centralWallToUtcMs(y, m, d, H, M, S, MS) {
  const naive = Date.UTC(y, m - 1, d, H, M, S, MS);
  let utc = naive - centralOffsetMs(naive);
  const off2 = centralOffsetMs(utc);
  if (naive - off2 !== utc) utc = naive - off2;
  return utc;
}

function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// Start-of-day (00:00:00.000) Central for 'YYYY-MM-DD' → UTC ms, or null.
function centralDayStartMs(dateStr) {
  const ymd = parseYMD(dateStr);
  return ymd ? centralWallToUtcMs(ymd[0], ymd[1], ymd[2], 0, 0, 0, 0) : null;
}

// End-of-day (23:59:59.999) Central for 'YYYY-MM-DD' → UTC ms, or null.
function centralDayEndMs(dateStr) {
  const ymd = parseYMD(dateStr);
  return ymd ? centralWallToUtcMs(ymd[0], ymd[1], ymd[2], 23, 59, 59, 999) : null;
}

// Parse a dashboard range into UTC ms bounds for the Central calendar days.
// Returns { startMs, endMs } or null if either date is missing/invalid.
function parseCentralRange(start, end) {
  const startMs = centralDayStartMs(start);
  const endMs = centralDayEndMs(end);
  if (startMs == null || endMs == null) return null;
  return { startMs, endMs };
}

// Only getCurrentPeriod is consumed (server/routes/goals.js). The former
// periodBounds / shiftPeriod / listPeriods / periodProgress / formatPeriod
// helpers were exported but never imported anywhere, so they were removed —
// see git history if a richer period API is ever needed again. (The client
// keeps its own copy at client/src/modules/goal-tracking/lib/period.js.)
module.exports = {
  getCurrentPeriod,
  centralDayStartMs,
  centralDayEndMs,
  parseCentralRange,
};
