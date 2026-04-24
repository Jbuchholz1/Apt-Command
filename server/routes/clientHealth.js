const express = require('express');
const ExcelJS = require('exceljs');
const { sanitizeRow } = require('../lib/excelSafe');
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
  getBackoutNotesInRange,
  getCheckinNotesForType,
  callTool,
} = require('../lib/bullhorn');
const { POINTS, EXCLUDED_RECRUITERS, bhLink } = require('../lib/recruiterConfig');
const { SALES_POINTS, EXCLUDED_AMS } = require('../lib/salesConfig');

function calcHealth(placements, activities) {
  const effective = placements + Math.floor(activities / 5);
  if (effective > 3) return 'green';
  if (effective > 0) return 'yellow';
  return 'red';
}

// === Framework scoring (parallel rollout) ===
// Thresholds and appointment type strings are placeholders; swap in confirmed
// Bullhorn values here without editing the logic below.
const HEALTH_CONFIG = {
  REAL_MEETING_TYPES: [
    'In Person Meetings',
    'New Meeting',
    'Req Qual',
    'Referral Meeting',
    'OOA',
    'Dinner',
    'Sol Disc Meeting',
    'Sol Pitch Meeting',
  ],
  IN_PERSON_TYPES: [
    'In Person Meetings',
    'New Meeting',
    'Req Qual',
    'Referral Meeting',
    'OOA',
    'Dinner',
    'Sol Disc Meeting',
    'Sol Pitch Meeting',
  ],
  ONBOARDING_DAYS: 90,
  DIRECTION_THRESHOLD: 0.20,
  THRESHOLDS: {
    HIRING_MANAGER: { meetings: 3, placements: 2 },
    HIGHER_UP: { orgPlacements: 6, directPlacements: 3, inPersonMonths: 2 },
    OUTLIER: { meetings: 2, referralPlacements: 2 },
  },
};

function assignTier(signals) {
  const {
    earliestContactDateMs, now,
    activePlacements, hasActiveReqs,
    orgData, orgPlacements90d,
    directPlacements90d, realMeetings90d, referralPlacements90d,
  } = signals;

  const onboardingCutoff = now - HEALTH_CONFIG.ONBOARDING_DAYS * 86400000;
  if (earliestContactDateMs && earliestContactDateMs > onboardingCutoff) return 'Onboarding';

  // Without org data we cannot separate Higher Up / Outlier — default fallback.
  if (!orgData) return 'Hiring Manager';

  const hasDirect = activePlacements > 0 || directPlacements90d > 0 || hasActiveReqs;
  const hasSubordinatePlacements = orgPlacements90d > 0;

  if (hasDirect && !hasSubordinatePlacements) return 'Hiring Manager';
  if (hasSubordinatePlacements && !hasDirect) return 'Higher Up';
  if (!hasDirect && !hasSubordinatePlacements && realMeetings90d > 0 && referralPlacements90d > 0) return 'Outlier';
  return 'Hiring Manager';
}

function scoreHealth(tier, signals) {
  const T = HEALTH_CONFIG.THRESHOLDS;
  if (tier === 'Onboarding') return null;

  if (tier === 'Hiring Manager') {
    const { realMeetings90d, activePlacements } = signals;
    if (realMeetings90d >= T.HIRING_MANAGER.meetings && activePlacements >= T.HIRING_MANAGER.placements) return 'green';
    if (realMeetings90d === 0 && activePlacements === 0) return 'red';
    return 'yellow';
  }

  if (tier === 'Higher Up') {
    const {
      inPersonMeetings90d, inPersonMonthsLast3,
      orgPlacements90d, directPlacements90d, priorPlacements90d,
    } = signals;
    const monthsOk = inPersonMonthsLast3 >= T.HIGHER_UP.inPersonMonths;
    const volumeOk = orgPlacements90d >= T.HIGHER_UP.orgPlacements || directPlacements90d >= T.HIGHER_UP.directPlacements;
    if (monthsOk && volumeOk) return 'green';
    const declining = (orgPlacements90d + directPlacements90d) < priorPlacements90d;
    if (inPersonMeetings90d === 0 && declining) return 'red';
    return 'yellow';
  }

  if (tier === 'Outlier') {
    const { realMeetings90d, referralPlacements90d } = signals;
    if (realMeetings90d >= T.OUTLIER.meetings && referralPlacements90d >= T.OUTLIER.referralPlacements) return 'green';
    if (realMeetings90d === 0 && referralPlacements90d === 0) return 'red';
    return 'yellow';
  }

  return null;
}

function computeDirection(current, prior) {
  if (prior === 0 && current === 0) return null;
  if (prior === 0) return current > 0 ? 'warming' : null;
  const delta = (current - prior) / prior;
  if (delta <= -HEALTH_CONFIG.DIRECTION_THRESHOLD) return 'cooling';
  if (delta >= HEALTH_CONFIG.DIRECTION_THRESHOLD) return 'warming';
  return null;
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
    // Existing scoring uses 14-day window; framework scoring uses 90/180 day windows.
    const now = Date.now();
    const ms14 = now - 14 * 86400000;
    const ms90 = now - 90 * 86400000;
    const ms180 = now - 180 * 86400000;

    const [placementsRes, appointmentsRes, appointments180Res] = await Promise.all([
      getActivePlacementsWithClient(),
      getRecentAppointments(ms14),
      getRecentAppointments(ms180),
    ]);

    const placements = placementsRes?.data || [];
    const appointments = appointmentsRes?.data || [];
    const appointments180 = appointments180Res?.data || [];

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
          manager: p.jobOrder?.clientContact ? `${p.jobOrder.clientContact.firstName || ''} ${p.jobOrder.clientContact.lastName || ''}`.trim() : '',
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

    // === Framework scoring aggregators (parallel rollout) ===
    const REAL_SET = new Set(HEALTH_CONFIG.REAL_MEETING_TYPES);
    const IN_PERSON_SET = new Set(HEALTH_CONFIG.IN_PERSON_TYPES);

    const realMeetings90 = {};
    const realMeetingsPrior = {};
    const inPerson90 = {};
    const inPersonMonths = {};

    for (const a of appointments180) {
      const clientId = a.clientContactReference?.clientCorporation?.id || a.jobOrder?.clientCorporation?.id;
      if (!clientId) continue;
      const dateMs = Number(a.dateBegin);
      if (!dateMs) continue;
      const type = a.type || '';
      if (REAL_SET.has(type)) {
        if (dateMs >= ms90) realMeetings90[clientId] = (realMeetings90[clientId] || 0) + 1;
        else if (dateMs >= ms180) realMeetingsPrior[clientId] = (realMeetingsPrior[clientId] || 0) + 1;
      }
      if (IN_PERSON_SET.has(type) && dateMs >= ms90) {
        inPerson90[clientId] = (inPerson90[clientId] || 0) + 1;
        const d = new Date(dateMs);
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
        if (!inPersonMonths[clientId]) inPersonMonths[clientId] = new Set();
        inPersonMonths[clientId].add(monthKey);
      }
    }

    const direct90 = {};
    const directPrior = {};
    for (const p of placements) {
      const clientId = p.jobOrder?.clientCorporation?.id;
      if (!clientId) continue;
      const dateMs = Number(p.dateBegin);
      if (!dateMs) continue;
      if (dateMs >= ms90) direct90[clientId] = (direct90[clientId] || 0) + 1;
      else if (dateMs >= ms180) directPrior[clientId] = (directPrior[clientId] || 0) + 1;
    }

    // Earliest ClientContact.dateAdded per company (for Onboarding tier)
    const earliestContactDate = {};
    try {
      const clientIdsArr = [...allClientIds];
      const contactRes = await callTool('query_entity', {
        entityType: 'ClientContact',
        where: `clientCorporation.id IN (${clientIdsArr.join(',')}) AND isDeleted = false`,
        fields: 'id,dateAdded,clientCorporation',
        count: 500,
      });
      for (const contact of contactRes?.data || []) {
        const companyId = contact.clientCorporation?.id;
        const d = Number(contact.dateAdded);
        if (!companyId || !d) continue;
        if (!earliestContactDate[companyId] || d < earliestContactDate[companyId]) {
          earliestContactDate[companyId] = d;
        }
      }
    } catch (e) {
      // If this fetch fails the Onboarding check simply won't trigger; clients fall through to Hiring Manager.
    }

    // Org tree data is not built yet — pass null so assignTier short-circuits to the default fallback.
    const orgData = null;

    const clientsRes = await getClientCorporations([...allClientIds]);
    const clients = (clientsRes?.data || []).map(c => {
      const activePlacements = clientPlacements[c.id] || 0;
      const recentActivities = clientActivities[c.id] || 0;
      const effectiveScore = activePlacements + Math.floor(recentActivities / 5);
      const health = calcHealth(activePlacements, recentActivities);
      const owners = (c.owners?.data || []).map(o => `${o.firstName || ''} ${o.lastName || ''}`.trim()).filter(Boolean);

      // --- Framework fields ---
      const realMeetings90d = realMeetings90[c.id] || 0;
      const prior90ActivityCount = realMeetingsPrior[c.id] || 0;
      const current90ActivityCount = realMeetings90d;
      const inPersonMeetings90d = inPerson90[c.id] || 0;
      const inPersonMonthsLast3 = inPersonMonths[c.id] ? inPersonMonths[c.id].size : 0;
      const directPlacements90d = direct90[c.id] || 0;
      const priorPlacements90d = directPrior[c.id] || 0;
      const orgPlacements90d = 0; // stub until org tree is built
      const referralPlacements90d = 0; // stub until referral source field is confirmed

      const tier = assignTier({
        earliestContactDateMs: earliestContactDate[c.id] || null,
        now,
        activePlacements,
        hasActiveReqs: false,
        orgData,
        orgPlacements90d,
        directPlacements90d,
        realMeetings90d,
        referralPlacements90d,
      });

      const frameworkHealth = scoreHealth(tier, {
        realMeetings90d,
        activePlacements,
        inPersonMeetings90d,
        inPersonMonthsLast3,
        orgPlacements90d,
        directPlacements90d,
        priorPlacements90d,
        referralPlacements90d,
      });

      const direction = frameworkHealth === 'yellow'
        ? computeDirection(current90ActivityCount, prior90ActivityCount)
        : null;

      return {
        // existing (unchanged)
        id: c.id,
        name: c.name || '',
        status: c.status || '',
        owners,
        activePlacements,
        recentActivities,
        effectiveScore,
        health,
        placementDetails: clientPlacementDetails[c.id] || [],
        // framework (new)
        tier,
        frameworkHealth,
        direction,
        realMeetings90d,
        inPersonMeetings90d,
        inPersonMonthsLast3,
        directPlacements90d,
        current90ActivityCount,
        prior90ActivityCount,
        orgPlacements90d,
        referralPlacements90d,
      };
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

// GET /api/client-health/export
router.get('/export', async (req, res, next) => {
  try {
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
          candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
          manager: p.jobOrder?.clientContact ? `${p.jobOrder.clientContact.firstName || ''} ${p.jobOrder.clientContact.lastName || ''}`.trim() : '',
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

    const allClientIds = new Set([...Object.keys(clientPlacements).map(Number), ...Object.keys(clientActivities).map(Number)]);
    const clientsRes = allClientIds.size > 0 ? await getClientCorporations([...allClientIds]) : { data: [] };

    const clients = (clientsRes?.data || []).map(c => {
      const ap = clientPlacements[c.id] || 0;
      const ra = clientActivities[c.id] || 0;
      const owners = (c.owners?.data || []).map(o => `${o.firstName || ''} ${o.lastName || ''}`.trim()).filter(Boolean);
      return { name: c.name, health: calcHealth(ap, ra).toUpperCase(), activePlacements: ap, recentActivities: ra, score: ap + Math.floor(ra / 5), owners: owners.join(', '), details: clientPlacementDetails[c.id] || [] };
    });

    const wb = new ExcelJS.Workbook();

    // Client Health sheet
    const ws = wb.addWorksheet('Client Health');
    ws.columns = [
      { header: 'Health', key: 'health', width: 10 },
      { header: 'Client', key: 'name', width: 30 },
      { header: 'Active Placements', key: 'activePlacements', width: 18 },
      { header: 'Activities (14d)', key: 'recentActivities', width: 16 },
      { header: 'Score', key: 'score', width: 8 },
      { header: 'Owners', key: 'owners', width: 35 },
    ];
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF04144F' } };
    ws.autoFilter = { from: 'A1', to: 'F1' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const c of clients) {
      const row = ws.addRow(sanitizeRow(c));
      const healthColors = { GREEN: 'FF16A34A', YELLOW: 'FFEAB308', RED: 'FFDC2626' };
      row.getCell('health').font = { bold: true, color: { argb: healthColors[c.health] || 'FF000000' } };
    }

    // Placement Details sheet
    const ps = wb.addWorksheet('Placement Details');
    ps.columns = [
      { header: 'Client', key: 'client', width: 30 },
      { header: 'Candidate', key: 'candidate', width: 25 },
      { header: 'Manager', key: 'manager', width: 20 },
      { header: 'Start Date', key: 'startDate', width: 14 },
      { header: 'End Date', key: 'endDate', width: 14 },
      { header: 'Spread', key: 'spread', width: 12 },
    ];
    const pHeader = ps.getRow(1);
    pHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    pHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF04144F' } };
    ps.autoFilter = { from: 'A1', to: 'F1' };
    ps.views = [{ state: 'frozen', ySplit: 1 }];
    ps.getColumn('spread').numFmt = '$#,##0.00';

    for (const c of clients) {
      for (const d of c.details) {
        ps.addRow(sanitizeRow({ client: c.name, ...d }));
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=APT_Health_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
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

    const [interviewsRes, subsRes, placementsRes, appointmentsRes, abJobsRes, projJobsRes, backoutNotesRes, activePlacementsRes, trCheckinRes, amCheckinRes] = await Promise.all([
      getInterviewsInRange(startMs, endMs),
      getClientSubsInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
      getAppointmentsInRange(startMs, endMs, amIds),
      getABJobs(startMs, endMs),
      getProjectJobs(startMs, endMs),
      getBackoutNotesInRange(startMs, endMs),
      getActivePlacementsWithClient(),
      getCheckinNotesForType('TR 30/90'),
      getCheckinNotesForType('AM 30/90'),
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

    // --- Backout % (from NoteEntity where note.action = 'Backout', deduplicated) ---
    const backoutNotes = backoutNotesRes?.data || [];
    const totalPlacements = placements.length;
    const backoutCount = backoutNotes.length;
    const backoutPct = totalPlacements > 0 ? Math.round((backoutCount / totalPlacements) * 100) : 0;
    const backoutDetails = backoutNotes.map(n => ({
      noteId: n.id,
      candidateName: n.candidateName || '',
      candidateId: n.candidateId || null,
      comment: n.comment || '',
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

    // --- TR & AM Checkin Completions (all active placements) ---
    const activePlacements = activePlacementsRes?.data || [];
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    function buildCheckinGauge(activePlacements, checkinResult, label) {
      const { candidateIdsWithCheckin } = checkinResult;
      let totalDue = 0;
      let totalCompleted = 0;
      const details = [];

      const TWELVE_MONTHS_DAYS = 365;
      for (const p of activePlacements) {
        if (!p.dateBegin) continue;
        const daysSinceStart = Math.floor((now - p.dateBegin) / DAY_MS);
        if (daysSinceStart < 30) continue; // No checkins due yet
        if (daysSinceStart > TWELVE_MONTHS_DAYS) continue; // Only placements started within last 12 months

        const candidateId = p.candidate?.id;
        const candidateName = p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '';
        const client = p.jobOrder?.clientCorporation?.name || '';
        const startDate = new Date(p.dateBegin).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
        const hasCheckin = candidateId && candidateIdsWithCheckin.has(candidateId);

        // 30-day checkin
        const thirtyDue = daysSinceStart >= 30;
        const ninetyDue = daysSinceStart >= 90;

        if (thirtyDue) totalDue++;
        if (ninetyDue) totalDue++;

        // We know checkins happened but can't distinguish 30 vs 90 from the note data alone.
        // Count completed = min(notes for this candidate, checkins due) as best approximation.
        // For the gauge we use total notes vs total due across all placements.
        let thirtyStatus = 'Not yet due';
        let ninetyStatus = 'Not yet due';

        if (thirtyDue) {
          thirtyStatus = hasCheckin ? 'Done' : 'Overdue';
          if (hasCheckin) totalCompleted++;
        }
        if (ninetyDue) {
          ninetyStatus = hasCheckin ? 'Done' : 'Overdue';
          if (hasCheckin) totalCompleted++;
        }

        const candidateOwner = p.candidate?.owner ? `${p.candidate.owner.firstName || ''} ${p.candidate.owner.lastName || ''}`.trim() : '';
        const jobOwner = p.jobOrder?.owner ? `${p.jobOrder.owner.firstName || ''} ${p.jobOrder.owner.lastName || ''}`.trim() : '';

        details.push({
          candidateId: candidateId || null,
          placementId: p.id,
          candidate: candidateName,
          candidateOwner,
          jobOwner,
          client,
          startDate,
          daysSinceStart,
          thirtyDay: thirtyStatus,
          ninetyDay: ninetyStatus,
        });
      }

      details.sort((a, b) => b.daysSinceStart - a.daysSinceStart);
      const pct = totalDue > 0 ? Math.round((totalCompleted / totalDue) * 100) : 100;

      return { label, value: pct, target: 100, format: 'percent', details };
    }

    const trCheckinGauge = buildCheckinGauge(activePlacements, trCheckinRes, 'TR Checkin Completions');
    const amCheckinGauge = buildCheckinGauge(activePlacements, amCheckinRes, 'AM Checkin Completions');

    res.json({
      rangeLabel,
      gauges: [
        { label: 'MAR Total', value: totalMAR, target: marTarget, format: 'number', details: marDetails },
        { label: 'Input', value: totalNewInput, target: 40000, format: 'currency', details: inputDetails },
        { label: 'A/B Fill Ratio - Staffing', value: abFillRatio, target: 60, format: 'percent', details: fillDetails, tooltip: 'Fills / Total Openings for A & B priority staffing jobs in the date range' },
        { label: 'Backout %', value: backoutPct, target: 10, format: 'percent', invert: true, details: backoutDetails, tooltip: 'Backout Notes / Total Placements in the date range. Lower is better.' },
        { label: 'Fill Ratio - Project', value: projFillRatio, target: 60, format: 'percent', details: projFillDetails, tooltip: 'Fills / Total Openings for Project-type jobs in the date range' },
        { ...trCheckinGauge, tooltip: 'TR 30/90 check-in completion for active placements (30-365 days old). Each placement has a 30-day and 90-day milestone. Done = a TR 30/90 note exists for the candidate.' },
        { ...amCheckinGauge, tooltip: 'AM 30/90 check-in completion for active placements (30-365 days old). Each placement has a 30-day and 90-day milestone. Done = an AM 30/90 note exists for the candidate.' },
      ],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
