import { getFollowUpUrgency, getTrUrgency } from './urgency';

/**
 * Parse a date from free-text string (M/D, M/D/YY, M/D/YYYY).
 * Returns days from today, or null if no date found.
 */
function getDaysFromToday(str) {
  if (!str) return null;
  const now = new Date();
  const match = str.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!match) return null;
  const month = parseInt(match[1], 10) - 1;
  const day = parseInt(match[2], 10);
  let year = match[3] ? parseInt(match[3], 10) : now.getFullYear();
  if (year < 100) year += 2000;
  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
}

function getDeadlineUrgencyLocal(deadlineStr) {
  const dl = (deadlineStr || '').trim();
  if (!dl || dl.toLowerCase() === 'no deadline') return 'red';
  const diff = getDaysFromToday(dl);
  if (diff === null) return 'red';
  if (diff <= 0) return 'red';
  if (diff <= 2) return 'yellow';
  return 'green';
}

/**
 * Returns true if the job is "Not Published" in Bullhorn (isPublic === 0).
 * Jobs pending approval (isPublic === -1) and live jobs (isPublic === 1) are NOT flagged.
 */
export function isUnpublished(job) {
  return job.isPublic === 0;
}

const RED_BOX_EXCLUDED_STATUSES = new Set(['Archive', 'Placed', 'Lost', 'Wash', 'Filled']);

/**
 * Returns true if a job has any "red box" condition.
 * Add future red box conditions here.
 *
 * @param {Object} job
 * @param {Set<number>} [expiredJobIds] - optional Set of jobIds whose active
 *   contractor has an end date in the past. O(1) lookup.
 */
export function hasRedBox(job, expiredJobIds) {
  // Closed/terminal-status jobs don't raise alerts even if deadline/followUp went red
  if (RED_BOX_EXCLUDED_STATUSES.has(job?.status)) return false;
  // Active contractor on this job has an expired end date
  if (expiredJobIds && expiredJobIds.has(job.id)) return true;
  // Missed or past-due follow-up
  if (getFollowUpUrgency(job.followUp) === 'red') return true;
  // Missed or past-due deadline
  if (getDeadlineUrgencyLocal(job.deadline) === 'red') return true;
  // TR: 48hrs passed with no client submission
  if (getTrUrgency(job) === 'red') return true;
  // Job not published in Bullhorn
  if (isUnpublished(job)) return true;
  // Add future red box conditions here
  return false;
}
