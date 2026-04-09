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
} = require('../lib/bullhorn');
const { POINTS } = require('../lib/recruiterConfig');
const { SALES_POINTS, ACTIVITY_ORDER, EXCLUDED_AMS } = require('../lib/salesConfig');
const { EXCLUDED_RECRUITERS } = require('../lib/recruiterConfig');

function calcHealth(placements, activities) {
  const effective = placements + Math.floor(activities / 5);
  if (effective > 3) return 'green';
  if (effective > 0) return 'yellow';
  return 'red';
}

// GET /api/client-health
router.get('/', async (req, res, next) => {
  try {
    const now = Date.now();
    const twoWeeksAgo = now - (14 * 24 * 60 * 60 * 1000);

    // Parallel queries
    const [placementsRes, appointmentsRes] = await Promise.all([
      getActivePlacementsWithClient(),
      getRecentAppointments(twoWeeksAgo),
    ]);

    const placements = placementsRes?.data || [];
    const appointments = appointmentsRes?.data || [];

    // Count placements per client
    const clientPlacements = {};
    for (const p of placements) {
      const clientId = p.jobOrder?.clientCorporation?.id;
      if (clientId) {
        clientPlacements[clientId] = (clientPlacements[clientId] || 0) + 1;
      }
    }

    // Count appointments per client (via clientContactReference or jobOrder)
    const clientActivities = {};
    for (const a of appointments) {
      const clientId =
        a.clientContactReference?.clientCorporation?.id ||
        a.jobOrder?.clientCorporation?.id;
      if (clientId) {
        clientActivities[clientId] = (clientActivities[clientId] || 0) + 1;
      }
    }

    // Collect all unique client IDs
    const allClientIds = new Set([
      ...Object.keys(clientPlacements).map(Number),
      ...Object.keys(clientActivities).map(Number),
    ]);

    if (allClientIds.size === 0) {
      return res.json({ clients: [] });
    }

    // Fetch client details with owners
    const clientsRes = await getClientCorporations([...allClientIds]);
    const clientsData = clientsRes?.data || [];

    // Build response
    const clients = clientsData.map(c => {
      const activePlacements = clientPlacements[c.id] || 0;
      const recentActivities = clientActivities[c.id] || 0;
      const effectiveScore = activePlacements + Math.floor(recentActivities / 5);
      const health = calcHealth(activePlacements, recentActivities);

      const owners = (c.owners?.data || []).map(o =>
        `${o.firstName || ''} ${o.lastName || ''}`.trim()
      ).filter(Boolean);

      return {
        id: c.id,
        name: c.name || '',
        status: c.status || '',
        owners,
        activePlacements,
        recentActivities,
        effectiveScore,
        health,
      };
    });

    // Sort: red first, then yellow, then green
    const healthOrder = { red: 0, yellow: 1, green: 2 };
    clients.sort((a, b) => healthOrder[a.health] - healthOrder[b.health]);

    const summary = {
      green: clients.filter(c => c.health === 'green').length,
      yellow: clients.filter(c => c.health === 'yellow').length,
      red: clients.filter(c => c.health === 'red').length,
      total: clients.length,
    };

    res.json({ clients, summary });
  } catch (err) {
    next(err);
  }
});

// GET /api/client-health/kpis — company-wide KPI gauges for current quarter
router.get('/kpis', async (req, res, next) => {
  try {
    // Current quarter boundaries
    const now = new Date();
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    const qStart = new Date(now.getFullYear(), qMonth, 1);
    const qEnd = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999);
    const startMs = qStart.getTime();
    const endMs = qEnd.getTime();

    // Get all recruiters and AMs
    const [recruiterRes, amRes] = await Promise.all([
      getRecruiterUsers(),
      getAMUsers(),
    ]);
    const recruiters = (recruiterRes?.data || []).filter(r => !EXCLUDED_RECRUITERS.has(`${r.firstName} ${r.lastName}`));
    const ams = (amRes?.data || []).filter(a => !EXCLUDED_AMS.has(`${a.firstName} ${a.lastName}`));
    const amIds = ams.map(a => a.id);
    const recruiterIds = recruiters.map(r => r.id);

    // Parallel queries for MAR + Input
    const [
      interviewsRes, subsRes, placementsRes, appointmentsRes,
    ] = await Promise.all([
      getInterviewsInRange(startMs, endMs),
      getClientSubsInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
      getAppointmentsInRange(startMs, endMs, amIds),
    ]);

    const interviews = interviewsRes?.data || [];
    const subs = subsRes?.data || [];
    const placements = placementsRes?.data || [];
    const appointments = appointmentsRes?.data || [];

    // Recruiter MAR: subs(1) + interviews(3) + starts(10) via commissions
    let recruiterMAR = 0;
    const recruiterSet = new Set(recruiterIds);

    // Count recruiter interviews (Appointment type=Interview, already filtered)
    const recruiterInterviews = {};
    for (const iv of interviews) {
      const uid = iv.owner?.id;
      if (uid && recruiterSet.has(uid)) {
        recruiterInterviews[uid] = (recruiterInterviews[uid] || 0) + 1;
      }
    }

    // Count recruiter subs (Sendout, user = recruiter)
    const recruiterSubs = {};
    for (const s of subs) {
      const uid = s.user?.id;
      if (uid && recruiterSet.has(uid)) {
        recruiterSubs[uid] = (recruiterSubs[uid] || 0) + 1;
      }
    }

    // Recruiter starts via commissions
    let recruiterStarts = 0;
    let totalNewInput = 0;
    if (placements.length > 0) {
      const pIds = placements.map(p => p.id);
      const [recCommRes, salesCommRes] = await Promise.all([
        getRecruitingCommissions(pIds),
        getSalesCommissions(pIds),
      ]);

      // Recruiter starts + input
      for (const c of (recCommRes?.data || [])) {
        if (c.user && recruiterSet.has(c.user.id)) {
          recruiterStarts += (c.commissionPercentage || 0);
        }
      }

      // All input (sales commissions)
      for (const c of (salesCommRes?.data || [])) {
        const p = placements.find(pl => pl.id === c.placement?.id);
        if (p && c.commissionPercentage) {
          const bill = Number(p.clientBillRate) || 0;
          const pay = Number(p.payRate) || 0;
          const sal = Number(p.salary) || 0;
          const feeRate = Number(p.fee) || 0;
          const empType = (p.employeeType || '').toLowerCase();
          let spread = 0;
          if (empType === 'perm' && sal > 0 && feeRate > 0) {
            spread = sal * feeRate / 26;
          } else if (empType === 'corp-to-corp' && bill > 0 && pay > 0) {
            spread = (bill - pay * 1.05) * 40;
          } else if (bill > 0 && pay > 0) {
            spread = (bill - pay * 1.25) * 40;
          }
          totalNewInput += spread * (c.commissionPercentage || 1);
        }
      }
    }

    // Recruiter MAR total
    for (const uid of recruiterIds) {
      const ivCount = recruiterInterviews[uid] || 0;
      const subCount = recruiterSubs[uid] || 0;
      recruiterMAR += (subCount * POINTS.CLIENT_SUB) + (ivCount * POINTS.INTERVIEW);
    }
    recruiterMAR += recruiterStarts * POINTS.START;

    // AM MAR: from appointment points
    let amMAR = 0;
    for (const appt of appointments) {
      const type = appt.type || '';
      if (SALES_POINTS[type] !== undefined) {
        amMAR += SALES_POINTS[type];
      }
    }

    const totalMAR = Math.round((recruiterMAR + amMAR) * 100) / 100;
    totalNewInput = Math.round(totalNewInput * 100) / 100;

    // Backout %: terminated placements / total openings this quarter
    const allPlacements = placementsRes?.data || [];
    const terminated = allPlacements.filter(p => (p.status || '').toLowerCase() === 'terminated').length;
    // We need total openings — sum of numOpenings from jobs
    // For now, use total placements as denominator since we already have them
    const totalPlacements = allPlacements.length;
    const backoutPct = totalPlacements > 0 ? Math.round((terminated / totalPlacements) * 100) : 0;

    res.json({
      quarter: `Q${Math.floor(qMonth / 3) + 1} ${now.getFullYear()}`,
      gauges: [
        { label: 'MAR Total', value: totalMAR, target: 1885, format: 'number' },
        { label: 'Input', value: totalNewInput, target: 40000, format: 'currency' },
        { label: 'A/B Fill Ratio - Staffing', value: null, target: 60, format: 'number', placeholder: true },
        { label: 'Backout %', value: backoutPct, target: 10, format: 'percent', invert: true },
        { label: 'Fill Ratio - Project', value: null, target: 60, format: 'number', placeholder: true },
      ],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
