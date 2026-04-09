/**
 * Try to extract a date from a free-text string.
 * Supports formats like "4/5", "4/5/26", "4/5 Closes", "4/5 @ 2pm"
 * Returns a Date object or null if no date found.
 */
function parseDateFromText(str) {
  if (!str) return null;
  const now = new Date();
  const match = str.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!match) return null;

  const month = parseInt(match[1], 10) - 1;
  const day = parseInt(match[2], 10);
  let year = match[3] ? parseInt(match[3], 10) : now.getFullYear();
  if (year < 100) year += 2000;

  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
}

function getDaysFromToday(dateStr) {
  const date = parseDateFromText(dateStr);
  if (!date) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Deadline urgency: red (no date or past), yellow (within 2 days), green (>2 days)
 */
export function getDeadlineUrgency(deadlineStr) {
  const dl = (deadlineStr || '').trim();
  if (!dl || dl.toLowerCase() === 'no deadline') return 'red';
  const diff = getDaysFromToday(dl);
  if (diff === null) return 'red';
  if (diff <= 0) return 'red';
  if (diff <= 2) return 'yellow';
  return 'green';
}

/**
 * Follow Up urgency: red (no date or past), yellow (within 2 days), green (>2 days)
 */
export function getFollowUpUrgency(followUpStr) {
  const fu = (followUpStr || '').trim();
  if (!fu || fu.toLowerCase() === 'no follow up') return 'red';
  const diff = getDaysFromToday(fu);
  if (diff === null) return 'red';   // Has text but no parseable date — treat as missed
  if (diff <= 0) return 'red';       // Past due
  if (diff <= 2) return 'yellow';    // Within 2 days
  return 'green';                    // More than 2 days out
}

/**
 * Determine TR cell color based on 48hr clock and client submissions.
 * Returns: 'red' (48hrs passed, no sub since assignment), 'yellow' (reassigned, within window), or null
 */
export function getTrUrgency(job) {
  if (!job.recruiter || !job.recruiter.trim()) return null; // no TR assigned
  if (!job.trAssignedAt) return null; // no tracked assignment time

  const assignedAt = new Date(job.trAssignedAt).getTime();
  const now = Date.now();
  const hoursSinceAssignment = (now - assignedAt) / (1000 * 60 * 60);

  // Check if there's a client sub after the assignment
  const latestSub = job.latestClientSubDate ? new Date(job.latestClientSubDate).getTime() : 0;
  const hasSubSinceAssignment = latestSub > assignedAt;

  if (hasSubSinceAssignment) {
    // They submitted after assignment — yellow if reassigned, otherwise clear
    return job.trReassigned ? 'yellow' : null;
  }

  // No sub since assignment
  if (hoursSinceAssignment >= 48) return 'red'; // 48hrs passed, no sub
  if (job.trReassigned) return 'yellow'; // reassigned but still within window
  return null; // first assignment, still within 48hrs
}
