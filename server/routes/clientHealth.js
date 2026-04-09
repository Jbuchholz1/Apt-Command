const express = require('express');
const router = express.Router();
const {
  getActivePlacementsWithClient,
  getRecentAppointments,
  getClientCorporations,
  getRecruiterUsers,
  getAMUsers,
  getInterviewsInRange,
  getClientSubsInRange,
  getPlacementsInRange,
  getRecruitingCommissions,
  getAppointmentsInRange,
  getSalesCommissions,
  getABJobsInRange,
  getPlacementsForJobs,
} = require('../lib/bullhorn');
const { POINTS, EXCLUDED_RECRUITERS } = require('../lib/recruiterConfig');
const { SALES_POINTS, EXCLUDED_AMS } = require('../lib/salesConfig');

function calcHealth(placements, activities) {
  const effective = placements + Math.floor(activities / 5);
  if (effective > 3) return 'green';
  if (effective > 0) return 'yellow';
  return 'red';
}

function parseDates(req) {
  const { start, end } = req.query;
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);
  const endMs = endDate.getTime();
  if (isNaN(startMs) || isNaN(endMs)) return null;
  return { startMs, endMs, start, end };
}

// GET /api/client-health?start=2026-01-01&end=2026-04-09
router.get('/', async (req, res, next) => {
  try {
    const dates = parseDates(req);
    const activitySinceMs = dates ? dates.startMs : Date.now() - (14 * 24 * 60 * 60 * 1000);

    const [placementsRes, appointmentsRes] = await Promise.all([
      getActivePlacementsWithClient(),
      getRecentAppointments(activitySinceMs),
    ]);

    const placements = placementsRes?.data || [];
    const appointments = appointmentsRes?.data || [];

    const clientPlacements = {};
    for (const p of placements) {
      const clientId = p.jobOrder?.clientCorporation?.id;
      if (clientId) clientPlacements[clientId] = (clientPlacements[clientId] || 0) + 1;
    }

    const clientActivities = {};
    for (const a of appointments) {
      const clientId = a.clientContactReference?.clientCorporation?.id || a.jobOrder?.clientCorporation?.id;
      if (clientId) clientActivities[clientId] = (clientActivities[clientId] || 0) + 1;
    }

    const allClientIds = new Set([
      ...Object.keys(clientPlacements).map(Number),
      ...Object.keys(clientActivities).map(Number),
    ]);

    if (allClientIds.size === 0) return res.json({ clients: [], summary: { green: 0, yellow: 0, red: 0, total: 0 } });

    const clientsRes = await getClientCorporations([...allClientIds]);
    const clients = (clientsRes?.data || []).map(c => {
      const activePlacements = clientPlacements[c.id] || 0;
      const recentActivities = clientActivities[c.id] || 0;
      const effectiveScore = activePlacements + Math.floor(recentActivities / 5);
      const health = calcHealth(activePlacements, recentActivities);
      const owners = (c.owners?.data || []).map(o => `${o.firstName || ''} ${o.lastName || ''}`.trim()).filter(Boolean);
      return { id: c.id, name: c.name || '', status: c.status || '', owners, activePlacements, recentActivities, effectiveScore, health };
    });

    const healthOrder = { red: 0, yellow: 1, green: 2 };
    clients.sort((a, b) => healthOrder[a.health] - healthOrder[b.health]);

    const summary = { green: 0, yellow: 0, red: 0, total: clients.length };
    clients.forEach(c => summary[c.health]++);

    res.json({ clients, summary });
  } catch (err) {
    next(err);
  }
});

// GET /api/client-health/kpis?start=2026-01-01&end=2026-04-09
router.get('/kpis', async (req, res, next) => {
  try {
    const dates = parseDates(req);
    let startMs, endMs, rangeLabel;

    if (dates) {
      startMs = dates.startMs;
      endMs = dates.endMs;
      rangeLabel = `${dates.start} to ${dates.end}`;
    } else {
      const now = new Date();
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const qStart = new Date(now.getFullYear(), qMonth, 1);
      const qEnd = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999);
      startMs = qStart.getTime();
      endMs = qEnd.getTime();
      rangeLabel = `Q${Math.floor(qMonth / 3) + 1} ${now.getFullYear()}`;
    }

    const [recruiterRes, amRes] = await Promise.all([getRecruiterUsers(), getAMUsers()]);
    const recruiters = (recruiterRes?.data || []).filter(r => !EXCLUDED_RECRUITERS.has(`${r.firstName} ${r.lastName}`));
    const ams = (amRes?.data || []).filter(a => !EXCLUDED_AMS.has(`${a.firstName} ${a.lastName}`));
    const amIds = ams.map(a => a.id);
    const recruiterIds = recruiters.map(r => r.id);
    const recruiterSet = new Set(recruiterIds);

    const [interviewsRes, subsRes, placementsRes, appointmentsRes, abJobsRes] = await Promise.all([
      getInterviewsInRange(startMs, endMs),
      getClientSubsInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
      getAppointmentsInRange(startMs, endMs, amIds),
      getABJobsInRange(startMs, endMs),
    ]);

    const interviews = interviewsRes?.data || [];
    const subs = subsRes?.data || [];
    const placements = placementsRes?.data || [];
    const appointments = appointmentsRes?.data || [];
    const abJobs = abJobsRes?.data || [];

    // --- Recruiter MAR ---
    let recruiterMAR = 0;
    const recruiterInterviews = {};
    for (const iv of interviews) {
      const uid = iv.owner?.id;
      if (uid && recruiterSet.has(uid)) recruiterInterviews[uid] = (recruiterInterviews[uid] || 0) + 1;
    }
    const recruiterSubs = {};
    for (const s of subs) {
      const uid = s.user?.id;
      if (uid && recruiterSet.has(uid)) recruiterSubs[uid] = (recruiterSubs[uid] || 0) + 1;
    }

    let recruiterStarts = 0;
    let totalNewInput = 0;
    if (placements.length > 0) {
      const pIds = placements.map(p => p.id);
      const [recCommRes, salesCommRes] = await Promise.all([
        getRecruitingCommissions(pIds),
        getSalesCommissions(pIds),
      ]);

      for (const c of (recCommRes?.data || [])) {
        if (c.user && recruiterSet.has(c.user.id)) recruiterStarts += (c.commissionPercentage || 0);
      }

      for (const c of (salesCommRes?.data || [])) {
        const p = placements.find(pl => pl.id === c.placement?.id);
        if (p && c.commissionPercentage) {
          const bill = Number(p.clientBillRate) || 0;
          const pay = Number(p.payRate) || 0;
          const sal = Number(p.salary) || 0;
          const feeRate = Number(p.fee) || 0;
          const empType = (p.employeeType || '').toLowerCase();
          let spread = 0;
          if (empType === 'perm' && sal > 0 && feeRate > 0) spread = sal * feeRate / 26;
          else if (empType === 'corp-to-corp' && bill > 0 && pay > 0) spread = (bill - pay * 1.05) * 40;
          else if (bill > 0 && pay > 0) spread = (bill - pay * 1.25) * 40;
          totalNewInput += spread * (c.commissionPercentage || 1);
        }
      }
    }

    for (const uid of recruiterIds) {
      recruiterMAR += ((recruiterSubs[uid] || 0) * POINTS.CLIENT_SUB) + ((recruiterInterviews[uid] || 0) * POINTS.INTERVIEW);
    }
    recruiterMAR += recruiterStarts * POINTS.START;

    // --- AM MAR ---
    let amMAR = 0;
    for (const appt of appointments) {
      const type = appt.type || '';
      if (SALES_POINTS[type] !== undefined) amMAR += SALES_POINTS[type];
    }

    const totalMAR = Math.round((recruiterMAR + amMAR) * 100) / 100;
    totalNewInput = Math.round(totalNewInput * 100) / 100;

    // --- Backout % ---
    const terminated = placements.filter(p => (Array.isArray(p.status) ? p.status[0] : p.status || '').toLowerCase() === 'terminated').length;
    const totalPlacements = placements.length;
    const backoutPct = totalPlacements > 0 ? Math.round((terminated / totalPlacements) * 100) : 0;

    // --- A/B Fill Ratio ---
    let abFillRatio = null;
    if (abJobs.length > 0) {
      const totalOpenings = abJobs.reduce((sum, j) => sum + (j.numOpenings || 0), 0);
      const abJobIds = abJobs.map(j => j.id);
      let abPlacements = 0;
      if (abJobIds.length > 0) {
        try {
          const abPlRes = await getPlacementsForJobs(abJobIds);
          abPlacements = (abPlRes?.data || []).length;
        } catch (err) {
          console.warn('Failed to get A/B placements:', err.message);
        }
      }
      abFillRatio = totalOpenings > 0 ? Math.round((abPlacements / totalOpenings) * 100) : 0;
    }

    res.json({
      rangeLabel,
      gauges: [
        { label: 'MAR Total', value: totalMAR, target: 1885, format: 'number' },
        { label: 'Input', value: totalNewInput, target: 40000, format: 'currency' },
        { label: 'A/B Fill Ratio - Staffing', value: abFillRatio, target: 60, format: 'number' },
        { label: 'Backout %', value: backoutPct, target: 10, format: 'percent', invert: true },
        { label: 'Fill Ratio - Project', value: null, target: 60, format: 'number', placeholder: true },
      ],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
