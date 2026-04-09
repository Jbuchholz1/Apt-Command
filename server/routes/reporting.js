const express = require('express');
const ExcelJS = require('exceljs');
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
const { POINTS, EXCLUDED_RECRUITERS, getRecruiterTier, getSpreadGoal, bhLink } = require('../lib/recruiterConfig');
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

    const recruiters = (recruitersRes?.data || []).filter(r => !EXCLUDED_RECRUITERS.has(`${r.firstName} ${r.lastName}`));
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
      const tier = r.customDate3 ? 3 : 1;
      const spreadGoal = r.customDate3 ? 9000 : 7000;
      metricsMap[r.id] = {
        id: r.id,
        name,
        tier,
        spreadGoal,
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
        spread = Math.round((bill - pay * 1.05) * 40 * 100) / 100;
      } else if (bill > 0 && pay > 0) {
        // W2 and all other types: burden on pay
        spread = Math.round((bill - pay * 1.25) * 40 * 100) / 100;
      }

      if (spread > 0 && recruiterId && metricsMap[recruiterId]) {
        metricsMap[recruiterId].metrics.newInput += Math.round(spread * commPct * 100) / 100;
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
      const tier = am.customDate3 ? 3 : 1;
      const spreadGoal = am.customDate3 ? 9000 : 7000;
      metricsMap[am.id] = {
        id: am.id,
        name,
        tier,
        spreadGoal,
        jobMetrics: { newReqs: 0, openings: 0, closedReqs: 0, fills: 0, losses: 0, washed: 0, newPlacements: 0 },
        jobDetails: { newReqs: [], closedReqs: [], fills: [], losses: [], washed: [], newPlacements: [] },
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
    const fmtJob = (job) => ({
      jobId: job.id,
      title: job.title || '',
      status: Array.isArray(job.status) ? job.status[0] : (job.status || ''),
      openings: job.numOpenings || 0,
      client: job.clientCorporation?.name || '',
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
        if (status === 'filled' || status === 'placed') {
          metricsMap[ownerId].jobMetrics.fills++;
          metricsMap[ownerId].jobDetails.fills.push(detail);
        } else if (status === 'lost') {
          metricsMap[ownerId].jobMetrics.losses++;
          metricsMap[ownerId].jobDetails.losses.push(detail);
        } else if (status === 'wash') {
          metricsMap[ownerId].jobMetrics.washed++;
          metricsMap[ownerId].jobDetails.washed.push(detail);
        }
        metricsMap[ownerId].jobMetrics.closedReqs++;
        metricsMap[ownerId].jobDetails.closedReqs.push(detail);
      }
    }

    // --- Placements (New Placements + New Input) ---
    for (const p of placements) {
      const comm = salesCommMap[p.id];
      const amId = comm?.id;
      if (amId && metricsMap[amId]) {
        metricsMap[amId].jobMetrics.newPlacements++;
        metricsMap[amId].jobDetails.newPlacements.push({
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
          metricsMap[amId].newInput += Math.round(spread * commPct * 100) / 100;
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
router.get('/recruiter-export', async (req, res, next) => {
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
      iws.addRow({
        recruiter: recruiterNames[uid] || '',
        date: iv.dateBegin ? formatDate(iv.dateBegin) : '',
        jobId: iv.jobOrder?.id || '',
        jobTitle: iv.jobOrder?.title || '',
        candidate: iv.candidateReference ? `${iv.candidateReference.firstName || ''} ${iv.candidateReference.lastName || ''}`.trim() : '',
      });
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
      sws.addRow({
        submittedBy: recruiterNames[uid] || '',
        jobId: s.jobOrder?.id || '',
        jobTitle: s.jobOrder?.title || '',
        date: s.dateAdded ? formatDate(s.dateAdded) : '',
        company: s.clientCorporation?.name || '',
        candidate: s.candidate ? `${s.candidate.firstName || ''} ${s.candidate.lastName || ''}`.trim() : '',
      });
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
      pws.addRow({
        id: p.id,
        jobTitle: p.jobOrder?.title || '',
        candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
        empType: p.employeeType || '',
        startDate: p.dateBegin ? formatDate(p.dateBegin) : '',
        billRate: p.clientBillRate || '',
        payRate: p.payRate || '',
      });
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
router.get('/sales-export', async (req, res, next) => {
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
      aws.addRow({
        am: amNames[a.owner?.id] || '',
        date: a.dateBegin ? formatDate(a.dateBegin) : '',
        type: a.type || '',
        client: a.clientContactReference?.clientCorporation?.name || a.jobOrder?.clientCorporation?.name || '',
        subject: a.subject || '',
      });
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
      jws.addRow({
        id: j.id,
        title: j.title || '',
        status: Array.isArray(j.status) ? j.status[0] : (j.status || ''),
        openings: j.numOpenings || 0,
        owner: j.owner ? `${j.owner.firstName || ''} ${j.owner.lastName || ''}`.trim() : '',
        client: j.clientCorporation?.name || '',
      });
    }

    // Closed Jobs sheet
    const cws = wb.addWorksheet('Closed Jobs');
    cws.columns = jws.columns.map(c => ({ ...c }));
    styleSheet(cws, 6);
    for (const j of (closedJobsRes?.data || [])) {
      cws.addRow({
        id: j.id,
        title: j.title || '',
        status: Array.isArray(j.status) ? j.status[0] : (j.status || ''),
        openings: j.numOpenings || 0,
        owner: j.owner ? `${j.owner.firstName || ''} ${j.owner.lastName || ''}`.trim() : '',
        client: j.clientCorporation?.name || '',
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Sales_Dashboard_${start}_${end}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
