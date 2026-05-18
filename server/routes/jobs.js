const express = require('express');
const { CLIENT_SUB_STATUSES, getOpenJobs, getRecentlyClosedJobs, getAllJobs, getJobById, getJobsByIds, getSubmissions, addNoteToJob, addNoteToOpportunity, updateJobField, updateOpportunityField, updateSubmissionField, getCorporateUsers, getOpenOpportunitiesFull, getOpportunityById, getClientContactsForCorp, createJob, getClientSubmissions, getOfferExtendedSubmissions, getPendingPlacements, getActivePlacements } = require('../lib/bullhorn');
const {
  getAllOverrides, getOverrides, upsertOverrides, getNotesForJob, addNote,
  enqueueReconciliation, OverrideConflictError,
  getSubmissionOverridesMap, upsertSubmissionOverride,
  getOpportunityOverridesMap, upsertOpportunityOverride,
} = require('../lib/db');
const { buildReqBoardWorkbook } = require('../lib/exporters');
const { requireModule } = require('../middleware/adminAuth');
const realtime = require('../lib/realtimeBroadcast');

const router = express.Router();

// This router serves two modules: req_board (jobs, submissions, notes,
// overrides) and pipeline (/opportunities/*). Each handler is gated
// individually rather than at the router level so the two modules can be
// granted independently.
const requireRb = requireModule('req_board');
const requireRbAdmin = requireModule('req_board', 'admin');
const requirePipeline = requireModule('pipeline');

// Strip HTML tags from user input to prevent stored XSS
function sanitize(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

// GET /api/req-board/jobs/events — Server-Sent Events stream for real-time
// override + note changes. Backed by a single shared Supabase Realtime
// subscription on the API server (see lib/realtimeBroadcast.js); each
// connected browser receives an event within ~500ms of any peer's edit
// landing in Supabase. Rapid-reconnect protection comes from the per-user
// rate limiter; long-lived connections only count as one request.
router.get('/events', requireRb, (req, res) => {
  // Keep the connection alive through reverse proxies that buffer or time
  // out idle responses (Railway, nginx, etc.).
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  // Disable Node's default 2-minute response timeout — SSE connections live
  // until the client disconnects.
  if (req.socket && typeof req.socket.setTimeout === 'function') req.socket.setTimeout(0);

  // Initial event so the client knows the connection is live; payload is
  // ignored but the round-trip confirms the stream works.
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  const client = {
    send: (payload) => res.write(`data: ${payload}\n\n`),
  };
  realtime.addClient(client);

  // Heartbeat every 25s — comments are SSE no-ops on the client side but
  // keep proxies from killing an idle connection.
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (e) { /* socket dead */ }
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    realtime.removeClient(client);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
});

// GET /api/jobs/export — Excel export (must be above /:id to avoid conflict).
// Delegates to lib/exporters so the manual download and the nightly cron
// upload share one source of truth.
router.get('/export', requireRbAdmin, async (req, res, next) => {
  try {
    const buffer = await buildReqBoardWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=APT_Req_Board_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs — All open jobs + recently closed (Archive/Placed/Lost/Wash within 12hrs)
router.get('/', requireRb, async (req, res, next) => {
  try {
    const [openResult, closedResult, overrides] = await Promise.all([
      getOpenJobs(),
      getRecentlyClosedJobs(),
      getAllOverrides(),
    ]);

    // Called Shots persist on the board regardless of status or time window.
    // Pull any flagged jobs that aren't already in the open/closed result sets.
    const calledShotIds = Object.entries(overrides)
      .filter(([, ov]) => ov.called_shot === true || ov.called_shot === 'true')
      .map(([jobId]) => parseInt(jobId, 10))
      .filter(id => !Number.isNaN(id));
    const existingIds = new Set([
      ...(openResult?.data || []).map(j => j.id),
      ...(closedResult?.data || []).map(j => j.id),
    ]);
    const missingCalledShotIds = calledShotIds.filter(id => !existingIds.has(id));
    const missingCalledShotResult = missingCalledShotIds.length
      ? await getJobsByIds(missingCalledShotIds)
      : { data: [] };

    // Scope the client-sub query to only the jobs we're about to show, so the
    // global 500-record cap can't silently drop submissions for recent jobs.
    const boardJobIds = [
      ...(openResult?.data || []).map(j => j.id),
      ...(closedResult?.data || []).map(j => j.id),
      ...(missingCalledShotResult?.data || []).map(j => j.id),
    ];
    const clientSubsResult = await getClientSubmissions(boardJobIds);

    // Build client submission count and latest date maps by jobOrder ID.
    // Also bucket strict-status counts for the India Req Board's funnel-style
    // counters (Total Client Submissions vs Total Interviews — mutually exclusive).
    const clientSubCounts = {};
    const clientSubsStrictCounts = {};
    const interviewSubCounts = {};
    const latestClientSubDate = {};
    // Mirrors the interview-flavor subset of CLIENT_SUB_STATUSES — any new
    // interview-style status added in bullhorn.js should also be added here
    // so it counts toward the "Total Interviews" funnel counter.
    const INTERVIEW_STATUSES = new Set([
      'Phone Interview',
      'Interview Scheduled',
      'Interview Feedback',
      'In Person Interview',
      'Final Interview',
      'Second Interview',
      'AI Interview Complete',
    ]);
    for (const sub of (clientSubsResult?.data || [])) {
      const jobId = sub.jobOrder?.id;
      if (jobId) {
        clientSubCounts[jobId] = (clientSubCounts[jobId] || 0) + 1;
        if (sub.status === 'Client Submission') {
          clientSubsStrictCounts[jobId] = (clientSubsStrictCounts[jobId] || 0) + 1;
        } else if (INTERVIEW_STATUSES.has(sub.status)) {
          interviewSubCounts[jobId] = (interviewSubCounts[jobId] || 0) + 1;
        }
        const subDate = sub.dateAdded || 0;
        if (!latestClientSubDate[jobId] || subDate > latestClientSubDate[jobId]) {
          latestClientSubDate[jobId] = subDate;
        }
      }
    }

    // Statuses that should fall off the board (only shown within 12hr window).
    // 'Filled' was added in v3.30.0 alongside the India Req Board feature so
    // filled reqs don't linger on the active boards forever.
    const FALLOFF_STATUSES = ['Archive', 'Placed', 'Lost', 'Wash', 'Filled'];
    const cutoffMs = Date.now() - (12 * 60 * 60 * 1000); // 12 hours ago

    // Merge open + recently closed + called-shot-only jobs, deduplicate by ID
    const seen = new Set();
    const allJobs = [];
    for (const j of [
      ...(openResult?.data || []),
      ...(closedResult?.data || []),
      ...(missingCalledShotResult?.data || []),
    ]) {
      if (!seen.has(j.id)) {
        seen.add(j.id);
        const status = Array.isArray(j.status) ? j.status[0] : j.status;
        const ov = overrides[j.id];
        const isCalledShot = ov?.called_shot === true || ov?.called_shot === 'true';

        // For fall-off statuses, use our tracked status_changed_at (precise),
        // falling back to Bullhorn dateLastModified (less reliable — any edit resets it).
        // Called Shots bypass the fall-off window entirely.
        if (FALLOFF_STATUSES.includes(status) && !isCalledShot) {
          const changedAt = ov?.status_changed_at ? new Date(ov.status_changed_at).getTime() : null;
          const falloffTime = changedAt || (j.dateLastModified || 0);
          if (falloffTime < cutoffMs) continue; // older than 12 hours — drop it
        }

        const formatted = formatJob(j);
        formatted.clientSubs = clientSubCounts[j.id] || 0;
        formatted.clientSubsStrict = clientSubsStrictCounts[j.id] || 0;
        formatted.interviewSubs = interviewSubCounts[j.id] || 0;
        formatted.latestClientSubDate = latestClientSubDate[j.id]
          ? new Date(latestClientSubDate[j.id]).toISOString()
          : null;
        // Mark fall-off status jobs so the frontend can style them.
        // Called Shots stay visible indefinitely, so don't flag them as falling off.
        if (FALLOFF_STATUSES.includes(status) && !isCalledShot) {
          formatted.fallingOff = true;
        }
        allJobs.push(mergeOverrides(formatted, overrides));
      }
    }

    // Optional India Req Board filter — same endpoint, parameterized.
    // The India tab in the UI passes ?apt_india=true; everywhere else omits
    // the param and gets the full board.
    const aptIndiaOnly = req.query.apt_india === 'true';
    const finalJobs = aptIndiaOnly
      ? allJobs.filter(j => j.aptIndia === true)
      : allJobs;

    res.json({ total: finalJobs.length, data: finalJobs });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/all — All jobs including closed (with overrides)
router.get('/all', requireRb, async (req, res, next) => {
  try {
    const result = await getAllJobs();
    const overrides = await getAllOverrides();
    const jobs = (result?.data || []).map(j => mergeOverrides(formatJob(j), overrides));
    res.json({ total: jobs.length, data: jobs });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/users — CorporateUser list for AM dropdown
router.get('/users', requireRb, async (req, res, next) => {
  try {
    const result = await getCorporateUsers();
    const allUsers = (result?.data || [])
      .filter(u => {
        const name = `${u.firstName} ${u.lastName}`.toLowerCase();
        return !name.includes('api') && !name.includes('admin') && !name.includes('herefish')
          && !name.includes('unassigned') && !name.includes('analytics') && !name.includes('bbo')
          && !name.includes('synety') && !name.includes('newbury') && !name.includes('linkedin');
      })
      .map(u => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        initials: `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase(),
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        role: (u.customText1 || '').trim(),
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName));

    // Filter by role if query param provided
    const roleFilter = req.query.role;
    const users = roleFilter
      ? allUsers.filter(u => u.role.toLowerCase().includes(roleFilter.toLowerCase()))
      : allUsers;

    res.json({ data: users });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/opportunities — All open opportunities for modal
router.get('/opportunities', requirePipeline, async (req, res, next) => {
  try {
    const result = await getOpenOpportunitiesFull();
    const opportunities = (result?.data || []).map(o => ({
      id: o.id,
      title: o.title || null,
      status: o.status || null,
      owner: o.owner ? `${o.owner.firstName || ''} ${o.owner.lastName || ''}`.trim() : null,
      client: o.clientCorporation?.name || null,
      clientCorporationId: o.clientCorporation?.id || null,
      clientContact: o.clientContact
        ? `${(o.clientContact.firstName || '')[0] || ''}. ${o.clientContact.lastName || ''}`.trim()
        : null,
      nextActivity: o.customDate1 ? new Date(o.customDate1).toISOString() : null,
      dateAdded: o.dateAdded ? new Date(o.dateAdded).toISOString() : null,
      expectedCloseDate: o.expectedCloseDate ? new Date(o.expectedCloseDate).toISOString() : null,
      dealValue: o.dealValue || null,
      weightedDealValue: o.weightedDealValue || null,
    }));

    // Merge local per-opportunity overrides (currently just `note`).
    const overrideMap = await getOpportunityOverridesMap(opportunities.map(o => o.id));
    for (const o of opportunities) {
      const ov = overrideMap.get(o.id);
      o.note = (ov && ov.note) || '';
    }

    res.json({ total: opportunities.length, data: opportunities });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/opportunities/:id/update — Update opportunity fields in Bullhorn
router.post('/opportunities/:id/update', requirePipeline, async (req, res, next) => {
  try {
    const oppId = parseInt(req.params.id, 10);
    if (isNaN(oppId) || oppId <= 0) {
      return res.status(400).json({ error: 'Invalid opportunity ID' });
    }

    const { fields } = req.body || {};

    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'fields object required' });
    }

    // Whitelist: only allow safe fields. `nextActivity` is a clean API alias
    // for the underlying Bullhorn `customDate1` field.
    const ALLOWED = new Set(['status', 'expectedCloseDate', 'nextActivity']);
    const sanitized = {};
    for (const [key, val] of Object.entries(fields)) {
      if (!ALLOWED.has(key)) continue;
      if (key === 'nextActivity') sanitized.customDate1 = val;
      else sanitized[key] = val;
    }

    if (Object.keys(sanitized).length === 0) {
      return res.status(400).json({ error: `No valid fields. Allowed: ${[...ALLOWED].join(', ')}` });
    }

    await updateOpportunityField(oppId, sanitized);
    res.json({ success: true, id: oppId, updated: sanitized });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/jobs/opportunities/:id/overrides — Update local-only opportunity
// fields (currently just `note` for the Pipeline tab). Doesn't touch Bullhorn.
router.patch('/opportunities/:id/overrides', requirePipeline, async (req, res, next) => {
  try {
    const oppId = parseInt(req.params.id, 10);
    if (isNaN(oppId) || oppId <= 0) {
      return res.status(400).json({ error: 'Invalid opportunity ID' });
    }
    const { note } = req.body || {};
    if (note === undefined) {
      return res.status(400).json({ error: 'note is required' });
    }
    const updatedBy = req.user?.email || req.user?.name || 'unknown';
    const row = await upsertOpportunityOverride(oppId, {
      note: typeof note === 'string' ? note : String(note ?? ''),
      updated_by: updatedBy,
    });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/client-contacts?corpId=N — ClientContacts for a ClientCorporation
// Used by the Convert-to-Job modal to populate the contact dropdown.
router.get('/client-contacts', requirePipeline, async (req, res, next) => {
  try {
    const corpId = parseInt(req.query.corpId, 10);
    if (isNaN(corpId) || corpId <= 0) {
      return res.status(400).json({ error: 'corpId query param required' });
    }
    const result = await getClientContactsForCorp(corpId);
    const contacts = (result?.data || []).map(c => ({
      id: c.id,
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      email: c.email || '',
      name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
    }));
    res.json({ data: contacts });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/opportunities/:id/convert — Convert an Opportunity to a JobOrder
// Creates a JobOrder with fields from the Opportunity + user-supplied comp/type fields,
// then best-effort marks the source Opportunity as Closed-Won and adds a linking Note.
router.post('/opportunities/:id/convert', requirePipeline, async (req, res, next) => {
  try {
    const oppId = parseInt(req.params.id, 10);
    if (isNaN(oppId) || oppId <= 0) {
      return res.status(400).json({ error: 'Invalid opportunity ID' });
    }

    const body = req.body || {};
    const employmentType = body.employmentType;
    const numOpenings = body.numOpenings;
    if (!employmentType || !Number.isFinite(numOpenings) || numOpenings < 1) {
      return res.status(400).json({ error: 'employmentType and numOpenings (>=1) are required' });
    }

    // 1. Fetch source Opportunity
    const oppResult = await getOpportunityById(oppId);
    const opp = oppResult?.data?.[0];
    if (!opp) {
      return res.status(404).json({ error: `Opportunity ${oppId} not found` });
    }

    // 2. Build JobOrder payload — Opportunity-sourced fields + user-supplied fields
    const jobFields = {
      title: opp.title || 'Untitled Job',
      status: 'Accepting Candidates',
      isOpen: true,
      employmentType,
      numOpenings: parseInt(numOpenings, 10),
    };
    if (opp.owner?.id) jobFields.owner = { id: opp.owner.id };
    if (opp.clientCorporation?.id) jobFields.clientCorporation = { id: opp.clientCorporation.id };
    if (opp.dealValue != null) jobFields.customFloat2 = Number(opp.dealValue);
    if (opp.expectedCloseDate) jobFields.estimatedEndDate = Number(opp.expectedCloseDate);

    // Optional numeric comp fields — only set if supplied and finite
    for (const [key, fieldName] of [
      ['payRate', 'payRate'],
      ['clientBillRate', 'clientBillRate'],
      ['salary', 'salary'],
      ['salaryHigh', 'customFloat1'],
    ]) {
      if (body[key] != null && body[key] !== '' && Number.isFinite(Number(body[key]))) {
        jobFields[fieldName] = Number(body[key]);
      }
    }

    // Optional string fields
    if (body.remote) jobFields.customText1 = String(body.remote);
    if (body.clientContactId) {
      const ccId = parseInt(body.clientContactId, 10);
      if (Number.isFinite(ccId)) jobFields.clientContact = { id: ccId };
    }

    // 3. Create the JobOrder (hard failure if this fails — no partial state yet)
    const createResult = await createJob(jobFields);
    const newJobId = createResult?.changedEntityId || createResult?.data?.changedEntityId;
    if (!newJobId) {
      return res.status(502).json({ error: 'Job created but no ID returned from Bullhorn', raw: createResult });
    }

    // 4. Best-effort close-out of the source Opportunity.
    //    JobOrder already exists; if these fail, surface a warning but still succeed.
    const warnings = [];
    try {
      await updateOpportunityField(oppId, { status: 'Closed-Won' });
    } catch (err) {
      warnings.push(`Failed to mark Opportunity Closed-Won: ${err.message}`);
    }
    try {
      await addNoteToOpportunity(oppId, `Converted to JobOrder #${newJobId}`);
    } catch (err) {
      warnings.push(`Failed to add linking note on Opportunity: ${err.message}`);
    }

    res.json({ success: true, jobOrderId: newJobId, warnings: warnings.length ? warnings : undefined });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/submissions/:id/update — Update submission fields in Bullhorn
router.post('/submissions/:id/update', requireRb, async (req, res, next) => {
  try {
    const subId = parseInt(req.params.id, 10);
    if (isNaN(subId)) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const { fields } = req.body;
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'fields object is required' });
    }

    const ALLOWED_FIELDS = new Set(['status']);
    const sanitized = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED_FIELDS.has(key)) {
        return res.status(400).json({ error: `Field "${key}" is not allowed` });
      }
      sanitized[key] = value;
    }

    const result = await updateSubmissionField(subId, sanitized);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/jobs/submissions/:id/overrides — Update local-only per-submission flags
// (currently just `rejected` for the Interviews box). Does not touch Bullhorn.
router.patch('/submissions/:id/overrides', requireRb, async (req, res, next) => {
  try {
    const subId = parseInt(req.params.id, 10);
    if (isNaN(subId) || subId <= 0) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }
    const { rejected } = req.body || {};
    if (rejected === undefined) {
      return res.status(400).json({ error: 'rejected is required' });
    }
    const updatedBy = req.user?.email || req.user?.name || 'unknown';
    const row = await upsertSubmissionOverride(subId, { rejected: !!rejected, updated_by: updatedBy });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/offer-out-candidates — Flat array of On The Board rows:
//   [{ job: <formatted+overrides>, cand: { id, name, submissionId, submissionStatus, placementId, placementStatus, source } }, ...]
// Includes candidates in two pipeline states:
//   1. JobSubmission.status = 'Offer Extended' (offer pending acceptance)
//   2. Placement.status = 'Pending' (offer accepted, awaiting final approval)
// Excludes any (candidate, job) pair that has a Placement in Approved or
// Active status — those have cleared the approval cycle. This handles the
// case where Bullhorn doesn't cascade the submission status off "Offer
// Extended" after a placement is approved, which would otherwise leave the
// candidate stuck on the counter forever.
// The job payload is self-contained — the client does NOT join against the
// req-board's `jobs` array — so the counter is independent of board filters
// and stays accurate when a job has fallen off the board's 12h window.
router.get('/offer-out-candidates', requireRb, async (req, res, next) => {
  try {
    const [subsResult, placementsResult, approvedResult, overrides] = await Promise.all([
      getOfferExtendedSubmissions(),
      getPendingPlacements(),
      getActivePlacements(),
      getAllOverrides(),
    ]);

    // (candidateId|jobId) pairs that have a placement past the Pending stage.
    // Anyone in this set falls off the board even if their submission is
    // still in "Offer Extended".
    const finalizedKeys = new Set();
    for (const pl of (approvedResult?.data || [])) {
      const jId = pl.jobOrder?.id;
      const cId = pl.candidate?.id;
      if (jId && cId) finalizedKeys.add(`${cId}|${jId}`);
    }

    // Dedupe by (candidateId|jobId). Placement wins if both exist for the
    // same pair, since it's later in the workflow.
    const rowsByKey = new Map();

    for (const sub of (subsResult?.data || [])) {
      const jobId = sub.jobOrder?.id;
      const c = sub.candidate;
      if (!jobId || !c) continue;
      const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
      if (!name) continue;
      const key = `${c.id ?? name}|${jobId}`;
      rowsByKey.set(key, {
        jobId,
        cand: {
          id: c.id ?? null,
          name,
          submissionId: sub.id,
          submissionStatus: sub.status,
          placementId: null,
          placementStatus: null,
          source: 'submission',
        },
      });
    }

    for (const pl of (placementsResult?.data || [])) {
      const jobId = pl.jobOrder?.id;
      const c = pl.candidate;
      if (!jobId || !c) continue;
      const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
      if (!name) continue;
      const key = `${c.id ?? name}|${jobId}`;
      rowsByKey.set(key, {
        jobId,
        cand: {
          id: c.id ?? null,
          name,
          submissionId: null,
          submissionStatus: null,
          placementId: pl.id,
          placementStatus: pl.status,
          source: 'placement',
        },
      });
    }

    // Drop any (candidate, job) pair that already has an Approved/Active
    // placement — that candidate has cleared the approval cycle and shouldn't
    // count anymore, regardless of submission status.
    for (const key of [...rowsByKey.keys()]) {
      if (finalizedKeys.has(key)) rowsByKey.delete(key);
    }

    // Hydrate job data for every referenced jobId. We use getJobsByIds so the
    // payload doesn't depend on which jobs are currently visible on the board.
    const jobIds = [...new Set([...rowsByKey.values()].map(r => r.jobId))];
    const jobsResult = jobIds.length ? await getJobsByIds(jobIds) : { data: [] };
    const jobsById = new Map();
    for (const j of (jobsResult?.data || [])) {
      jobsById.set(j.id, mergeOverrides(formatJob(j), overrides));
    }

    const rows = [];
    for (const { jobId, cand } of rowsByKey.values()) {
      const job = jobsById.get(jobId);
      if (!job) continue; // job was deleted or otherwise unfetchable — skip defensively
      rows.push({ job, cand });
    }

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id — Single job detail + submissions + overrides (must be after named routes)
router.get('/:id', requireRb, async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    if (isNaN(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const [jobResult, subsResult] = await Promise.all([
      getJobById(jobId),
      getSubmissions(jobId),
    ]);

    const job = jobResult?.data?.[0];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const overrides = await getOverrides(jobId);
    const formatted = formatJob(job);
    if (overrides) {
      formatted.recruiter = overrides.recruiter || '';
      formatted.followUp = overrides.follow_up || '';
      formatted.deadline = overrides.deadline || '';
      formatted.notes = overrides.notes || '';
      formatted.overrideVersion = typeof overrides.version === 'number' ? overrides.version : null;
      formatted.overrideUpdatedBy = overrides.updated_by || null;
      formatted.overrideUpdatedAt = overrides.updated_at || null;
    } else {
      formatted.overrideVersion = null;
      formatted.overrideUpdatedBy = null;
      formatted.overrideUpdatedAt = null;
    }

    const notes = await getNotesForJob(jobId);

    // Defensive safety net. Sourced from the same constant used by the
    // upstream Bullhorn WHERE clause so the two can't drift again — a stale
    // hardcoded list here is exactly why Phone Interview / In Person Interview /
    // etc. were being silently stripped after we expanded the upstream list.
    const validStatuses = new Set(CLIENT_SUB_STATUSES);
    const filteredSubs = (subsResult?.data || [])
      .filter(s => validStatuses.has(s.status))
      .map(formatSubmission);

    // Merge per-submission overrides (currently just `rejected` for the
    // Interviews box). Missing rows default to rejected=false.
    const overrideMap = await getSubmissionOverridesMap(filteredSubs.map(s => s.id));
    for (const s of filteredSubs) {
      const ov = overrideMap.get(s.id);
      s.rejected = !!(ov && ov.rejected);
    }

    res.json({
      job: formatted,
      submissions: {
        total: filteredSubs.length,
        data: filteredSubs,
      },
      notes,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:id/bullhorn-update — Push field changes to Bullhorn
router.post('/:id/bullhorn-update', requireRb, async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const { fields } = req.body;
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'fields object is required' });
    }

    // Whitelist of allowed Bullhorn fields
    const ALLOWED_FIELDS = new Set([
      'status', 'owner', 'employmentType', 'customText1',
      'startDate', 'estimatedEndDate', 'assignedUsers',
      // PrBr/Salary LH compensation fields
      'payRate', 'clientBillRate', 'salary', 'customFloat1',
      // Priority (1=A, 2=B, 3=C)
      'type',
    ]);

    // Numeric fields — coerce string input to number or null
    const NUMERIC_FIELDS = new Set(['payRate', 'clientBillRate', 'salary', 'customFloat1', 'type']);

    const sanitized = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED_FIELDS.has(key)) {
        return res.status(400).json({ error: `Field "${key}" is not allowed` });
      }
      if (NUMERIC_FIELDS.has(key)) {
        if (value === '' || value === null || value === undefined) {
          sanitized[key] = null;
        } else {
          const num = Number(value);
          if (Number.isNaN(num)) {
            return res.status(400).json({ error: `Field "${key}" must be numeric` });
          }
          sanitized[key] = num;
        }
      } else {
        sanitized[key] = value;
      }
    }

    const result = await updateJobField(jobId, sanitized);

    // Track when status changes to a fall-off status.
    //
    // Compensate pattern: the Bullhorn write just succeeded. If the companion
    // local write fails, we enqueue a reconciliation row instead of silently
    // swallowing the error — the two stores would otherwise drift.
    let warning = null;
    if (sanitized.status) {
      const FALLOFF_STATUSES = ['Archive', 'Placed', 'Lost', 'Wash'];
      const statusChangedAt = FALLOFF_STATUSES.includes(sanitized.status)
        ? new Date().toISOString()
        : null; // clear it when moving back to an active status
      try {
        await upsertOverrides(jobId, { status_changed_at: statusChangedAt });
      } catch (localErr) {
        console.error(
          `[bullhorn-update] Bullhorn succeeded but local status_changed_at ` +
          `write failed for job ${jobId}:`, localErr && localErr.message,
        );
        await enqueueReconciliation({
          jobId,
          kind: 'status_changed_at',
          attemptedPayload: { status_changed_at: statusChangedAt, bullhornStatus: sanitized.status },
          errorMessage: (localErr && localErr.message) || 'unknown error',
          createdBy: req.user?.email || req.user?.name || 'unknown',
        });
        warning = {
          code: 'LOCAL_SYNC_DEFERRED',
          message: 'Saved to Bullhorn. Local sync deferred — our team will reconcile.',
        };
      }
    }

    res.json({ success: true, data: result, warning });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/jobs/:id/overrides — Update TR, Notes, Follow Up, Deadline
router.patch('/:id/overrides', requireRb, async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const { recruiter, notes, follow_up, deadline, coverage_needed, tr_reassigned, tr_assigned_at, called_shot, forty_eight_hr, apt_india } = req.body;
    const updatedBy = req.user?.email || req.user?.name || 'unknown';

    // Optimistic locking: clients that have been updated can send If-Match
    // with the `version` value they last read. Unversioned clients (older
    // deploys, curl, etc.) fall through to the legacy last-write-wins path
    // for backward compatibility.
    let expectedVersion;
    const ifMatch = req.header('If-Match');
    if (ifMatch !== undefined && ifMatch !== '' && ifMatch !== '*') {
      const parsed = parseInt(ifMatch.replace(/["W\/]/g, ''), 10);
      if (Number.isFinite(parsed)) expectedVersion = parsed;
    }

    let result;
    try {
      result = await upsertOverrides(jobId, {
        recruiter: sanitize(recruiter),
        notes: sanitize(notes),
        follow_up: sanitize(follow_up),
        deadline: sanitize(deadline),
        coverage_needed,
        tr_reassigned,
        tr_assigned_at,
        called_shot,
        forty_eight_hr: sanitize(forty_eight_hr),
        apt_india,
        updated_by: updatedBy,
      }, { expectedVersion });
    } catch (err) {
      if (err instanceof OverrideConflictError) {
        return res.status(409).json({
          error: err.message,
          code: 'OVERRIDE_CONFLICT',
          current: err.current,
        });
      }
      throw err;
    }

    // Push notes to Bullhorn as a Note entity on the JobOrder.
    // Fire-and-forget: the local override (Supabase) is the source of truth
    // for the board, and it's already committed. Awaiting Bullhorn here would
    // gate the user's save round-trip on a 1-3s upstream call for no visible
    // benefit — the Bullhorn note is downstream sync, not display data. Errors
    // are still logged so we can investigate sync drift.
    if (notes !== undefined && notes.trim()) {
      addNoteToJob(jobId, notes.trim()).catch(err => {
        console.error(`Failed to push note to Bullhorn for job ${jobId}:`, err.message);
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:id/notes — Add a note (stored locally)
router.post('/:id/notes', requireRb, async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'Comment is required' });
    }

    const createdBy = req.user?.name || req.user?.email || 'Unknown';
    const note = await addNote(jobId, sanitize(comment.trim()), createdBy);
    res.json({ success: true, data: note });
  } catch (err) {
    next(err);
  }
});

// --- Helpers ---

function mergeOverrides(job, overridesMap) {
  const ov = overridesMap[job.id];
  if (ov) {
    // TR: if local override is "ZZ", always use it (not synced to BH)
    // Otherwise use Bullhorn assignedUsers with local as fallback
    if (ov.recruiter === 'ZZ' || ov.recruiter === '*') {
      job.recruiter = ov.recruiter;
    } else if (!job.recruiter && ov.recruiter) {
      job.recruiter = ov.recruiter;
    }
    job.trReassigned = ov.tr_reassigned === '1';
    job.trAssignedAt = ov.tr_assigned_at || null;
    job.followUp = ov.follow_up || '';
    job.deadline = ov.deadline || '';
    job.notes = ov.notes || '';
    job.coverageNeeded = ov.coverage_needed || '';
    job.calledShot = ov.called_shot === true || ov.called_shot === 'true';
    job.aptIndia = ov.apt_india === true || ov.apt_india === 'true';
    job.fortyEightHr = ov.forty_eight_hr || '';
    job.statusChangedAt = ov.status_changed_at || null;
    // Expose the override row's version (if the column exists) so the client
    // can send it back as If-Match for optimistic locking.
    job.overrideVersion = typeof ov.version === 'number' ? ov.version : null;
    job.overrideUpdatedBy = ov.updated_by || null;
    job.overrideUpdatedAt = ov.updated_at || null;
  } else {
    job.recruiter = job.recruiter || '*';
    job.trReassigned = false;
    job.trAssignedAt = null;
    job.followUp = job.followUp || '';
    job.deadline = job.deadline || '';
    job.notes = job.notes || '';
    job.coverageNeeded = job.coverageNeeded || '';
    job.calledShot = false;
    job.aptIndia = false;
    job.fortyEightHr = '';
    job.statusChangedAt = null;
    // No override row yet — client sends no If-Match so we insert at v1.
    job.overrideVersion = null;
    job.overrideUpdatedBy = null;
    job.overrideUpdatedAt = null;
  }
  return job;
}

function formatJob(job) {
  const payRate = job.payRate || null;
  const billRate = job.clientBillRate || null;
  const salary = job.salary || null;
  const salaryHigh = job.customFloat1 || null;
  const feePercent = job.feeArrangement || null;
  const empType = job.employmentType || null;

  const empTypeLower = (empType || '').toLowerCase();
  let ceSpread = null;
  if (empTypeLower === 'corp-to-corp' && billRate && payRate) {
    ceSpread = Math.round((billRate - payRate * 1.05) * 40 * 100) / 100;
    if (ceSpread <= 0) ceSpread = null;
  } else if (billRate && payRate) {
    // W2 and all other contract types
    ceSpread = Math.round((billRate - payRate * 1.25) * 40 * 100) / 100;
    if (ceSpread <= 0) ceSpread = null;
  }

  let permFee = null;
  if (salary && feePercent) {
    permFee = Math.round((salary * feePercent / 26) * 100) / 100;
  }

  let brSalary = null;
  if (billRate && payRate) {
    brSalary = `$${payRate}/$${billRate}`;
  } else if (salary && salaryHigh) {
    brSalary = `$${Number(salary).toLocaleString('en-US')}/$${Number(salaryHigh).toLocaleString('en-US')}`;
  } else if (salary) {
    brSalary = `$${Number(salary).toLocaleString('en-US')}`;
  } else if (payRate) {
    brSalary = `$${payRate}/hr`;
  }

  return {
    id: job.id,
    title: job.title,
    status: Array.isArray(job.status) ? job.status[0] : job.status,
    owner: job.owner
      ? `${job.owner.firstName || ''} ${job.owner.lastName || ''}`.trim()
      : null,
    ownerInitials: job.owner
      ? `${(job.owner.firstName || '')[0] || ''}${(job.owner.lastName || '')[0] || ''}`.toUpperCase()
      : null,
    ownerId: job.owner?.id || null,
    client: job.clientCorporation?.name || null,
    clientId: job.clientCorporation?.id || null,
    clientContact: job.clientContact
      ? `${(job.clientContact.firstName || '')[0] || ''}. ${job.clientContact.lastName || ''}`.trim()
      : null,
    employmentType: empType,
    numOpenings: job.numOpenings || 0,
    payRate,
    billRate,
    salary,
    salaryHigh,
    feePercent,
    dealValue: job.customFloat2 || null,
    brSalary,
    ceSpread,
    permFee,
    remote: job.customText1 || null,
    filled: job.customText2 || null,
    washed: job.customText3 || null,
    lost: job.customText4 || null,
    staffingOrProject: job.customText5 === '1' ? 'Staffing' : job.customText5 === '0' ? 'Project' : null,
    aprioraStatus: job.customText40 || null,
    dateAdded: job.dateAdded ? new Date(job.dateAdded).toISOString() : null,
    startDate: job.startDate ? new Date(job.startDate).toISOString() : null,
    estimatedEndDate: job.estimatedEndDate ? new Date(job.estimatedEndDate).toISOString() : null,
    city: job.address?.city || null,
    state: job.address?.state || null,
    priority: job.type === 1 ? 'A' : job.type === 2 ? 'B' : job.type === 3 ? 'C' : null,
    isPublic: typeof job.isPublic === 'number' ? job.isPublic : null,
    dateLastModified: job.dateLastModified ? new Date(job.dateLastModified).toISOString() : null,
    fallingOff: false, // set by route handler for recently-closed jobs
    // assignedUsers → TR initials (Bullhorn source of truth)
    assignedUserIds: (job.assignedUsers?.data || []).map(u => u.id),
    recruiter: (job.assignedUsers?.data || [])
      .map(u => `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase())
      .filter(Boolean)
      .join(', ') || '*',
    // Editable fields (populated from overrides)
    notes: '',
    followUp: '',
    deadline: '',
    coverageNeeded: '',
  };
}

function formatSubmission(sub) {
  return {
    id: sub.id,
    candidate: sub.candidate
      ? `${sub.candidate.firstName || ''} ${sub.candidate.lastName || ''}`.trim()
      : null,
    candidateId: sub.candidate?.id || null,
    status: sub.status,
    dateAdded: sub.dateAdded ? new Date(sub.dateAdded).toISOString() : null,
    source: sub.source || null,
    sendingUser: sub.sendingUser
      ? `${(sub.sendingUser.firstName || '')[0] || ''}${(sub.sendingUser.lastName || '')[0] || ''}`.toUpperCase()
      : null,
  };
}

module.exports = router;
