const express = require('express');
const ExcelJS = require('exceljs');
const { sanitizeRow } = require('../lib/excelSafe');
const router = express.Router();
const {
  getRecruiterUsers,
  getClientSubsInRange,
  getInterviewsInRange,
  getPlacementsInRange,
  getRecruitingCommissions,
  getLeadsInRange,
  getAMUsers,
  getAppointmentsInRange,
  getNewJobsInRange,
  getClosedJobsInRange,
  getSalesCommissions,
  getOpenJobs,
  getActivePlacementsWithClient,
  getCheckinNotesForType,
  getBackoutNotesInRange,
  countActivePlacementsAsOf,
  getOffboardsInWindow,
  getOffersExtendedInRange,
} = require('../lib/bullhorn');
const { getAllOverrides } = require('../lib/db');
const { POINTS, EXCLUDED_RECRUITERS, getRecruiterTier, getSpreadGoal, bhLink } = require('../lib/recruiterConfig');
const { SALES_POINTS, ACTIVITY_LABELS, ACTIVITY_ORDER, EXCLUDED_AMS, getAMTier, getAMSpreadGoal } = require('../lib/salesConfig');
const { requireModule } = require('../middleware/adminAuth');

// Reporting is split per sub-dashboard so admins can grant fine-grained access.
const requireRecruiter = requireModule('reporting_recruiter');
const requireSales = requireModule('reporting_sales');
const requireExec = requireModule('reporting_executive');

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
router.get('/recruiter-dashboard', requireRecruiter, async (req, res, next) => {
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

    // Fire 5 parallel Bullhorn queries
    const [recruitersRes, subsRes, interviewsRes, placementsRes, leadsRes] = await Promise.all([
      getRecruiterUsers(),
      getClientSubsInRange(startMs, endMs),
      getInterviewsInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
      getLeadsInRange(startMs, endMs),
    ]);

    const recruiters = (recruitersRes?.data || []).filter(r => !EXCLUDED_RECRUITERS.has(`${r.firstName} ${r.lastName}`));
    const subs = subsRes?.data || [];
    const interviews = interviewsRes?.data || [];
    const placements = placementsRes?.data || [];
    const leads = leadsRes?.data || [];

    // Look up recruiting commissions for placements (supports split credit)
    let commissionMap = {}; // placementId → [{ id, name, percentage }, ...]
    if (placements.length > 0) {
      const placementIds = placements.map(p => p.id);
      try {
        const commRes = await getRecruitingCommissions(placementIds);
        const commissions = commRes?.data || [];
        for (const c of commissions) {
          const pId = c.placement?.id;
          if (pId && c.user) {
            if (!commissionMap[pId]) commissionMap[pId] = [];
            commissionMap[pId].push({
              id: c.user.id,
              name: `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim(),
              percentage: c.commissionPercentage || 1,
            });
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
      const tier = r.customDate3 ? 3 : 1;
      const spreadGoal = r.customDate3 ? 9000 : 7000;
      metricsMap[r.id] = {
        id: r.id,
        name,
        tier,
        spreadGoal,
        metrics: { clientSubs: 0, interviews: 0, starts: 0, mar: 0, newInput: 0, leads: 0 },
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

    // Starts + New Input detail (from Placement, supports split recruiting credit)
    const startsDetail = [];
    const newInputDetail = [];
    for (const p of placements) {
      const commissions = commissionMap[p.id] || [];

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
        // W2 and all other types: burden on pay
        spread = Math.round((bill - pay * 1.25) * 40 * 100) / 100;
      }

      const client = p.jobOrder?.clientCorporation?.name || '';
      const beginMs = p.dateBegin;
      const endMs2 = p.dateEnd;
      const daysBetween = (beginMs && endMs2) ? Math.round((endMs2 - beginMs) / (1000 * 60 * 60 * 24) / 7) : '';

      // Credit each recruiter on the split
      for (const comm of commissions) {
        const recruiterId = comm.id;
        const recruiterName = comm.name;
        const commPct = comm.percentage || 0;

        if (recruiterId && metricsMap[recruiterId] && commPct > 0) {
          metricsMap[recruiterId].metrics.starts += commPct;
        }

        if (spread > 0 && recruiterId && metricsMap[recruiterId]) {
          metricsMap[recruiterId].metrics.newInput += Math.round(spread * commPct * 100) / 100;
        }

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
          newInput: Math.round(spread * commPct * 100) / 100,
          recruiterId,
          client,
        });
      }

      // If no commission records, still add to detail for visibility
      if (commissions.length === 0) {
        startsDetail.push({
          recruiter: '(No commission)',
          placementId: p.id,
          placementLink: bhLink('Placement', p.id),
          client,
          candidateId: p.candidate?.id || '',
          candidateName: candidateName(p.candidate),
          candidateLink: p.candidate?.id ? bhLink('Candidate', p.candidate.id) : '',
          guarantee: endMs2 ? formatISO(endMs2) : 'Yes',
          date: formatDate(beginMs),
          recruiterId: null,
        });

        newInputDetail.push({
          recruiter: '(No commission)',
          placementId: p.id,
          placementLink: bhLink('Placement', p.id),
          employeeType: p.employeeType || '',
          candidateName: candidateName(p.candidate),
          startDate: formatDate(beginMs),
          scheduledEnd: endMs2 ? formatDate(endMs2) : '',
          daysBetween,
          guarantee: endMs2 ? formatISO(endMs2) : 'Yes',
          newInput: 0,
          recruiterId: null,
          client,
        });
      }
    }

    // Leads detail (from Lead entity, owner = recruiter)
    const leadsDetail = [];
    for (const lead of leads) {
      const userId = lead.owner?.id;
      if (userId && metricsMap[userId]) {
        metricsMap[userId].metrics.leads++;
      }
      leadsDetail.push({
        recruiter: recruiterNames[userId] || (lead.owner ? `${lead.owner.firstName || ''} ${lead.owner.lastName || ''}`.trim() : ''),
        dateAdded: formatDate(lead.dateAdded),
        leadId: lead.id,
        leadName: lead.name || '',
        companyName: lead.companyName || '',
        status: lead.status || '',
        recruiterId: userId,
      });
    }

    // Calculate MAR and points
    const totals = { clientSubs: 0, interviews: 0, starts: 0, mar: 0, newInput: 0, leads: 0 };
    const recruiterList = Object.values(metricsMap).map(r => {
      const m = r.metrics;
      m.starts = Math.ceil(m.starts * 4) / 4; // Round up to nearest .25
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
      totals.leads += m.leads;

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
        leads: leadsDetail,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reporting/sales-dashboard?start=2026-04-01&end=2026-04-09
router.get('/sales-dashboard', requireSales, async (req, res, next) => {
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

    // Get AMs first, then query appointments filtered to their IDs
    const amRes = await getAMUsers();
    const ams = (amRes?.data || []).filter(am => !EXCLUDED_AMS.has(`${am.firstName} ${am.lastName}`));
    const amIdList = ams.map(am => am.id);

    const [apptRes, newJobsRes, closedJobsRes, placementsRes] = await Promise.all([
      getAppointmentsInRange(startMs, endMs, amIdList),
      getNewJobsInRange(startMs, endMs),
      getClosedJobsInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
    ]);
    const appointments = apptRes?.data || [];
    const newJobs = newJobsRes?.data || [];
    const closedJobs = closedJobsRes?.data || [];
    const placements = placementsRes?.data || [];

    // Sales commissions for placements (supports split credit)
    let salesCommMap = {}; // placementId → [{ id, name, percentage }, ...]
    if (placements.length > 0) {
      try {
        const commRes = await getSalesCommissions(placements.map(p => p.id));
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

    // AM name lookup and metrics map
    const amNames = {};
    const amIds = new Set();
    const metricsMap = {};
    for (const am of ams) {
      const name = `${am.firstName} ${am.lastName}`;
      amNames[am.id] = name;
      amIds.add(am.id);
      const tier = am.customDate3 ? 3 : 1;
      const spreadGoal = am.customDate3 ? 9000 : 7000;
      metricsMap[am.id] = {
        id: am.id,
        name,
        tier,
        spreadGoal,
        jobMetrics: { newReqs: 0, openings: 0, closedReqs: 0, fills: 0, losses: 0, washed: 0, newPlacements: 0 },
        jobDetails: { newReqs: [], closedReqs: [], fills: [], losses: [], washed: [], newPlacements: [] },
        priorityBreakdown: {
          A: { reqs: 0, fills: 0, losses: 0, washed: 0, details: { reqs: [], fills: [], losses: [], washed: [] } },
          B: { reqs: 0, fills: 0, losses: 0, washed: 0, details: { reqs: [], fills: [], losses: [], washed: [] } },
          C: { reqs: 0, fills: 0, losses: 0, washed: 0, details: { reqs: [], fills: [], losses: [], washed: [] } },
        },
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
    const priorityLetter = (t) => {
      const n = Number(t);
      if (n === 1) return 'A';
      if (n === 2) return 'B';
      if (n === 3) return 'C';
      return null;
    };
    const fmtJob = (job) => ({
      jobId: job.id,
      title: job.title || '',
      status: Array.isArray(job.status) ? job.status[0] : (job.status || ''),
      openings: job.numOpenings || 0,
      client: job.clientCorporation?.name || '',
      priority: priorityLetter(job.type) || '',
      link: bhLink('JobOrder', job.id),
    });

    for (const job of newJobs) {
      const ownerId = job.owner?.id;
      if (ownerId && metricsMap[ownerId]) {
        metricsMap[ownerId].jobMetrics.newReqs++;
        metricsMap[ownerId].jobMetrics.openings += (job.numOpenings || 0);
        metricsMap[ownerId].jobDetails.newReqs.push(fmtJob(job));
      }
    }

    for (const job of closedJobs) {
      const ownerId = job.owner?.id;
      if (ownerId && metricsMap[ownerId]) {
        const rawStatus = Array.isArray(job.status) ? job.status[0] : job.status;
        const status = (rawStatus || '').toLowerCase();
        const detail = fmtJob(job);
        const prio = priorityLetter(job.type);
        const pb = prio ? metricsMap[ownerId].priorityBreakdown[prio] : null;
        if (pb) {
          pb.reqs++;
          pb.details.reqs.push(detail);
        }
        if (status === 'filled' || status === 'placed') {
          metricsMap[ownerId].jobMetrics.fills++;
          metricsMap[ownerId].jobDetails.fills.push(detail);
          if (pb) { pb.fills++; pb.details.fills.push(detail); }
        } else if (status === 'lost') {
          metricsMap[ownerId].jobMetrics.losses++;
          metricsMap[ownerId].jobDetails.losses.push(detail);
          if (pb) { pb.losses++; pb.details.losses.push(detail); }
        } else if (status === 'wash') {
          metricsMap[ownerId].jobMetrics.washed++;
          metricsMap[ownerId].jobDetails.washed.push(detail);
          if (pb) { pb.washed++; pb.details.washed.push(detail); }
        }
        metricsMap[ownerId].jobMetrics.closedReqs++;
        metricsMap[ownerId].jobDetails.closedReqs.push(detail);
      }
    }

    // --- Placements (New Placements + New Input, supports split sales credit) ---
    for (const p of placements) {
      const commissions = salesCommMap[p.id] || [];

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

      for (const comm of commissions) {
        const amId = comm.id;
        if (amId && metricsMap[amId]) {
          metricsMap[amId].jobMetrics.newPlacements++;
          metricsMap[amId].jobDetails.newPlacements.push({
            placementId: p.id,
            jobTitle: p.jobOrder?.title || '',
            client: p.jobOrder?.clientCorporation?.name || '',
            candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
            link: bhLink('Placement', p.id),
          });

          if (spread > 0) {
            const commPct = comm.percentage || 1;
            metricsMap[amId].newInput += Math.round(spread * commPct * 100) / 100;
          }
        }
      }
    }

    // --- Appointments (activity points + details) ---
    const appointmentDetails = {}; // { `${amId}-${type}`: [records] }
    for (const appt of appointments) {
      const ownerId = appt.owner?.id;
      const type = appt.type || '';
      if (ownerId && metricsMap[ownerId] && SALES_POINTS[type] !== undefined) {
        metricsMap[ownerId].activities[type].raw++;
        metricsMap[ownerId].activities[type].points += SALES_POINTS[type];
        if (type === 'New Meeting') {
          metricsMap[ownerId].activityCount++;
        }
        const key = `${ownerId}-${ACTIVITY_LABELS[type] || type}`;
        if (!appointmentDetails[key]) appointmentDetails[key] = [];
        appointmentDetails[key].push({
          id: appt.id,
          date: formatDate(appt.dateBegin),
          type: ACTIVITY_LABELS[type] || type,
          subject: appt.subject || '',
          client: appt.clientContactReference?.clientCorporation?.name || appt.jobOrder?.clientCorporation?.name || '',
        });
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
      // Attach detail records keyed by display label
      am.activityDetails = {};
      for (const type of ACTIVITY_ORDER) {
        const label = ACTIVITY_LABELS[type] || type;
        const key = `${am.id}-${label}`;
        am.activityDetails[label] = appointmentDetails[key] || [];
      }
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

// --- Excel export helpers ---
const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF04144F' } } };

function styleSheet(ws, colCount) {
  const row = ws.getRow(1);
  row.font = headerStyle.font;
  row.fill = headerStyle.fill;
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + colCount)}1` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// GET /api/reporting/recruiter-export?start=...&end=...
router.get('/recruiter-export', requireRecruiter, async (req, res, next) => {
  try {
    // Reuse the recruiter-dashboard logic by calling the handler internally
    const url = `/recruiter-dashboard?start=${req.query.start}&end=${req.query.end}`;
    const fakeRes = { data: null, json(d) { this.data = d; } };
    await new Promise((resolve, reject) => {
      const fakeReq = { query: req.query };
      // Just re-fetch the data directly
      resolve();
    });

    // Fetch data directly
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    const startMs = new Date(start).getTime();
    const endDate = new Date(end); endDate.setHours(23, 59, 59, 999);
    const endMs = endDate.getTime();

    const [recruitersRes, subsRes, interviewsRes, placementsRes] = await Promise.all([
      getRecruiterUsers(), getClientSubsInRange(startMs, endMs),
      getInterviewsInRange(startMs, endMs), getPlacementsInRange(startMs, endMs),
    ]);
    const recruiters = (recruitersRes?.data || []).filter(r => !EXCLUDED_RECRUITERS.has(`${r.firstName} ${r.lastName}`));
    const subs = subsRes?.data || [];
    const interviews = interviewsRes?.data || [];
    const placements = placementsRes?.data || [];

    const wb = new ExcelJS.Workbook();

    // Interviews sheet
    const iws = wb.addWorksheet('Interviews');
    iws.columns = [
      { header: 'Recruiter', key: 'recruiter', width: 20 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Job ID', key: 'jobId', width: 10 },
      { header: 'Job Title', key: 'jobTitle', width: 35 },
      { header: 'Candidate', key: 'candidate', width: 25 },
    ];
    styleSheet(iws, 5);
    const recruiterNames = {};
    for (const r of recruiters) recruiterNames[r.id] = `${r.firstName} ${r.lastName}`;
    for (const iv of interviews) {
      const uid = iv.owner?.id;
      iws.addRow(sanitizeRow({
        recruiter: recruiterNames[uid] || '',
        date: iv.dateBegin ? formatDate(iv.dateBegin) : '',
        jobId: iv.jobOrder?.id || '',
        jobTitle: iv.jobOrder?.title || '',
        candidate: iv.candidateReference ? `${iv.candidateReference.firstName || ''} ${iv.candidateReference.lastName || ''}`.trim() : '',
      }));
    }

    // Client Subs sheet
    const sws = wb.addWorksheet('Client Submissions');
    sws.columns = [
      { header: 'Submitted By', key: 'submittedBy', width: 20 },
      { header: 'Job ID', key: 'jobId', width: 10 },
      { header: 'Job Title', key: 'jobTitle', width: 35 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Company', key: 'company', width: 25 },
      { header: 'Candidate', key: 'candidate', width: 25 },
    ];
    styleSheet(sws, 6);
    for (const s of subs) {
      const uid = s.user?.id;
      sws.addRow(sanitizeRow({
        submittedBy: recruiterNames[uid] || '',
        jobId: s.jobOrder?.id || '',
        jobTitle: s.jobOrder?.title || '',
        date: s.dateAdded ? formatDate(s.dateAdded) : '',
        company: s.clientCorporation?.name || '',
        candidate: s.candidate ? `${s.candidate.firstName || ''} ${s.candidate.lastName || ''}`.trim() : '',
      }));
    }

    // Placements sheet
    const pws = wb.addWorksheet('Placements');
    pws.columns = [
      { header: 'Placement ID', key: 'id', width: 12 },
      { header: 'Job Title', key: 'jobTitle', width: 35 },
      { header: 'Candidate', key: 'candidate', width: 25 },
      { header: 'Type', key: 'empType', width: 14 },
      { header: 'Start Date', key: 'startDate', width: 14 },
      { header: 'Bill Rate', key: 'billRate', width: 10 },
      { header: 'Pay Rate', key: 'payRate', width: 10 },
    ];
    styleSheet(pws, 7);
    for (const p of placements) {
      pws.addRow(sanitizeRow({
        id: p.id,
        jobTitle: p.jobOrder?.title || '',
        candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
        empType: p.employeeType || '',
        startDate: p.dateBegin ? formatDate(p.dateBegin) : '',
        billRate: p.clientBillRate || '',
        payRate: p.payRate || '',
      }));
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Recruiter_Dashboard_${start}_${end}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

// GET /api/reporting/sales-export?start=...&end=...
router.get('/sales-export', requireSales, async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    const startMs = new Date(start).getTime();
    const endDate = new Date(end); endDate.setHours(23, 59, 59, 999);
    const endMs = endDate.getTime();

    const amRes = await getAMUsers();
    const ams = (amRes?.data || []).filter(a => !EXCLUDED_AMS.has(`${a.firstName} ${a.lastName}`));
    const amIds = ams.map(a => a.id);

    const [apptRes, newJobsRes, closedJobsRes, placementsRes] = await Promise.all([
      getAppointmentsInRange(startMs, endMs, amIds),
      getNewJobsInRange(startMs, endMs),
      getClosedJobsInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
    ]);

    const wb = new ExcelJS.Workbook();

    // Appointments sheet
    const aws = wb.addWorksheet('Appointments');
    aws.columns = [
      { header: 'AM', key: 'am', width: 20 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Type', key: 'type', width: 20 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Subject', key: 'subject', width: 40 },
    ];
    styleSheet(aws, 5);
    const amNames = {};
    for (const a of ams) amNames[a.id] = `${a.firstName} ${a.lastName}`;
    for (const a of (apptRes?.data || [])) {
      aws.addRow(sanitizeRow({
        am: amNames[a.owner?.id] || '',
        date: a.dateBegin ? formatDate(a.dateBegin) : '',
        type: a.type || '',
        client: a.clientContactReference?.clientCorporation?.name || a.jobOrder?.clientCorporation?.name || '',
        subject: a.subject || '',
      }));
    }

    // New Jobs sheet
    const jws = wb.addWorksheet('New Jobs');
    jws.columns = [
      { header: 'Job ID', key: 'id', width: 10 },
      { header: 'Title', key: 'title', width: 35 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Openings', key: 'openings', width: 10 },
      { header: 'Owner', key: 'owner', width: 20 },
      { header: 'Client', key: 'client', width: 25 },
    ];
    styleSheet(jws, 6);
    for (const j of (newJobsRes?.data || [])) {
      jws.addRow(sanitizeRow({
        id: j.id,
        title: j.title || '',
        status: Array.isArray(j.status) ? j.status[0] : (j.status || ''),
        openings: j.numOpenings || 0,
        owner: j.owner ? `${j.owner.firstName || ''} ${j.owner.lastName || ''}`.trim() : '',
        client: j.clientCorporation?.name || '',
      }));
    }

    // Closed Jobs sheet
    const cws = wb.addWorksheet('Closed Jobs');
    cws.columns = jws.columns.map(c => ({ ...c }));
    styleSheet(cws, 6);
    for (const j of (closedJobsRes?.data || [])) {
      cws.addRow(sanitizeRow({
        id: j.id,
        title: j.title || '',
        status: Array.isArray(j.status) ? j.status[0] : (j.status || ''),
        openings: j.numOpenings || 0,
        owner: j.owner ? `${j.owner.firstName || ''} ${j.owner.lastName || ''}`.trim() : '',
        client: j.clientCorporation?.name || '',
      }));
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Sales_Dashboard_${start}_${end}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

// --- Team Alerts ---

const BH_BASE_ALERTS = 'https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm';

function isOverdueDate(str, emptyPhrase) {
  if (!str || str.toLowerCase().includes(emptyPhrase)) return true;
  const d = new Date(str);
  if (isNaN(d.getTime())) return true;
  return d <= new Date();
}

// GET /api/reporting/team-alerts?team=recruiting|sales
// Gate matches the requested team — recruiter-team alerts need reporting_recruiter,
// sales-team alerts need reporting_sales. Both share one handler.
function requireTeamAlertsAccess(req, res, next) {
  const team = req.query.team || 'recruiting';
  const gate = team === 'sales' ? requireSales : requireRecruiter;
  return gate(req, res, next);
}
router.get('/team-alerts', requireTeamAlertsAccess, async (req, res, next) => {
  try {
    const team = req.query.team || 'recruiting';

    // Fetch all data in parallel
    const [usersRes, jobsRes, overrides, placementsRes, trCheckins, amCheckins] = await Promise.all([
      team === 'recruiting' ? getRecruiterUsers() : getAMUsers(),
      getOpenJobs(),
      getAllOverrides(),
      getActivePlacementsWithClient(),
      getCheckinNotesForType('TR 30/90'),
      getCheckinNotesForType('AM 30/90'),
    ]);

    const excludeSet = team === 'recruiting' ? EXCLUDED_RECRUITERS : EXCLUDED_AMS;
    const users = (usersRes?.data || []).filter(u => !excludeSet.has(`${u.firstName} ${u.lastName}`));
    const jobs = jobsRes?.data || [];
    const activePlacements = placementsRes?.data || [];
    const checkinNotes = team === 'recruiting' ? trCheckins : amCheckins;

    // Build set of candidate IDs with check-in notes
    const candidateIdsWithCheckin = new Set();
    const checkinData = checkinNotes?.data || [];
    for (const n of checkinData) {
      const entities = n.personReference ? [n.personReference] : [];
      for (const e of entities) {
        if (e.id) candidateIdsWithCheckin.add(e.id);
      }
    }

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const alerts = [];

    for (const user of users) {
      const userId = user.id;
      const userName = `${user.firstName} ${user.lastName}`;
      const userAlerts = { name: userName, overdueFollowUps: [], missedDeadlines: [], overdueCheckins: [] };

      // Check jobs for overdue follow-ups and deadlines
      for (const job of jobs) {
        const status = Array.isArray(job.status) ? job.status[0] : (job.status || '');
        if (!['Accepting Candidates', 'Covered', 'Offer Out'].includes(status)) continue;

        const ov = overrides[job.id];
        const followUp = ov?.follow_up || '';
        const deadline = ov?.deadline || '';

        // Check association: TR via assignedUsers, AM via owner
        const ownerId = job.owner?.id;
        const assignedIds = (job.assignedUsers?.data || []).map(u => u.id);
        const isAssociated = team === 'recruiting'
          ? assignedIds.includes(userId)
          : ownerId === userId;
        if (!isAssociated) continue;

        const title = job.title || '';
        const client = job.clientCorporation?.name || '';

        if (isOverdueDate(followUp, 'no follow up')) {
          userAlerts.overdueFollowUps.push({ jobId: job.id, title, client, value: followUp || 'No follow up set' });
        }
        if (isOverdueDate(deadline, 'no deadline')) {
          userAlerts.missedDeadlines.push({ jobId: job.id, title, client, value: deadline || 'No deadline set' });
        }
      }

      // Check placements for overdue check-ins
      for (const p of activePlacements) {
        if (!p.dateBegin) continue;

        const ownerMatch = team === 'recruiting'
          ? p.candidate?.owner?.id === userId
          : p.jobOrder?.owner?.id === userId;
        if (!ownerMatch) continue;

        const daysSince = Math.floor((now - p.dateBegin) / DAY_MS);
        if (daysSince < 30 || daysSince > 365) continue;

        const candidateId = p.candidate?.id;
        const hasCheckin = candidateId && candidateIdsWithCheckin.has(candidateId);
        if (hasCheckin) continue; // Has a check-in, not overdue

        const reasons = [];
        if (daysSince >= 30) reasons.push('30-day');
        if (daysSince >= 90) reasons.push('90-day');

        const candName = p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '';

        userAlerts.overdueCheckins.push({
          candidateId,
          candidate: candName,
          client: p.jobOrder?.clientCorporation?.name || '',
          reason: `${reasons.join(' & ')} overdue (${daysSince}d)`,
        });
      }

      const total = userAlerts.overdueFollowUps.length + userAlerts.missedDeadlines.length + userAlerts.overdueCheckins.length;
      if (total > 0) {
        alerts.push({ ...userAlerts, total });
      }
    }

    // Sort by total alerts descending
    alerts.sort((a, b) => b.total - a.total);

    res.json({ alerts });
  } catch (err) {
    next(err);
  }
});

// GET /api/reporting/executive-dashboard?start=2026-01-01&end=2026-04-20 (admin only)
router.get('/executive-dashboard', requireExec, async (req, res, next) => {
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

    const rangeLabel = `${start} to ${end}`;

    // --- Fetch placements (for Current New Input) and open jobs (for Potential New Input) in parallel ---
    const [placementsRes, openJobsRes] = await Promise.all([
      getPlacementsInRange(startMs, endMs),
      getOpenJobs(),
    ]);

    const placements = placementsRes?.data || [];
    const openJobs = openJobsRes?.data || [];

    // --- Current New Input — mirrors the APT Health /kpis "Input" gauge formula ---
    // Spread × sales commission %. Spread by employee type: perm, corp-to-corp, W2/other.
    let currentNewInput = 0;
    const currentDetails = [];

    if (placements.length > 0) {
      const pIds = placements.map(p => p.id);
      const salesCommRes = await getSalesCommissions(pIds);

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
          currentNewInput += input;
          currentDetails.push({
            placementId: p.id,
            jobTitle: p.jobOrder?.title || '',
            client: p.jobOrder?.clientCorporation?.name || '',
            empType: p.employeeType || '',
            am: c.user ? `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim() : '',
            input,
          });
        }
      }
    }
    currentNewInput = Math.round(currentNewInput * 100) / 100;
    currentDetails.sort((a, b) => b.input - a.input);

    // --- Potential New Input — same per-job formula as the Req Board's ceSpread/permFee,
    //     multiplied by # of openings to project the full open-req pipeline.
    //     Contract (W2/other):  (billRate − payRate × 1.25) × 40 weekly
    //     Corp-to-Corp:         (billRate − payRate × 1.05) × 40 weekly
    //     Direct Hire (perm):   (salary × feeArrangement) / 26   weekly amortization
    let potentialNewInput = 0;
    const potentialDetails = [];

    for (const j of openJobs) {
      const bill = Number(j.clientBillRate) || 0;
      const pay = Number(j.payRate) || 0;
      const salary = Number(j.salary) || 0;
      const feePercent = Number(j.feeArrangement) || 0;
      const openings = Number(j.numOpenings) || 0;
      const empType = (j.employmentType || '').toLowerCase();

      let perOpening = 0;
      let kind = '';
      let rateDetail = '';

      if (empType === 'corp-to-corp' && bill > 0 && pay > 0) {
        const spread = (bill - pay * 1.05) * 40;
        if (spread > 0) {
          perOpening = Math.round(spread * 100) / 100;
          kind = 'Corp-to-Corp Spread';
          rateDetail = `$${pay}/$${bill}`;
        }
      } else if (empType === 'direct hire' && salary > 0 && feePercent > 0) {
        perOpening = Math.round((salary * feePercent / 26) * 100) / 100;
        kind = 'Perm Fee';
        rateDetail = `$${Number(salary).toLocaleString('en-US')} @ ${Math.round(feePercent * 100)}%`;
      } else if (bill > 0 && pay > 0) {
        const spread = (bill - pay * 1.25) * 40;
        if (spread > 0) {
          perOpening = Math.round(spread * 100) / 100;
          kind = 'Contract Spread';
          rateDetail = `$${pay}/$${bill}`;
        }
      } else if (salary > 0 && feePercent > 0) {
        // Fall-back for perm-style records that don't have employmentType set to "Direct Hire"
        perOpening = Math.round((salary * feePercent / 26) * 100) / 100;
        kind = 'Perm Fee';
        rateDetail = `$${Number(salary).toLocaleString('en-US')} @ ${Math.round(feePercent * 100)}%`;
      }

      if (perOpening > 0 && openings > 0) {
        const total = Math.round(perOpening * openings * 100) / 100;
        potentialNewInput += total;
        potentialDetails.push({
          jobId: j.id,
          title: j.title || '',
          client: j.clientCorporation?.name || '',
          owner: j.owner ? `${j.owner.firstName || ''} ${j.owner.lastName || ''}`.trim() : '',
          employmentType: j.employmentType || '',
          kind,
          rateDetail,
          numOpenings: openings,
          billRate: bill || null,
          payRate: pay || null,
          salary: salary || null,
          feePercent: feePercent || null,
          perOpening,
          total,
        });
      }
    }
    potentialNewInput = Math.round(potentialNewInput * 100) / 100;
    potentialDetails.sort((a, b) => b.total - a.total);

    res.json({
      rangeLabel,
      dateRange: { start, end },
      currentNewInput: {
        value: currentNewInput,
        formula: 'Spread (by employee type) × Sales Commission % per placement in date range. Same calculation as APT Health Input gauge.',
        details: currentDetails,
      },
      potentialNewInput: {
        value: potentialNewInput,
        formula: 'Per-opening weekly spread (Req Board formula): Contract = (Bill − Pay × 1.25) × 40, Corp-to-Corp = (Bill − Pay × 1.05) × 40, Direct Hire = (Salary × Fee%) / 26. Each multiplied by # of Openings, summed across open reqs.',
        openReqCount: potentialDetails.length,
        details: potentialDetails,
      },
    });
  } catch (err) {
    next(err);
  }
});

// --- Helpers shared across the new executive endpoints ---

function rangeMs(start, end) {
  const startMs = new Date(start).getTime();
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);
  const endMs = endDate.getTime();
  if (isNaN(startMs) || isNaN(endMs)) return null;
  return { startMs, endMs };
}

// Sums spread × sales commission % across a list of placements.
// Mirrors the formula in /executive-dashboard's currentNewInput.
async function sumNewInput(placements) {
  if (!placements?.length) return 0;
  const pIds = placements.map(p => p.id);
  const salesCommRes = await getSalesCommissions(pIds);
  let total = 0;
  for (const c of (salesCommRes?.data || [])) {
    const p = placements.find(pl => pl.id === c.placement?.id);
    if (!p || !c.commissionPercentage) continue;
    const bill = Number(p.clientBillRate) || 0;
    const pay = Number(p.payRate) || 0;
    const sal = Number(p.salary) || 0;
    const feeRate = Number(p.fee) || 0;
    const empType = (p.employeeType || '').toLowerCase();
    let spread = 0;
    if (empType === 'perm' && sal > 0 && feeRate > 0) spread = sal * feeRate / 26;
    else if (empType === 'corp-to-corp' && bill > 0 && pay > 0) spread = (bill - pay * 1.05) * 40;
    else if (bill > 0 && pay > 0) spread = (bill - pay * 1.25) * 40;
    total += spread * (c.commissionPercentage || 1);
  }
  return Math.round(total * 100) / 100;
}

// GET /api/reporting/executive-weekly?start=&end= (admin)
// Returns: headcount Δ vs prior week, attrition, offers extended/accepted
router.get('/executive-weekly', requireExec, async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
    const r = rangeMs(start, end);
    if (!r) return res.status(400).json({ error: 'Invalid date format' });
    const { startMs, endMs } = r;
    const priorEndMs = startMs - 1;

    const [
      currentCount,
      priorCount,
      backoutsRes,
      offersExtendedRes,
      placementsInRangeRes,
      activePlacementsRes,
    ] = await Promise.all([
      countActivePlacementsAsOf(endMs),
      countActivePlacementsAsOf(priorEndMs),
      getBackoutNotesInRange(startMs, endMs),
      getOffersExtendedInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
      getActivePlacementsWithClient(),
    ]);

    const backouts = backoutsRes?.data || [];
    const placementsInRange = placementsInRangeRes?.data || [];
    const offersExtendedList = offersExtendedRes?.data || [];
    const offersExtended = offersExtendedList.length;
    const offersAccepted = placementsInRange.length;

    const headcountDetails = (activePlacementsRes?.data || []).map(p => ({
      id: p.id,
      candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
      jobTitle: p.jobOrder?.title || '',
      client: p.jobOrder?.clientCorporation?.name || '',
      empType: p.employeeType || '',
      dateBegin: p.dateBegin || null,
      dateEnd: p.dateEnd || null,
      status: p.status || '',
    }));

    const attritionDetails = backouts.map(b => ({
      id: b.id,
      candidate: b.candidateName || '',
      target: `${b.targetEntityName || ''} ${b.targetEntityID || ''}`.trim(),
      comment: (b.comment || '').slice(0, 250),
    }));

    const offersExtendedDetails = offersExtendedList.map(s => ({
      id: s.id,
      type: 'Extended',
      candidate: s.candidate ? `${s.candidate.firstName || ''} ${s.candidate.lastName || ''}`.trim() : '',
      jobTitle: s.jobOrder?.title || '',
      client: s.jobOrder?.clientCorporation?.name || '',
      date: s.dateLastModified || s.dateAdded || null,
    }));
    const offersAcceptedDetails = placementsInRange.map(p => ({
      id: p.id,
      type: 'Accepted',
      candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
      jobTitle: p.jobOrder?.title || '',
      client: p.jobOrder?.clientCorporation?.name || '',
      date: p.dateBegin || null,
    }));

    res.json({
      dateRange: { start, end },
      headcount: {
        current: currentCount,
        priorWeek: priorCount,
        delta: currentCount - priorCount,
        details: headcountDetails,
      },
      attrition: {
        count: backouts.length,
        details: attritionDetails,
      },
      offers: {
        extended: offersExtended,
        accepted: offersAccepted,
        total: offersExtended + offersAccepted,
        details: [...offersExtendedDetails, ...offersAcceptedDetails],
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reporting/executive-monthly?start=&end= (admin)
// Returns: new clients, active clients, off-boards next 30d, YTD GP, net hires, retention
router.get('/executive-monthly', requireExec, async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
    const r = rangeMs(start, end);
    if (!r) return res.status(400).json({ error: 'Invalid date format' });
    const { startMs, endMs } = r;

    const now = Date.now();
    const thirtyDaysOut = now + 30 * 24 * 60 * 60 * 1000;
    const yearStartMs = new Date(`${new Date().getFullYear()}-01-01T00:00:00`).getTime();

    // Prior period for retention cohort = same-length window before [start, end]
    const windowMs = endMs - startMs;
    const priorPeriodEndMs = startMs - 1;

    const [
      newJobsRes,
      activeClientsRes,
      offboardsRes,
      placementsInRangeRes,
      ytdPlacementsRes,
      backoutsRes,
      activeClientsPriorMonthRes,
    ] = await Promise.all([
      getNewJobsInRange(startMs, endMs),
      getActivePlacementsWithClient(),
      getOffboardsInWindow(now, thirtyDaysOut),
      getPlacementsInRange(startMs, endMs),
      getPlacementsInRange(yearStartMs, endMs),
      getBackoutNotesInRange(startMs, endMs),
      // For retention, we need the set of clients with active placements at the END of the prior period.
      // We approximate using current active-placement clients as the "this-month" set,
      // and use placements that were active as of priorPeriodEndMs as the "last-month" set.
      getPlacementsInRange(priorPeriodEndMs - windowMs, priorPeriodEndMs),
    ]);

    // New clients onboarded — distinct ClientCorporation.ids in newJobs
    const newClientMap = new Map();
    for (const j of (newJobsRes?.data || [])) {
      const cId = j.clientCorporation?.id;
      if (!cId) continue;
      if (!newClientMap.has(cId)) {
        newClientMap.set(cId, {
          id: cId,
          name: j.clientCorporation?.name || '',
          firstReqDate: j.dateAdded || null,
          reqCount: 1,
        });
      } else {
        const entry = newClientMap.get(cId);
        entry.reqCount++;
        if (j.dateAdded && (!entry.firstReqDate || j.dateAdded < entry.firstReqDate)) {
          entry.firstReqDate = j.dateAdded;
        }
      }
    }
    const newClientDetails = [...newClientMap.values()];

    // Active clients — distinct clientCorporation across active placements
    const activeClientMap = new Map();
    for (const p of (activeClientsRes?.data || [])) {
      const c = p.jobOrder?.clientCorporation;
      if (!c?.id) continue;
      if (!activeClientMap.has(c.id)) {
        activeClientMap.set(c.id, { id: c.id, name: c.name || '', placementCount: 1 });
      } else {
        activeClientMap.get(c.id).placementCount++;
      }
    }
    const activeClientDetails = [...activeClientMap.values()];
    const activeClientIds = new Set(activeClientMap.keys());

    // Active placements detail (for Headcount + Off-boards tile)
    const activePlacementsDetail = (activeClientsRes?.data || []).map(p => ({
      id: p.id,
      candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
      jobTitle: p.jobOrder?.title || '',
      client: p.jobOrder?.clientCorporation?.name || '',
      empType: p.employeeType || '',
      dateBegin: p.dateBegin || null,
      dateEnd: p.dateEnd || null,
      status: p.status || '',
    }));

    // Off-boards in next 30 days (detail)
    const offboardDetails = (offboardsRes?.data || []).map(p => ({
      id: p.id,
      candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
      jobTitle: p.jobOrder?.title || '',
      client: p.jobOrder?.clientCorporation?.name || '',
      empType: p.employeeType || '',
      dateEnd: p.dateEnd || null,
      status: p.status || '',
    }));

    // YTD GP details — recompute per-placement input for the modal
    const ytdPlacements = ytdPlacementsRes?.data || [];
    const ytdGp = await sumNewInput(ytdPlacements);
    let ytdDetails = [];
    if (ytdPlacements.length > 0) {
      const pIds = ytdPlacements.map(p => p.id);
      const salesCommRes = await getSalesCommissions(pIds);
      for (const c of (salesCommRes?.data || [])) {
        const p = ytdPlacements.find(pl => pl.id === c.placement?.id);
        if (!p || !c.commissionPercentage) continue;
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
        ytdDetails.push({
          id: p.id,
          candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
          jobTitle: p.jobOrder?.title || '',
          client: p.jobOrder?.clientCorporation?.name || '',
          dateBegin: p.dateBegin || null,
          input,
        });
      }
    }
    ytdDetails.sort((a, b) => b.input - a.input);

    // Net hires detail — list new hires + backout records
    const placementsInRange = placementsInRangeRes?.data || [];
    const backouts = backoutsRes?.data || [];
    const netHiresDetails = [
      ...placementsInRange.map(p => ({
        id: `hire-${p.id}`,
        type: 'New Hire',
        candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
        jobTitle: p.jobOrder?.title || '',
        client: p.jobOrder?.clientCorporation?.name || '',
        date: p.dateBegin || null,
      })),
      ...backouts.map(b => ({
        id: `backout-${b.id}`,
        type: 'Attrition',
        candidate: b.candidateName || '',
        jobTitle: b.targetEntityName || '',
        client: '',
        date: null,
      })),
    ];

    // Retention — clients with placements in prior period vs same clients still active now
    const priorPeriodClientMap = new Map();
    for (const p of (activeClientsPriorMonthRes?.data || [])) {
      const c = p.jobOrder?.clientCorporation;
      if (!c?.id) continue;
      if (!priorPeriodClientMap.has(c.id)) {
        priorPeriodClientMap.set(c.id, { id: c.id, name: c.name || '' });
      }
    }
    const retentionDetails = [...priorPeriodClientMap.values()].map(c => ({
      ...c,
      retained: activeClientIds.has(c.id) ? 'Yes' : 'No',
    }));
    const retainedCount = retentionDetails.filter(r => r.retained === 'Yes').length;
    const retentionRate = priorPeriodClientMap.size > 0
      ? Math.round((retainedCount / priorPeriodClientMap.size) * 1000) / 10
      : null;

    res.json({
      dateRange: { start, end },
      newClients: {
        count: newClientMap.size,
        details: newClientDetails,
      },
      activeClients: {
        count: activeClientMap.size,
        details: activeClientDetails,
      },
      headcountForecast: {
        active: (activeClientsRes?.data || []).length,
        offboards30d: offboardDetails.length,
        activeDetails: activePlacementsDetail,
        offboardDetails,
      },
      ytdGp: {
        value: ytdGp,
        rangeStart: new Date(yearStartMs).toISOString().slice(0, 10),
        details: ytdDetails,
      },
      netHires: {
        newHires: placementsInRange.length,
        attrition: backouts.length,
        net: placementsInRange.length - backouts.length,
        details: netHiresDetails,
      },
      retention: {
        priorPeriodClients: priorPeriodClientMap.size,
        retainedClients: retainedCount,
        rate: retentionRate,
        details: retentionDetails,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reporting/executive-quarterly?start=&end= (admin)
// Returns: talent pipeline funnel — Lead → Submission → Interview → Placement
router.get('/executive-quarterly', requireExec, async (req, res, next) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
    const r = rangeMs(start, end);
    if (!r) return res.status(400).json({ error: 'Invalid date format' });
    const { startMs, endMs } = r;

    const [leadsRes, subsRes, interviewsRes, placementsRes] = await Promise.all([
      getLeadsInRange(startMs, endMs),
      getClientSubsInRange(startMs, endMs),
      getInterviewsInRange(startMs, endMs),
      getPlacementsInRange(startMs, endMs),
    ]);

    const leadsList = leadsRes?.data || [];
    const subsList = subsRes?.data || [];
    const interviewsList = interviewsRes?.data || [];
    const placementsList = placementsRes?.data || [];

    const pct = (num, den) => den > 0 ? Math.round((num / den) * 1000) / 10 : null;

    const funnelDetails = [
      ...leadsList.map(l => ({
        id: `lead-${l.id}`,
        stage: 'Lead',
        name: l.name || l.companyName || '',
        date: l.dateAdded || null,
      })),
      ...subsList.map(s => ({
        id: `sub-${s.id}`,
        stage: 'Submission',
        name: s.candidate ? `${s.candidate.firstName || ''} ${s.candidate.lastName || ''}`.trim() : '',
        date: s.dateAdded || null,
      })),
      ...interviewsList.map(i => ({
        id: `interview-${i.id}`,
        stage: 'Interview',
        name: i.candidateReference ? `${i.candidateReference.firstName || ''} ${i.candidateReference.lastName || ''}`.trim() : (i.subject || ''),
        date: i.dateBegin || null,
      })),
      ...placementsList.map(p => ({
        id: `placement-${p.id}`,
        stage: 'Placement',
        name: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
        date: p.dateBegin || null,
      })),
    ];

    res.json({
      dateRange: { start, end },
      funnel: {
        leads: leadsList.length,
        submissions: subsList.length,
        interviews: interviewsList.length,
        placements: placementsList.length,
        conversions: {
          subToInterview: pct(interviewsList.length, subsList.length),
          interviewToPlacement: pct(placementsList.length, interviewsList.length),
          subToPlacement: pct(placementsList.length, subsList.length),
        },
        details: funnelDetails,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
