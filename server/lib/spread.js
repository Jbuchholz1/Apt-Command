/**
 * Centralized contractor-spread math.
 *
 * Used ONLY by the two per-individual views — the "On The Board" counter
 * (server/routes/jobs.js) and the "Active Contractors" modal
 * (server/routes/placements.js). Both compute spread from the individual's
 * submission/placement record, NOT the job-order posted rates. The job-grid
 * "CE $" column, the dashboards, client-health, and the Excel export keep
 * their own legacy formulas and intentionally do NOT call this helper.
 *
 * Weekly contractor spread:
 *
 *   ( billRate − billRate×(vmsFee/100) − hourlyReferral − payRate×burden ) × 40
 *
 *   burden          1.05 for Corp-to-Corp, 1.25 for every other contract type
 *                   (unchanged — these markups are fixed)
 *   vmsFee          JobSubmission.customFloat2 ("VMS Fee"), entered as a WHOLE
 *                   PERCENT (3 → 3%), so we divide by 100 here
 *   hourlyReferral  JobSubmission.customFloat5 ("Hourly Referral"), dollars/hour
 *
 * When NEITHER vmsFee nor hourlyReferral is present the expression collapses to
 * the legacy ( billRate − payRate×burden ) × 40 and hasFeeData is false, so the
 * caller can flag the figure (the Req Board renders it red) as "fees not yet
 * entered on the submission".
 *
 * Direct Hire / perm placements never use this — their weekly figure is the
 * amortized fee ( salary × fee ) / 26, via permWeeklyFee().
 */

function burdenFor(employmentType) {
  return (employmentType || '').toLowerCase() === 'corp-to-corp' ? 1.05 : 1.25;
}

/**
 * @returns {{ spread: number|null, hasFeeData: boolean }}
 *   spread is null when pay/bill rates are missing (nothing to compute).
 *   hasFeeData is false when both VMS Fee and Hourly Referral are absent —
 *   the caller should flag such a spread as a legacy estimate.
 */
function contractorWeeklySpread({ payRate, billRate, employmentType, vmsFee, hourlyReferral } = {}) {
  const pay = Number(payRate) || 0;
  const bill = Number(billRate) || 0;
  const vmsPct = Number(vmsFee) || 0;            // whole percent, e.g. 3 for 3%
  const referral = Number(hourlyReferral) || 0;  // dollars per hour
  const hasFeeData = vmsPct > 0 || referral > 0;

  if (pay <= 0 || bill <= 0) return { spread: null, hasFeeData };

  const burden = burdenFor(employmentType);
  const weekly = (bill - bill * (vmsPct / 100) - referral - pay * burden) * 40;
  return { spread: Math.round(weekly * 100) / 100, hasFeeData };
}

/** Amortized weekly perm fee for Direct Hire placements: (salary × fee) / 26. */
function permWeeklyFee({ salary, fee } = {}) {
  const sal = Number(salary) || 0;
  const f = Number(fee) || 0;
  if (sal <= 0 || f <= 0) return null;
  return Math.round((sal * f / 26) * 100) / 100;
}

module.exports = { contractorWeeklySpread, permWeeklyFee, burdenFor };
