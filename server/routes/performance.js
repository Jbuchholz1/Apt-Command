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
} = require('../lib/bullhorn');
const { POINTS, bhLink } = require('../lib/recruiterConfig');
const { SALES_POINTS, ACTIVITY_LABELS, ACTIVITY_ORDER } = require('../lib/salesConfig');

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

    const email = req.user?.email;
    if (!email) {
      return res.status(401).json({ error: 'User email not available' });
    }

    // Find the Bullhorn CorporateUser matching this MSAL email
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
      return await handleRecruiter(req, res, { userId, fullName, tier, spreadGoal, weeks, startMs, endMs });
    } else if (role === 'Account Manager') {
      return await handleAM(req, res, { userId, fullName, tier, spreadGoal, weeks, startMs, endMs });
    } else {
      return res.json({ role: role || 'unknown', name: fullName, message: 'Role not recognized for performance tracking' });
    }
  } catch (err) {
    next(err);
  }
});

// --- Recruiter performance ---
async function handleRecruiter(req, res, { userId, fullName, tier, spreadGoal, weeks, startMs, endMs }) {
  const marGoal = weeks * POINTS.WEEKLY_TARGET; // 26/week

  // Parallel data fetch
  const [subsRes, interviewsRes, placementsRes] = await Promise.all([
    getClientSubsInRange(startMs, endMs),
    getInterviewsInRange(startMs, endMs),
    getPlacementsInRange(startMs, endMs),
  ]);

  const allSubs = subsRes?.data || [];
  const allInterviews = interviewsRes?.data || [];
  const allPlacements = placementsRes?.data || [];

  // Get recruiting commissions
  let commissionMap = {};
  if (allPlacements.length > 0) {
    try {
      const commRes = await getRecruitingCommissions(allPlacements.map(p => p.id));
      for (const c of (commRes?.data || [])) {
        const pId = c.placement?.id;
        if (pId && c.user) {
          commissionMap[pId] = {
            id: c.user.id,
            name: `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim(),
            percentage: c.commissionPercentage || 0,
          };
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
    const commission = commissionMap[p.id];
    if (commission?.id !== userId || !commission.percentage) continue;

    const commPct = commission.percentage;
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
      newInput: spread,
      client,
    });
  }

  starts = Math.round(starts * 100) / 100;
  newInput = Math.round(newInput * 100) / 100;

  // MAR = (clientSubs × 1) + (interviews × 3) + (starts × 10)
  const mar = Math.round(((clientSubs * POINTS.CLIENT_SUB) + (interviews * POINTS.INTERVIEW) + (starts * POINTS.START)) * 100) / 100;

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
  });
}

// --- Account Manager performance ---
async function handleAM(req, res, { userId, fullName, tier, spreadGoal, weeks, startMs, endMs }) {
  const marGoal = weeks * 30; // AM weekly target = 30

  const [apptRes, newJobsRes, closedJobsRes, placementsRes] = await Promise.all([
    getAppointmentsInRange(startMs, endMs, [userId]),
    getNewJobsInRange(startMs, endMs),
    getClosedJobsInRange(startMs, endMs),
    getPlacementsInRange(startMs, endMs),
  ]);

  const appointments = apptRes?.data || [];
  const newJobs = newJobsRes?.data || [];
  const closedJobs = closedJobsRes?.data || [];
  const allPlacements = placementsRes?.data || [];

  // Sales commissions
  let salesCommMap = {};
  if (allPlacements.length > 0) {
    try {
      const commRes = await getSalesCommissions(allPlacements.map(p => p.id));
      for (const c of (commRes?.data || [])) {
        const pId = c.placement?.id;
        if (pId && c.user) {
          salesCommMap[pId] = {
            id: c.user.id,
            name: `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim(),
            percentage: c.commissionPercentage || 1,
          };
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

  // Placements — new placements + new input
  let newInput = 0;
  for (const p of allPlacements) {
    const comm = salesCommMap[p.id];
    if (comm?.id !== userId) continue;

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
      const commPct = comm?.percentage || 1;
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
  });
}

module.exports = router;
