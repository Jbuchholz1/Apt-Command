const express = require('express');
const router = express.Router();
const {
  getCorporateUserByEmail,
  getClientSubsInRange,
  getInterviewsInRange,
  getPlacementsInRange,
  getRecruitingCommissions,
  getAppointmentsInRange,
  getNewJobsInRange,
  getClosedJobsInRange,
  getSalesCommissions,
  getActivePlacementsWithClient,
  getCheckinNotesForType,
  getOpenJobs,
  getCorporateUsers,
} = require('../lib/bullhorn');
const { getAllOverrides } = require('../lib/db');
const { POINTS, bhLink } = require('../lib/recruiterConfig');
const { SALES_POINTS, ACTIVITY_LABELS, ACTIVITY_ORDER } = require('../lib/salesConfig');
const { resolveRole } = require('../lib/roles');
const { requireModule } = require('../middleware/adminAuth');

router.use(requireModule('reporting_performance'));

function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
}

function formatISO(ms) {
  if (!ms) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function candidateName(c) {
  if (!c) return '';
  return `${c.firstName || ''} ${c.lastName || ''}`.trim();
}

// GET /api/performance/my-dashboard?start=2026-04-01&end=2026-04-09
router.get('/my-dashboard', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required (ISO date)' });
    }

    let email = req.user?.email;
    if (!email) {
      return res.status(401).json({ error: 'User email not available' });
    }

    // Allow managers and admins to view another user's dashboard via ?email= param
    const targetEmail = req.query.email;
    if (targetEmail && targetEmail !== email) {
      const callerRole = await resolveRole(email);
      if (callerRole !== 'admin' && callerRole !== 'manager') {
        return res.status(403).json({ error: 'Only managers and admins can view other users\' dashboards' });
      }
      email = targetEmail;
    }

    // Find the Bullhorn CorporateUser matching this email
    const corpUser = await getCorporateUserByEmail(email);
    if (!corpUser) {
      return res.json({ role: null, message: 'No Bullhorn user found for this email' });
    }

    const userId = corpUser.id;
    const fullName = `${corpUser.firstName} ${corpUser.lastName}`;
    const role = corpUser.customText1; // 'Recruiter' or 'Account Manager'
    const tier = corpUser.customDate3 ? 3 : 1;
    const spreadGoal = corpUser.customDate3 ? 9000 : 7000;

    const startMs = new Date(start).getTime();
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    const endMs = endDate.getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Calculate weeks in range
    const weeks = Math.max(1, Math.ceil((endMs - startMs) / (7 * 24 * 60 * 60 * 1000)));

    if (role === 'Recruiter') {
      return await handleRecruiter(req, res, { userId, fullName, tier, spreadGoal, weeks, startMs, endMs, email });
    } else if (role === 'Account Manager') {
      return await handleAM(req, res, { userId, fullName, tier, spreadGoal, weeks, startMs, endMs, email });
    } else {
      return res.json({ role: role || 'unknown', name: fullName, message: 'Role not recognized for performance tracking' });
    }
  } catch (err) {
    next(err);
  }
});

// --- Recruiter performance ---
async function handleRecruiter(req, res, { userId, fullName, tier, spreadGoal, weeks, startMs, endMs, email }) {
  const marGoal = weeks * POINTS.WEEKLY_TARGET; // 26/week

  // Parallel data fetch
  const [subsRes, interviewsRes, placementsRes, activePlacementsRes, trCheckinRes] = await Promise.all([
    getClientSubsInRange(startMs, endMs),
    getInterviewsInRange(startMs, endMs),
    getPlacementsInRange(startMs, endMs),
    getActivePlacementsWithClient(),
    getCheckinNotesForType('TR 30/90'),
  ]);

  const allSubs = subsRes?.data || [];
  const allInterviews = interviewsRes?.data || [];
  const allPlacements = placementsRes?.data || [];

  // Get recruiting commissions (supports split credit)
  let commissionMap = {}; // placementId → [{ id, name, percentage }, ...]
  if (allPlacements.length > 0) {
    try {
      const commRes = await getRecruitingCommissions(allPlacements.map(p => p.id));
      for (const c of (commRes?.data || [])) {
        const pId = c.placement?.id;
        if (pId && c.user) {
          if (!commissionMap[pId]) commissionMap[pId] = [];
          commissionMap[pId].push({
            id: c.user.id,
            name: `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim(),
            percentage: c.commissionPercentage || 0,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to look up recruiting commissions:', err.message);
    }
  }

  // Filter to this user
  let clientSubs = 0;
  let interviews = 0;
  let starts = 0;
  let newInput = 0;

  const subsDetail = [];
  for (const sub of allSubs) {
    if (sub.user?.id === userId) {
      clientSubs++;
      subsDetail.push({
        jobId: sub.jobOrder?.id || '',
        jobTitle: sub.jobOrder?.title || '',
        jobLink: sub.jobOrder?.id ? bhLink('JobOrder', sub.jobOrder.id) : '',
        dateAdded: formatDate(sub.dateAdded),
        companyName: sub.clientCorporation?.name || '',
        candidateId: sub.candidate?.id || '',
        candidateName: candidateName(sub.candidate),
        candidateLink: sub.candidate?.id ? bhLink('Candidate', sub.candidate.id) : '',
      });
    }
  }

  const interviewsDetail = [];
  for (const iv of allInterviews) {
    if (iv.owner?.id === userId) {
      interviews++;
      interviewsDetail.push({
        dateAdded: formatDate(iv.dateBegin),
        jobId: iv.jobOrder?.id || '',
        jobTitle: iv.jobOrder?.title || '',
        jobLink: iv.jobOrder?.id ? bhLink('JobOrder', iv.jobOrder.id) : '',
        candidateId: iv.candidateReference?.id || '',
        candidateName: candidateName(iv.candidateReference),
        candidateLink: iv.candidateReference?.id ? bhLink('Candidate', iv.candidateReference.id) : '',
      });
    }
  }

  const startsDetail = [];
  const newInputDetail = [];
  for (const p of allPlacements) {
    const commissions = commissionMap[p.id] || [];
    // Find this user's commission on the placement
    const myComm = commissions.find(c => c.id === userId);
    if (!myComm || !myComm.percentage) continue;

    const commPct = myComm.percentage;
    starts += commPct;

    const bill = Number(p.clientBillRate) || 0;
    const pay = Number(p.payRate) || 0;
    const sal = Number(p.salary) || 0;
    const feeRate = Number(p.fee) || 0;
    const empType = (p.employeeType || '').toLowerCase();
    let spread = 0;

    if (empType === 'perm' && sal > 0 && feeRate > 0) {
      spread = Math.round((sal * feeRate / 26) * 100) / 100;
    } else if (empType === 'corp-to-corp' && bill > 0 && pay > 0) {
      spread = Math.round((bill - pay * 1.05) * 40 * 100) / 100;
    } else if (bill > 0 && pay > 0) {
      spread = Math.round((bill - pay * 1.25) * 40 * 100) / 100;
    }

    if (spread > 0) {
      newInput += Math.round(spread * commPct * 100) / 100;
    }

    const client = p.jobOrder?.clientCorporation?.name || '';
    const beginMs = p.dateBegin;
    const endMs2 = p.dateEnd;
    const daysBetween = (beginMs && endMs2) ? Math.round((endMs2 - beginMs) / (1000 * 60 * 60 * 24) / 7) : '';

    startsDetail.push({
      placementId: p.id,
      placementLink: bhLink('Placement', p.id),
      client,
      candidateId: p.candidate?.id || '',
      candidateName: candidateName(p.candidate),
      candidateLink: p.candidate?.id ? bhLink('Candidate', p.candidate.id) : '',
      guarantee: endMs2 ? formatISO(endMs2) : 'Yes',
      date: formatDate(beginMs),
    });

    newInputDetail.push({
      placementId: p.id,
      placementLink: bhLink('Placement', p.id),
      employeeType: p.employeeType || '',
      candidateName: candidateName(p.candidate),
      startDate: formatDate(beginMs),
      scheduledEnd: endMs2 ? formatDate(endMs2) : '',
      daysBetween,
      guarantee: endMs2 ? formatISO(endMs2) : 'Yes',
      newInput: Math.round(spread * commPct * 100) / 100,
      client,
    });
  }

  starts = Math.ceil(starts * 4) / 4; // Round up to nearest .25
  newInput = Math.round(newInput * 100) / 100;

  // MAR = (clientSubs × 1) + (interviews × 3) + (starts × 10)
  const mar = Math.round(((clientSubs * POINTS.CLIENT_SUB) + (interviews * POINTS.INTERVIEW) + (starts * POINTS.START)) * 100) / 100;

  // --- TR Follow Ups: checkins for candidates owned by this recruiter ---
  const followUps = buildFollowUps(activePlacementsRes?.data || [], trCheckinRes, userId, 'candidate');

  // --- Overdue tasks alert ---
  const overdueTasks = await buildOverdueTasks(userId, email, followUps);

  res.json({
    role: 'Recruiter',
    name: fullName,
    tier,
    spreadGoal,
    marGoal,
    weeks,
    metrics: { clientSubs, interviews, starts, mar, newInput },
    points: {
      subsPoints: clientSubs * POINTS.CLIENT_SUB,
      interviewPoints: interviews * POINTS.INTERVIEW,
      startsPoints: Math.round(starts * POINTS.START * 100) / 100,
      total: mar,
    },
    details: {
      clientSubs: subsDetail,
      interviews: interviewsDetail,
      starts: startsDetail,
      newInput: newInputDetail,
    },
    followUps,
    overdueTasks,
  });
}

// --- Account Manager performance ---
async function handleAM(req, res, { userId, fullName, tier, spreadGoal, weeks, startMs, endMs, email }) {
  const marGoal = weeks * 30; // AM weekly target = 30

  const [apptRes, newJobsRes, closedJobsRes, placementsRes, activePlacementsRes, amCheckinRes] = await Promise.all([
    getAppointmentsInRange(startMs, endMs, [userId]),
    getNewJobsInRange(startMs, endMs),
    getClosedJobsInRange(startMs, endMs),
    getPlacementsInRange(startMs, endMs),
    getActivePlacementsWithClient(),
    getCheckinNotesForType('AM 30/90'),
  ]);

  const appointments = apptRes?.data || [];
  const newJobs = newJobsRes?.data || [];
  const closedJobs = closedJobsRes?.data || [];
  const allPlacements = placementsRes?.data || [];

  // Sales commissions (supports split credit)
  let salesCommMap = {}; // placementId → [{ id, name, percentage }, ...]
  if (allPlacements.length > 0) {
    try {
      const commRes = await getSalesCommissions(allPlacements.map(p => p.id));
      for (const c of (commRes?.data || [])) {
        const pId = c.placement?.id;
        if (pId && c.user) {
          if (!salesCommMap[pId]) salesCommMap[pId] = [];
          salesCommMap[pId].push({
            id: c.user.id,
            name: `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim(),
            percentage: c.commissionPercentage || 1,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to look up sales commissions:', err.message);
    }
  }

  // Job metrics — filter to this user
  const jobMetrics = { newReqs: 0, openings: 0, closedReqs: 0, fills: 0, losses: 0, washed: 0, newPlacements: 0 };
  const jobDetails = { newReqs: [], closedReqs: [], fills: [], losses: [], washed: [], newPlacements: [] };

  const fmtJob = (job) => ({
    jobId: job.id,
    title: job.title || '',
    status: Array.isArray(job.status) ? job.status[0] : (job.status || ''),
    openings: job.numOpenings || 0,
    client: job.clientCorporation?.name || '',
    link: bhLink('JobOrder', job.id),
  });

  for (const job of newJobs) {
    if (job.owner?.id === userId) {
      jobMetrics.newReqs++;
      jobMetrics.openings += (job.numOpenings || 0);
      jobDetails.newReqs.push(fmtJob(job));
    }
  }

  for (const job of closedJobs) {
    if (job.owner?.id !== userId) continue;
    const rawStatus = Array.isArray(job.status) ? job.status[0] : job.status;
    const status = (rawStatus || '').toLowerCase();
    const detail = fmtJob(job);
    if (status === 'filled' || status === 'placed') {
      jobMetrics.fills++;
      jobDetails.fills.push(detail);
    } else if (status === 'lost') {
      jobMetrics.losses++;
      jobDetails.losses.push(detail);
    } else if (status === 'wash') {
      jobMetrics.washed++;
      jobDetails.washed.push(detail);
    }
    jobMetrics.closedReqs++;
    jobDetails.closedReqs.push(detail);
  }

  // Placements — new placements + new input (supports split sales credit)
  let newInput = 0;
  for (const p of allPlacements) {
    const commissions = salesCommMap[p.id] || [];
    const myComm = commissions.find(c => c.id === userId);
    if (!myComm) continue;

    jobMetrics.newPlacements++;
    jobDetails.newPlacements.push({
      placementId: p.id,
      jobTitle: p.jobOrder?.title || '',
      client: p.jobOrder?.clientCorporation?.name || '',
      candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
      link: bhLink('Placement', p.id),
    });

    const bill = Number(p.clientBillRate) || 0;
    const pay = Number(p.payRate) || 0;
    const sal = Number(p.salary) || 0;
    const feeRate = Number(p.fee) || 0;
    const empType = (p.employeeType || '').toLowerCase();
    let spread = 0;

    if (empType === 'perm' && sal > 0 && feeRate > 0) {
      spread = Math.round((sal * feeRate / 26) * 100) / 100;
    } else if (empType === 'corp-to-corp' && bill > 0 && pay > 0) {
      spread = Math.round((bill - pay * 1.05) * 40 * 100) / 100;
    } else if (bill > 0 && pay > 0) {
      spread = Math.round((bill - pay * 1.25) * 40 * 100) / 100;
    }

    if (spread > 0) {
      const commPct = myComm.percentage || 1;
      newInput += Math.round(spread * commPct * 100) / 100;
    }
  }

  // Activity points — all appointments are already filtered to this user
  const activities = {};
  for (const type of ACTIVITY_ORDER) {
    activities[type] = { raw: 0, points: 0 };
  }
  let activityCount = 0;
  const activityDetails = {};

  for (const appt of appointments) {
    const type = appt.type || '';
    if (SALES_POINTS[type] !== undefined && activities[type]) {
      activities[type].raw++;
      activities[type].points += SALES_POINTS[type];
      if (type === 'New Meeting') {
        activityCount++;
      }
      const label = ACTIVITY_LABELS[type] || type;
      if (!activityDetails[label]) activityDetails[label] = [];
      activityDetails[label].push({
        id: appt.id,
        date: formatDate(appt.dateBegin),
        type: label,
        subject: appt.subject || '',
        client: appt.clientContactReference?.clientCorporation?.name || appt.jobOrder?.clientCorporation?.name || '',
      });
    }
  }

  // Calculate MAR = sum of all activity points
  let mar = 0;
  const activityPoints = {};
  for (const type of ACTIVITY_ORDER) {
    const pts = Math.round(activities[type].points * 100) / 100;
    activityPoints[ACTIVITY_LABELS[type] || type] = pts;
    mar += pts;
  }
  mar = Math.round(mar * 100) / 100;
  newInput = Math.round(newInput * 100) / 100;

  // --- AM Follow Ups: checkins for placements on jobs owned by this AM ---
  const followUps = buildFollowUps(activePlacementsRes?.data || [], amCheckinRes, userId, 'jobOrder');

  // --- Overdue tasks alert ---
  const overdueTasks = await buildOverdueTasks(userId, email, followUps);

  res.json({
    role: 'Account Manager',
    name: fullName,
    tier,
    spreadGoal,
    marGoal,
    weeks,
    jobMetrics,
    jobDetails,
    activityPoints,
    activityDetails,
    activityCount,
    noteActivity: 0,
    mar,
    newInput,
    followUps,
    overdueTasks,
  });
}

// --- Urgency helpers (server-side replication of client urgency.js) ---

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

function isOverdue(dateStr, emptyLabel) {
  const val = (dateStr || '').trim();
  if (!val || val.toLowerCase() === emptyLabel) return true;
  const date = parseDateFromText(val);
  if (!date) return true;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() <= today.getTime();
}

function isFollowUpOverdue(str) { return isOverdue(str, 'no follow up'); }
function isDeadlineOverdue(str) { return isOverdue(str, 'no deadline'); }

// --- Build overdue tasks for a user ---

async function buildOverdueTasks(userId, email, followUps) {
  // Fetch open jobs + overrides
  const [jobsRes, overrides] = await Promise.all([getOpenJobs(), getAllOverrides()]);
  const jobs = jobsRes?.data || [];

  const BH_BASE = 'https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm';
  const overdueFollowUps = [];
  const missedDeadlines = [];

  for (const job of jobs) {
    const status = Array.isArray(job.status) ? job.status[0] : (job.status || '');
    if (!['Accepting Candidates', 'Covered', 'Offer Out'].includes(status)) continue;

    const ov = overrides[job.id];
    const followUp = ov?.follow_up || '';
    const deadline = ov?.deadline || '';
    const ownerId = job.owner?.id;
    const assignedIds = (job.assignedUsers?.data || []).map(u => u.id);

    // Check if this user is associated (as TR via assignedUsers, or as AM via owner)
    const isAssociated = ownerId === userId || assignedIds.includes(userId);
    if (!isAssociated) continue;

    const title = job.title || '';
    const client = job.clientCorporation?.name || '';
    const jobLink = `${BH_BASE}?Entity=JobOrder&id=${job.id}`;

    if (isFollowUpOverdue(followUp)) {
      overdueFollowUps.push({
        jobId: job.id,
        jobLink,
        title,
        client,
        value: followUp || 'No follow up set',
      });
    }

    if (isDeadlineOverdue(deadline)) {
      missedDeadlines.push({
        jobId: job.id,
        jobLink,
        title,
        client,
        value: deadline || 'No deadline set',
      });
    }
  }

  // Overdue check-ins from followUps data
  const overdueCheckins = [];
  for (const fu of (followUps || [])) {
    if (fu.thirtyDay === 'Overdue' || fu.ninetyDay === 'Overdue') {
      const reasons = [];
      if (fu.thirtyDay === 'Overdue') reasons.push(`30-day overdue (started ${fu.daysSinceStart}d ago)`);
      if (fu.ninetyDay === 'Overdue') reasons.push(`90-day overdue (started ${fu.daysSinceStart}d ago)`);
      overdueCheckins.push({
        candidateId: fu.candidateId,
        candidateLink: fu.candidateLink,
        candidate: fu.candidate,
        client: fu.client,
        reason: reasons.join(', '),
      });
    }
  }

  // Goal-task alerts: tasks assigned to this user that are overdue or due within 7 days
  const goalTasksOverdue = [];
  const goalTasksUpcoming = [];
  try {
    const db = require('../lib/db');
    const tasks = await db.listGoalTasksForUser(email);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in7Days = new Date(today.getTime() + 7 * 86400 * 1000);
    for (const t of tasks) {
      const due = new Date(t.due_date + 'T00:00:00');
      const row = {
        taskId: t.id,
        goalId: t.goal_id,
        goalName: t.goals?.name || '',
        title: t.title,
        dueDate: t.due_date,
      };
      if (due < today) goalTasksOverdue.push(row);
      else if (due <= in7Days) goalTasksUpcoming.push(row);
    }
  } catch (err) {
    console.error('[performance] goal tasks fetch failed:', err.message);
  }

  return {
    total: overdueFollowUps.length + missedDeadlines.length + overdueCheckins.length
      + goalTasksOverdue.length + goalTasksUpcoming.length,
    overdueFollowUps,
    missedDeadlines,
    overdueCheckins,
    goalTasksOverdue,
    goalTasksUpcoming,
  };
}

// --- Shared: build follow-up checkin list for a user ---
// ownerPath: 'candidate' = filter by candidate.owner.id (TR), 'jobOrder' = filter by jobOrder.owner.id (AM)
function buildFollowUps(activePlacements, checkinResult, userId, ownerPath) {
  const { checkinDaysByCandidate } = checkinResult;
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const BH_BASE = 'https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm';
  const items = [];

  for (const p of activePlacements) {
    if (!p.dateBegin) continue;

    // Filter to this user's candidates (TR) or this user's jobs (AM)
    if (ownerPath === 'candidate' && p.candidate?.owner?.id !== userId) continue;
    if (ownerPath === 'jobOrder' && p.jobOrder?.owner?.id !== userId) continue;

    const daysSinceStart = Math.floor((now - p.dateBegin) / DAY_MS);
    if (daysSinceStart < 30) continue;
    if (daysSinceStart > 365) continue; // Only placements started within last 12 months

    const candidateId = p.candidate?.id;
    const candidateName = p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '';
    const client = p.jobOrder?.clientCorporation?.name || '';
    const jobTitle = p.jobOrder?.title || '';
    const startDate = formatDate(p.dateBegin);
    // Distinct check-in days disambiguate the shared 30/90 action: the 1st day
    // satisfies the 30-day, the 2nd satisfies the 90-day. Same as the Client
    // Health gauge, so the two modules agree on identical data.
    const distinctCheckinDays = candidateId ? (checkinDaysByCandidate.get(candidateId)?.size || 0) : 0;

    const thirtyDue = daysSinceStart >= 30;
    const ninetyDue = daysSinceStart >= 90;

    const thirtyStatus = thirtyDue ? (distinctCheckinDays >= 1 ? 'Done' : 'Overdue') : 'Not yet due';
    const ninetyStatus = ninetyDue ? (distinctCheckinDays >= 2 ? 'Done' : 'Overdue') : 'Not yet due';

    items.push({
      candidateId: candidateId || null,
      candidateLink: candidateId ? `${BH_BASE}?Entity=Candidate&id=${candidateId}` : null,
      placementId: p.id,
      placementLink: `${BH_BASE}?Entity=Placement&id=${p.id}`,
      candidate: candidateName,
      client,
      jobTitle,
      startDate,
      daysSinceStart,
      thirtyDay: thirtyStatus,
      ninetyDay: ninetyStatus,
    });
  }

  items.sort((a, b) => b.daysSinceStart - a.daysSinceStart);
  return items;
}

// GET /api/performance/users — List Bullhorn users for admin dropdown
router.get('/users', async (req, res, next) => {
  try {
    const callerRole = await resolveRole(req.user?.email);
    if (callerRole !== 'admin' && callerRole !== 'manager') {
      return res.status(403).json({ error: 'Manager or admin access required' });
    }

    const usersResult = await getCorporateUsers();
    const users = (usersResult?.data || [])
      .map(u => ({
        id: u.id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        role: u.customText1 || '',
        email: u.email || '',
      }))
      .filter(u => u.name && u.email)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ users });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
