const express = require('express');
const router = express.Router();
const {
  getRecruiterUsers,
  getClientSubsInRange,
  getInterviewsInRange,
  getPlacementsInRange,
} = require('../lib/bullhorn');
const { POINTS, getRecruiterTier, getSpreadGoal } = require('../lib/recruiterConfig');

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

    // Build per-recruiter metrics map
    const metricsMap = {};
    for (const r of recruiters) {
      const name = `${r.firstName} ${r.lastName}`;
      metricsMap[r.id] = {
        id: r.id,
        name,
        tier: getRecruiterTier(name),
        spreadGoal: getSpreadGoal(name),
        metrics: { clientSubs: 0, interviews: 0, starts: 0, mar: 0, newInput: 0 },
        points: { subsPoints: 0, interviewPoints: 0, startsPoints: 0, total: 0 },
      };
    }

    // Count client subs per recruiter
    for (const sub of subs) {
      const userId = sub.sendingUser?.id;
      if (userId && metricsMap[userId]) {
        metricsMap[userId].metrics.clientSubs++;
      }
    }

    // Count interviews per recruiter
    for (const iv of interviews) {
      const userId = iv.sendingUser?.id;
      if (userId && metricsMap[userId]) {
        metricsMap[userId].metrics.interviews++;
      }
    }

    // Count starts and calculate spread per recruiter
    for (const p of placements) {
      const userId = p.owner?.id;
      if (userId && metricsMap[userId]) {
        metricsMap[userId].metrics.starts++;
        const bill = Number(p.clientBillRate) || 0;
        const pay = Number(p.payRate) || 0;
        if (bill > 0 && pay > 0) {
          const spread = ((bill - pay) * 1.25) * 40;
          metricsMap[userId].metrics.newInput += Math.round(spread * 100) / 100;
        }
      }
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
      recruiters: recruiterList,
      totals,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
