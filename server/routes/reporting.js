const express = require('express');
const router = express.Router();
const {
  getRecruiterUsers,
  getClientSubsInRange,
  getInterviewsInRange,
  getPlacementsInRange,
} = require('../lib/bullhorn');
const { POINTS, getRecruiterTier, getSpreadGoal, bhLink } = require('../lib/recruiterConfig');

function formatDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
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

    // Fire all 4 Bullhorn queries in parallel
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

    // Client subs detail
    const subsDetail = [];
    for (const sub of subs) {
      const userId = sub.sendingUser?.id;
      if (userId && metricsMap[userId]) {
        metricsMap[userId].metrics.clientSubs++;
      }
      subsDetail.push({
        submittedBy: recruiterNames[userId] || `User ${userId}`,
        jobId: sub.jobOrder?.id || '',
        jobTitle: sub.jobOrder?.title || '',
        jobLink: sub.jobOrder?.id ? bhLink('JobOrder', sub.jobOrder.id) : '',
        dateAdded: formatDate(sub.dateAdded),
        companyName: sub.jobOrder?.clientCorporation?.name || '',
        candidateId: sub.candidate?.id || '',
        candidateName: candidateName(sub.candidate),
        candidateLink: sub.candidate?.id ? bhLink('Candidate', sub.candidate.id) : '',
        recruiterId: userId,
      });
    }

    // Interviews detail
    const interviewsDetail = [];
    for (const iv of interviews) {
      const userId = iv.sendingUser?.id;
      if (userId && metricsMap[userId]) {
        metricsMap[userId].metrics.interviews++;
      }
      interviewsDetail.push({
        recruiter: recruiterNames[userId] || `User ${userId}`,
        dateAdded: formatDate(iv.dateAdded),
        jobId: iv.jobOrder?.id || '',
        jobTitle: iv.jobOrder?.title || '',
        jobLink: iv.jobOrder?.id ? bhLink('JobOrder', iv.jobOrder.id) : '',
        candidateId: iv.candidate?.id || '',
        candidateName: candidateName(iv.candidate),
        candidateLink: iv.candidate?.id ? bhLink('Candidate', iv.candidate.id) : '',
        recruiterId: userId,
      });
    }

    // Starts + New Input detail
    const startsDetail = [];
    const newInputDetail = [];
    for (const p of placements) {
      const userId = p.owner?.id;
      if (userId && metricsMap[userId]) {
        metricsMap[userId].metrics.starts++;
      }

      const bill = Number(p.clientBillRate) || 0;
      const pay = Number(p.payRate) || 0;
      let spread = 0;
      if (bill > 0 && pay > 0) {
        spread = Math.round(((bill - pay) * 1.25) * 40 * 100) / 100;
        if (userId && metricsMap[userId]) {
          metricsMap[userId].metrics.newInput += spread;
        }
      }

      const client = p.jobOrder?.clientCorporation?.name || '';
      const beginMs = p.dateBegin;
      const endMs2 = p.dateEnd;
      const daysBetween = (beginMs && endMs2) ? Math.round((endMs2 - beginMs) / (1000 * 60 * 60 * 24) / 7) : '';

      startsDetail.push({
        recruiter: recruiterNames[userId] || `User ${userId}`,
        placementId: p.id,
        placementLink: bhLink('Placement', p.id),
        client,
        candidateId: p.candidate?.id || '',
        candidateName: candidateName(p.candidate),
        candidateLink: p.candidate?.id ? bhLink('Candidate', p.candidate.id) : '',
        guarantee: endMs2 ? formatISO(endMs2) : 'Yes',
        date: formatDate(beginMs),
        recruiterId: userId,
      });

      newInputDetail.push({
        recruiter: recruiterNames[userId] || `User ${userId}`,
        placementId: p.id,
        placementLink: bhLink('Placement', p.id),
        employeeType: p.employeeType || '',
        candidateName: candidateName(p.candidate),
        startDate: formatDate(beginMs),
        scheduledEnd: endMs2 ? formatDate(endMs2) : '',
        daysBetween,
        guarantee: endMs2 ? formatISO(endMs2) : 'Yes',
        newInput: spread,
        recruiterId: userId,
        client,
      });
    }

    // Calculate MAR and points
    const totals = { clientSubs: 0, interviews: 0, starts: 0, mar: 0, newInput: 0 };
    const recruiterList = Object.values(metricsMap).map(r => {
      const m = r.metrics;
      m.mar = (m.clientSubs * POINTS.CLIENT_SUB) + (m.interviews * POINTS.INTERVIEW) + (m.starts * POINTS.START);
      m.newInput = Math.round(m.newInput * 100) / 100;

      r.points.subsPoints = m.clientSubs * POINTS.CLIENT_SUB;
      r.points.interviewPoints = m.interviews * POINTS.INTERVIEW;
      r.points.startsPoints = m.starts * POINTS.START;
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

module.exports = router;
