const express = require('express');
const router = express.Router();
const {
  getRecruiterUsers,
  getClientSubsInRange,
  getInterviewsInRange,
  getPlacementsInRange,
  getRecruitingCommissions,
  getAMUsers,
  getAppointmentsInRange,
  getNewJobsInRange,
  getClosedJobsInRange,
  getSalesCommissions,
} = require('../lib/bullhorn');
const { POINTS, getRecruiterTier, getSpreadGoal, bhLink } = require('../lib/recruiterConfig');
const { SALES_POINTS, ACTIVITY_LABELS, ACTIVITY_ORDER, EXCLUDED_AMS, getAMTier, getAMSpreadGoal } = require('../lib/salesConfig');

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

// GET /api/reporting/recruiter-dashboard?start=2026-04-01&end=2026-04-09
router.get('/recruiter-dashboard', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required (ISO date)' });
    }

    const startMs = new Date(start).getTime();
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    const endMs = endDate.getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      return res.status(400).json({ error: 'Invalid date format. Use ISO dates like 2026-04-01' });
    }

    // Dynamic goal based on weeks in date range
    const diffMs = endMs - startMs;
    const weeks = Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
    const goalForRange = weeks * POINTS.WEEKLY_TARGET;

    // Fire 4 parallel Bullhorn queries
    const [recruitersRes, subsRes, interviewsRes, placementsRes] = await Promise.all([
      getRecruiterUsers(),
      getClientSubsInRange(startMs, endMs),
      getInterviewsInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
    ]);

    const recruiters = recruitersRes?.data || [];
    const subs = subsRes?.data || [];
    const interviews = interviewsRes?.data || [];
    const placements = placementsRes?.data || [];

    // Look up recruiting commissions for placements
    let commissionMap = {}; // placementId → { recruiterId, recruiterName, percentage }
    if (placements.length > 0) {
      const placementIds = placements.map(p => p.id);
      try {
        const commRes = await getRecruitingCommissions(placementIds);
        const commissions = commRes?.data || [];
        for (const c of commissions) {
          const pId = c.placement?.id;
          if (pId && c.user) {
            commissionMap[pId] = {
              id: c.user.id,
              name: `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim(),
              percentage: c.commissionPercentage || 1,
            };
          }
        }
      } catch (err) {
        console.warn('Failed to look up placement commissions:', err.message);
      }
    }

    // Build recruiter name lookup
    const recruiterNames = {};
    for (const r of recruiters) {
      recruiterNames[r.id] = `${r.firstName} ${r.lastName}`;
    }

    // Build per-recruiter metrics map
    const metricsMap = {};
    for (const r of recruiters) {
      const name = recruiterNames[r.id];
      metricsMap[r.id] = {
        id: r.id,
        name,
        tier: getRecruiterTier(name),
        spreadGoal: getSpreadGoal(name),
        metrics: { clientSubs: 0, interviews: 0, starts: 0, mar: 0, newInput: 0 },
        points: { subsPoints: 0, interviewPoints: 0, startsPoints: 0, total: 0 },
      };
    }

    // --- Build detail arrays ---

    // Client subs detail (from Sendout entity, user = recruiter)
    const subsDetail = [];
    for (const sub of subs) {
      const userId = sub.user?.id;
      if (userId && metricsMap[userId]) {
        metricsMap[userId].metrics.clientSubs++;
      }
      subsDetail.push({
        submittedBy: recruiterNames[userId] || (sub.user ? `${sub.user.firstName || ''} ${sub.user.lastName || ''}`.trim() : ''),
        jobId: sub.jobOrder?.id || '',
        jobTitle: sub.jobOrder?.title || '',
        jobLink: sub.jobOrder?.id ? bhLink('JobOrder', sub.jobOrder.id) : '',
        dateAdded: formatDate(sub.dateAdded),
        companyName: sub.clientCorporation?.name || '',
        candidateId: sub.candidate?.id || '',
        candidateName: candidateName(sub.candidate),
        candidateLink: sub.candidate?.id ? bhLink('Candidate', sub.candidate.id) : '',
        recruiterId: userId,
      });
    }

    // Interviews detail (from Appointment where type=Interview, owner = recruiter)
    const interviewsDetail = [];
    for (const iv of interviews) {
      const userId = iv.owner?.id;
      if (userId && metricsMap[userId]) {
        metricsMap[userId].metrics.interviews++;
      }
      interviewsDetail.push({
        recruiter: recruiterNames[userId] || (iv.owner ? `${iv.owner.firstName || ''} ${iv.owner.lastName || ''}`.trim() : ''),
        dateAdded: formatDate(iv.dateBegin),
        jobId: iv.jobOrder?.id || '',
        jobTitle: iv.jobOrder?.title || '',
        jobLink: iv.jobOrder?.id ? bhLink('JobOrder', iv.jobOrder.id) : '',
        candidateId: iv.candidateReference?.id || '',
        candidateName: candidateName(iv.candidateReference),
        candidateLink: iv.candidateReference?.id ? bhLink('Candidate', iv.candidateReference.id) : '',
        recruiterId: userId,
      });
    }

    // Starts + New Input detail (from Placement, recruiter = submission sendingUser)
    const startsDetail = [];
    const newInputDetail = [];
    for (const p of placements) {
      // Look up recruiter and commission split from PlacementCommission
      const commission = commissionMap[p.id];
      const recruiterId = commission?.id;
      const recruiterName = commission?.name || '';
      const commPct = commission?.percentage || 0;

      if (recruiterId && metricsMap[recruiterId] && commPct > 0) {
        metricsMap[recruiterId].metrics.starts += commPct;
      }

      const bill = Number(p.clientBillRate) || 0;
      const pay = Number(p.payRate) || 0;
      const sal = Number(p.salary) || 0;
      const feeRate = Number(p.fee) || 0;
      const empType = (p.employeeType || '').toLowerCase();
      let spread = 0;

      if (empType === 'perm' && sal > 0 && feeRate > 0) {
        spread = Math.round((sal * feeRate / 26) * 100) / 100;
      } else if (empType === 'corp-to-corp' && bill > 0 && pay > 0) {
        spread = Math.round((bill - pay * 1.05) * 10 * 100) / 100;
      } else if (bill > 0 && pay > 0) {
        // W2 and all other types: burden on pay
        spread = Math.round((bill - pay * 1.25) * 40 * 100) / 100;
      }

      if (spread > 0 && recruiterId && metricsMap[recruiterId]) {
        metricsMap[recruiterId].metrics.newInput += spread;
      }

      const client = p.jobOrder?.clientCorporation?.name || '';
      const beginMs = p.dateBegin;
      const endMs2 = p.dateEnd;
      const daysBetween = (beginMs && endMs2) ? Math.round((endMs2 - beginMs) / (1000 * 60 * 60 * 24) / 7) : '';

      startsDetail.push({
        recruiter: recruiterName,
        placementId: p.id,
        placementLink: bhLink('Placement', p.id),
        client,
        candidateId: p.candidate?.id || '',
        candidateName: candidateName(p.candidate),
        candidateLink: p.candidate?.id ? bhLink('Candidate', p.candidate.id) : '',
        guarantee: endMs2 ? formatISO(endMs2) : 'Yes',
        date: formatDate(beginMs),
        recruiterId,
      });

      newInputDetail.push({
        recruiter: recruiterName,
        placementId: p.id,
        placementLink: bhLink('Placement', p.id),
        employeeType: p.employeeType || '',
        candidateName: candidateName(p.candidate),
        startDate: formatDate(beginMs),
        scheduledEnd: endMs2 ? formatDate(endMs2) : '',
        daysBetween,
        guarantee: endMs2 ? formatISO(endMs2) : 'Yes',
        newInput: spread,
        recruiterId,
        client,
      });
    }

    // Calculate MAR and points
    const totals = { clientSubs: 0, interviews: 0, starts: 0, mar: 0, newInput: 0 };
    const recruiterList = Object.values(metricsMap).map(r => {
      const m = r.metrics;
      m.starts = Math.round(m.starts * 100) / 100;
      m.mar = Math.round(((m.clientSubs * POINTS.CLIENT_SUB) + (m.interviews * POINTS.INTERVIEW) + (m.starts * POINTS.START)) * 100) / 100;
      m.newInput = Math.round(m.newInput * 100) / 100;

      r.points.subsPoints = m.clientSubs * POINTS.CLIENT_SUB;
      r.points.interviewPoints = m.interviews * POINTS.INTERVIEW;
      r.points.startsPoints = Math.round(m.starts * POINTS.START * 100) / 100;
      r.points.total = m.mar;

      totals.clientSubs += m.clientSubs;
      totals.interviews += m.interviews;
      totals.starts += m.starts;
      totals.mar += m.mar;
      totals.newInput += m.newInput;

      return r;
    });

    totals.newInput = Math.round(totals.newInput * 100) / 100;

    res.json({
      dateRange: { start, end },
      weeklyTarget: POINTS.WEEKLY_TARGET,
      goalForRange,
      weeks,
      recruiters: recruiterList,
      totals,
      details: {
        interviews: interviewsDetail,
        clientSubs: subsDetail,
        starts: startsDetail,
        newInput: newInputDetail,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reporting/sales-dashboard?start=2026-04-01&end=2026-04-09
router.get('/sales-dashboard', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required (ISO date)' });
    }

    const startMs = new Date(start).getTime();
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    const endMs = endDate.getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Fire parallel queries
    const [amRes, apptRes, newJobsRes, closedJobsRes, placementsRes] = await Promise.all([
      getAMUsers(),
      getAppointmentsInRange(startMs, endMs),
      getNewJobsInRange(startMs, endMs),
      getClosedJobsInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
    ]);

    const ams = (amRes?.data || []).filter(am => !EXCLUDED_AMS.has(`${am.firstName} ${am.lastName}`));
    const appointments = apptRes?.data || [];
    const newJobs = newJobsRes?.data || [];
    const closedJobs = closedJobsRes?.data || [];
    const placements = placementsRes?.data || [];

    // Sales commissions for placements
    let salesCommMap = {};
    if (placements.length > 0) {
      try {
        const commRes = await getSalesCommissions(placements.map(p => p.id));
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

    // AM name lookup and metrics map
    const amNames = {};
    const amIds = new Set();
    const metricsMap = {};
    for (const am of ams) {
      const name = `${am.firstName} ${am.lastName}`;
      amNames[am.id] = name;
      amIds.add(am.id);
      metricsMap[am.id] = {
        id: am.id,
        name,
        tier: getAMTier(name),
        spreadGoal: getAMSpreadGoal(name),
        jobMetrics: { newReqs: 0, openings: 0, closedReqs: 0, fills: 0, losses: 0, washed: 0, newPlacements: 0 },
        activities: {},
        activityCount: 0,
        noteActivity: 0,
        mar: 0,
        newInput: 0,
      };
      // Initialize all activity types to 0
      for (const type of ACTIVITY_ORDER) {
        metricsMap[am.id].activities[type] = { raw: 0, points: 0 };
      }
    }

    // --- Job metrics ---
    for (const job of newJobs) {
      const ownerId = job.owner?.id;
      if (ownerId && metricsMap[ownerId]) {
        metricsMap[ownerId].jobMetrics.newReqs++;
        metricsMap[ownerId].jobMetrics.openings += (job.numOpenings || 0);
      }
    }

    for (const job of closedJobs) {
      const ownerId = job.owner?.id;
      if (ownerId && metricsMap[ownerId]) {
        const rawStatus = Array.isArray(job.status) ? job.status[0] : job.status;
        const status = (rawStatus || '').toLowerCase();
        if (status === 'filled') metricsMap[ownerId].jobMetrics.fills++;
        else if (status === 'lost') metricsMap[ownerId].jobMetrics.losses++;
        else if (status === 'wash') metricsMap[ownerId].jobMetrics.washed++;
        metricsMap[ownerId].jobMetrics.closedReqs++;
      }
    }

    // --- Placements (New Placements + New Input) ---
    for (const p of placements) {
      const comm = salesCommMap[p.id];
      const amId = comm?.id;
      if (amId && metricsMap[amId]) {
        metricsMap[amId].jobMetrics.newPlacements++;

        const bill = Number(p.clientBillRate) || 0;
        const pay = Number(p.payRate) || 0;
        const sal = Number(p.salary) || 0;
        const feeRate = Number(p.fee) || 0;
        const empType = (p.employeeType || '').toLowerCase();
        let spread = 0;

        if (empType === 'perm' && sal > 0 && feeRate > 0) {
          spread = Math.round((sal * feeRate / 26) * 100) / 100;
        } else if (empType === 'corp-to-corp' && bill > 0 && pay > 0) {
          spread = Math.round((bill - pay * 1.05) * 10 * 100) / 100;
        } else if (bill > 0 && pay > 0) {
          spread = Math.round((bill - pay * 1.25) * 40 * 100) / 100;
        }

        if (spread > 0) {
          metricsMap[amId].newInput += spread;
        }
      }
    }

    // --- Appointments (activity points) ---
    for (const appt of appointments) {
      const ownerId = appt.owner?.id;
      const type = appt.type || '';
      if (ownerId && metricsMap[ownerId] && SALES_POINTS[type] !== undefined) {
        metricsMap[ownerId].activities[type].raw++;
        metricsMap[ownerId].activities[type].points += SALES_POINTS[type];
        metricsMap[ownerId].activityCount++;
      }
    }

    // --- Calculate MAR and build response ---
    const amList = Object.values(metricsMap).map(am => {
      let mar = 0;
      const activityPoints = {};
      for (const type of ACTIVITY_ORDER) {
        const pts = Math.round(am.activities[type].points * 100) / 100;
        activityPoints[ACTIVITY_LABELS[type] || type] = pts;
        mar += pts;
      }
      am.mar = Math.round(mar * 100) / 100;
      am.newInput = Math.round(am.newInput * 100) / 100;
      am.activityPoints = activityPoints;
      return am;
    });

    res.json({
      dateRange: { start, end },
      ams: amList,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
