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
  getABJobs,
  getProjectJobs,
  getPlacementsForJobs,
} = require('../lib/bullhorn');
const { POINTS, EXCLUDED_RECRUITERS, bhLink } = require('../lib/recruiterConfig');
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
    // Always use current active placements and last 14 days of activity, regardless of date filter
    const activitySinceMs = Date.now() - (14 * 24 * 60 * 60 * 1000);

    const [placementsRes, appointmentsRes] = await Promise.all([
      getActivePlacementsWithClient(),
      getRecentAppointments(activitySinceMs),
    ]);

    const placements = placementsRes?.data || [];
    const appointments = appointmentsRes?.data || [];

    const clientPlacements = {};
    const clientPlacementDetails = {};
    for (const p of placements) {
      const clientId = p.jobOrder?.clientCorporation?.id;
      if (clientId) {
        clientPlacements[clientId] = (clientPlacements[clientId] || 0) + 1;
        if (!clientPlacementDetails[clientId]) clientPlacementDetails[clientId] = [];

        const bill = Number(p.clientBillRate) || 0;
        const pay = Number(p.payRate) || 0;
        const sal = Number(p.salary) || 0;
        const feeRate = Number(p.fee) || 0;
        const empType = (p.employeeType || '').toLowerCase();
        let spread = 0;
        if (empType === 'perm' && sal > 0 && feeRate > 0) spread = Math.round((sal * feeRate / 26) * 100) / 100;
        else if (empType === 'corp-to-corp' && bill > 0 && pay > 0) spread = Math.round((bill - pay * 1.05) * 40 * 100) / 100;
        else if (bill > 0 && pay > 0) spread = Math.round((bill - pay * 1.25) * 40 * 100) / 100;

        const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : '';

        clientPlacementDetails[clientId].push({
          placementId: p.id,
          link: bhLink('Placement', p.id),
          candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
          manager: p.owner ? `${p.owner.firstName || ''} ${p.owner.lastName || ''}`.trim() : '',
          startDate: fmtDate(p.dateBegin),
          endDate: fmtDate(p.dateEnd),
          spread,
        });
      }
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
      return { id: c.id, name: c.name || '', status: c.status || '', owners, activePlacements, recentActivities, effectiveScore, health, placementDetails: clientPlacementDetails[c.id] || [] };
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

    // Optional client filter
    const clientIdParam = req.query.clientIds;
    const clientIdFilter = clientIdParam ? new Set(clientIdParam.split(',').map(Number)) : null;

    const [recruiterRes, amRes] = await Promise.all([getRecruiterUsers(), getAMUsers()]);
    const recruiters = (recruiterRes?.data || []).filter(r => !EXCLUDED_RECRUITERS.has(`${r.firstName} ${r.lastName}`));
    const ams = (amRes?.data || []).filter(a => !EXCLUDED_AMS.has(`${a.firstName} ${a.lastName}`));
    const amIds = ams.map(a => a.id);
    const recruiterIds = recruiters.map(r => r.id);
    const recruiterSet = new Set(recruiterIds);

    const [interviewsRes, subsRes, placementsRes, appointmentsRes, abJobsRes, projJobsRes] = await Promise.all([
      getInterviewsInRange(startMs, endMs),
      getClientSubsInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
      getAppointmentsInRange(startMs, endMs, amIds),
      getABJobs(startMs, endMs),
      getProjectJobs(startMs, endMs),
    ]);

    let interviews = interviewsRes?.data || [];
    let subs = subsRes?.data || [];
    let placements = placementsRes?.data || [];
    let appointments = appointmentsRes?.data || [];
    let abJobs = abJobsRes?.data || [];
    let projJobs = projJobsRes?.data || [];

    // Filter by client if specified
    if (clientIdFilter) {
      interviews = interviews.filter(iv => {
        const cId = iv.jobOrder?.clientCorporation?.id;
        return cId && clientIdFilter.has(cId);
      });
      subs = subs.filter(s => {
        const cId = s.clientCorporation?.id || s.jobOrder?.clientCorporation?.id;
        return cId && clientIdFilter.has(cId);
      });
      placements = placements.filter(p => {
        const cId = p.jobOrder?.clientCorporation?.id;
        return cId && clientIdFilter.has(cId);
      });
      appointments = appointments.filter(a => {
        const cId = a.clientContactReference?.clientCorporation?.id || a.jobOrder?.clientCorporation?.id;
        return cId && clientIdFilter.has(cId);
      });
      abJobs = abJobs.filter(j => {
        const cId = j.clientCorporation?.id;
        return cId && clientIdFilter.has(cId);
      });
      projJobs = projJobs.filter(j => {
        const cId = j.clientCorporation?.id;
        return cId && clientIdFilter.has(cId);
      });
    }

    // --- Build name lookups ---
    const allNames = {};
    for (const r of recruiters) allNames[r.id] = `${r.firstName} ${r.lastName}`;
    for (const a of ams) allNames[a.id] = `${a.firstName} ${a.lastName}`;

    // --- Per-person MAR tracking ---
    const personMAR = {}; // { userId: { name, role, mar } }
    const initPerson = (id, role) => {
      if (!personMAR[id]) personMAR[id] = { name: allNames[id] || `User ${id}`, role, mar: 0 };
    };

    // Recruiter interviews
    for (const iv of interviews) {
      const uid = iv.owner?.id;
      if (uid && recruiterSet.has(uid)) {
        initPerson(uid, 'Recruiter');
        personMAR[uid].mar += POINTS.INTERVIEW;
      }
    }
    // Recruiter subs
    for (const s of subs) {
      const uid = s.user?.id;
      if (uid && recruiterSet.has(uid)) {
        initPerson(uid, 'Recruiter');
        personMAR[uid].mar += POINTS.CLIENT_SUB;
      }
    }

    // --- Input detail tracking ---
    const inputDetails = []; // { placementId, jobTitle, client, empType, input }
    let totalNewInput = 0;

    if (placements.length > 0) {
      const pIds = placements.map(p => p.id);
      const [recCommRes, salesCommRes] = await Promise.all([
        getRecruitingCommissions(pIds),
        getSalesCommissions(pIds),
      ]);

      for (const c of (recCommRes?.data || [])) {
        if (c.user && recruiterSet.has(c.user.id)) {
          initPerson(c.user.id, 'Recruiter');
          personMAR[c.user.id].mar += (c.commissionPercentage || 0) * POINTS.START;
        }
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
          const input = Math.round(spread * (c.commissionPercentage || 1) * 100) / 100;
          totalNewInput += input;
          inputDetails.push({
            placementId: p.id,
            jobTitle: p.jobOrder?.title || '',
            client: p.jobOrder?.clientCorporation?.name || '',
            empType: p.employeeType || '',
            am: allNames[c.user?.id] || '',
            input,
          });
        }
      }
    }

    // --- AM MAR ---
    const amMARbyPerson = {};
    for (const appt of appointments) {
      const uid = appt.owner?.id;
      const type = appt.type || '';
      if (uid && SALES_POINTS[type] !== undefined) {
        initPerson(uid, 'Account Manager');
        personMAR[uid].mar += SALES_POINTS[type];
      }
    }

    // Round all MAR values
    const marDetails = Object.values(personMAR).map(p => ({
      ...p, mar: Math.round(p.mar * 100) / 100,
    })).sort((a, b) => b.mar - a.mar);

    const totalMAR = Math.round(marDetails.reduce((s, p) => s + p.mar, 0) * 100) / 100;
    totalNewInput = Math.round(totalNewInput * 100) / 100;

    // Dynamic MAR target: (recruiters × 26/wk + AMs × 30/wk) × 13 weeks
    const marTarget = (recruiters.length * 26 + ams.length * 30) * 13;

    // --- Backout % ---
    const terminatedList = placements.filter(p => (Array.isArray(p.status) ? p.status[0] : p.status || '').toLowerCase() === 'terminated');
    const totalPlacements = placements.length;
    const backoutPct = totalPlacements > 0 ? Math.round((terminatedList.length / totalPlacements) * 100) : 0;
    const backoutDetails = terminatedList.map(p => ({
      placementId: p.id,
      jobTitle: p.jobOrder?.title || '',
      client: p.jobOrder?.clientCorporation?.name || '',
      candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
    }));

    // --- A/B Fill Ratio ---
    let abFillRatio = null;
    const fillDetails = [];
    if (abJobs.length > 0) {
      const totalOpenings = abJobs.reduce((sum, j) => sum + (j.numOpenings || 0), 0);
      const abJobIdSet = new Set(abJobs.map(j => j.id));
      const abFills = placements.filter(p => p.jobOrder?.id && abJobIdSet.has(p.jobOrder.id)).length;
      abFillRatio = totalOpenings > 0 ? Math.round((abFills / totalOpenings) * 100) : 0;

      // Per-job detail
      const fillsByJob = {};
      for (const p of placements) {
        const jId = p.jobOrder?.id;
        if (jId && abJobIdSet.has(jId)) fillsByJob[jId] = (fillsByJob[jId] || 0) + 1;
      }
      for (const j of abJobs) {
        fillDetails.push({
          jobId: j.id,
          title: j.title || '',
          priority: j.type === 1 ? 'A' : 'B',
          openings: j.numOpenings || 0,
          fills: fillsByJob[j.id] || 0,
        });
      }
      fillDetails.sort((a, b) => (b.fills / (b.openings || 1)) - (a.fills / (a.openings || 1)));
    }

    // --- Project Fill Ratio ---
    let projFillRatio = null;
    const projFillDetails = [];
    if (projJobs.length > 0) {
      const projOpenings = projJobs.reduce((sum, j) => sum + (j.numOpenings || 0), 0);
      const projJobIdSet = new Set(projJobs.map(j => j.id));
      const projFillsByJob = {};
      for (const p of placements) {
        const jId = p.jobOrder?.id;
        if (jId && projJobIdSet.has(jId)) projFillsByJob[jId] = (projFillsByJob[jId] || 0) + 1;
      }
      const projFills = Object.values(projFillsByJob).reduce((s, v) => s + v, 0);
      projFillRatio = projOpenings > 0 ? Math.round((projFills / projOpenings) * 100) : 0;

      for (const j of projJobs) {
        projFillDetails.push({
          jobId: j.id,
          title: j.title || '',
          priority: j.type === 1 ? 'A' : j.type === 2 ? 'B' : 'C',
          openings: j.numOpenings || 0,
          fills: projFillsByJob[j.id] || 0,
        });
      }
      projFillDetails.sort((a, b) => (b.fills / (b.openings || 1)) - (a.fills / (a.openings || 1)));
    }

    res.json({
      rangeLabel,
      gauges: [
        { label: 'MAR Total', value: totalMAR, target: marTarget, format: 'number', details: marDetails },
        { label: 'Input', value: totalNewInput, target: 40000, format: 'currency', details: inputDetails },
        { label: 'A/B Fill Ratio - Staffing', value: abFillRatio, target: 60, format: 'percent', details: fillDetails },
        { label: 'Backout %', value: backoutPct, target: 10, format: 'percent', invert: true, details: backoutDetails },
        { label: 'Fill Ratio - Project', value: projFillRatio, target: 60, format: 'percent', details: projFillDetails },
      ],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
