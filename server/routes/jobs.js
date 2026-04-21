const express = require('express');
const ExcelJS = require('exceljs');
const { getOpenJobs, getRecentlyClosedJobs, getAllJobs, getJobById, getSubmissions, addNoteToJob, updateJobField, updateOpportunityField, updateSubmissionField, getCorporateUsers, getOpenOpportunitiesFull, getClientSubmissions, getOfferExtendedSubmissions } = require('../lib/bullhorn');
const { getAllOverrides, getOverrides, upsertOverrides, getNotesForJob, addNote } = require('../lib/db');
const { sanitizeRow } = require('../lib/excelSafe');

const router = express.Router();

// Strip HTML tags from user input to prevent stored XSS
function sanitize(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

// GET /api/jobs/export — Excel export (must be above /:id to avoid conflict)
router.get('/export', async (req, res, next) => {
  try {
    const [result, clientSubsResult] = await Promise.all([getOpenJobs(), getClientSubmissions()]);
    const overrides = await getAllOverrides();

    const clientSubCounts = {};
    for (const sub of (clientSubsResult?.data || [])) {
      const jobId = sub.jobOrder?.id;
      if (jobId) clientSubCounts[jobId] = (clientSubCounts[jobId] || 0) + 1;
    }

    const jobs = (result?.data || []).map(j => {
      const formatted = mergeOverrides(formatJob(j), overrides);
      formatted.clientSubs = clientSubCounts[j.id] || 0;
      return formatted;
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Req Board');

    // Define columns — matches req board table exactly
    sheet.columns = [
      { header: 'Pri', key: 'priority', width: 5 },
      { header: 'Req#', key: 'id', width: 7 },
      { header: 'Date', key: 'dateAdded', width: 10 },
      { header: 'AM', key: 'ownerInitials', width: 5 },
      { header: 'TR', key: 'recruiter', width: 5 },
      { header: '48 hr', key: 'fortyEightHr', width: 12 },
      { header: 'Job Title', key: 'title', width: 28 },
      { header: 'Client', key: 'client', width: 18 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Deadline', key: 'deadline', width: 14 },
      { header: 'Follow Up', key: 'followUp', width: 14 },
      { header: 'PrBr/Salary LH', key: 'brSalary', width: 16 },
      { header: 'CE $', key: 'ceSpread', width: 10 },
      { header: 'Perm $', key: 'permFee', width: 10 },
      { header: 'Manager', key: 'clientContact', width: 14 },
      { header: 'Type', key: 'employmentType', width: 14 },
      { header: 'Remote', key: 'remote', width: 8 },
      { header: '# Op', key: 'numOpenings', width: 6 },
      { header: '# CS', key: 'clientSubs', width: 6 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF04144F' } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 22;

    // Add data rows
    for (const job of jobs) {
      const d = job.dateAdded ? new Date(job.dateAdded) : null;
      const dateStr = d ? `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}` : '';
      sheet.addRow(sanitizeRow({
        priority: job.priority || '',
        id: job.id,
        dateAdded: dateStr,
        ownerInitials: job.ownerInitials || '',
        recruiter: job.recruiter || '',
        fortyEightHr: job.fortyEightHr || '',
        title: job.title || '',
        client: job.client || '',
        status: job.status || '',
        notes: job.notes || '',
        deadline: job.deadline || '',
        followUp: job.followUp || '',
        brSalary: job.brSalary || '',
        ceSpread: job.ceSpread || '',
        permFee: job.permFee || '',
        clientContact: job.clientContact || '',
        employmentType: job.employmentType || '',
        remote: job.remote || '',
        numOpenings: job.numOpenings || 0,
        clientSubs: job.clientSubs || 0,
      }));
    }

    // Format currency columns
    sheet.getColumn('ceSpread').numFmt = '$#,##0';
    sheet.getColumn('permFee').numFmt = '$#,##0';

    // Auto-filter
    sheet.autoFilter = { from: 'A1', to: `T${jobs.length + 1}` };

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=APT_Req_Board_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs — All open jobs + recently closed (Archive/Placed/Lost/Wash within 12hrs)
router.get('/', async (req, res, next) => {
  try {
    const [openResult, closedResult, clientSubsResult] = await Promise.all([
      getOpenJobs(),
      getRecentlyClosedJobs(),
      getClientSubmissions(),
    ]);
    const overrides = await getAllOverrides();

    // Build client submission count and latest date maps by jobOrder ID
    const clientSubCounts = {};
    const latestClientSubDate = {};
    for (const sub of (clientSubsResult?.data || [])) {
      const jobId = sub.jobOrder?.id;
      if (jobId) {
        clientSubCounts[jobId] = (clientSubCounts[jobId] || 0) + 1;
        const subDate = sub.dateAdded || 0;
        if (!latestClientSubDate[jobId] || subDate > latestClientSubDate[jobId]) {
          latestClientSubDate[jobId] = subDate;
        }
      }
    }

    // Statuses that should fall off the board (only shown within 12hr window)
    const FALLOFF_STATUSES = ['Archive', 'Placed', 'Lost', 'Wash'];
    const cutoffMs = Date.now() - (12 * 60 * 60 * 1000); // 12 hours ago

    // Merge open + recently closed, deduplicate by ID
    const seen = new Set();
    const allJobs = [];
    for (const j of [...(openResult?.data || []), ...(closedResult?.data || [])]) {
      if (!seen.has(j.id)) {
        seen.add(j.id);
        const status = Array.isArray(j.status) ? j.status[0] : j.status;

        // For fall-off statuses, use our tracked status_changed_at (precise),
        // falling back to Bullhorn dateLastModified (less reliable — any edit resets it)
        if (FALLOFF_STATUSES.includes(status)) {
          const ov = overrides[j.id];
          const changedAt = ov?.status_changed_at ? new Date(ov.status_changed_at).getTime() : null;
          const falloffTime = changedAt || (j.dateLastModified || 0);
          if (falloffTime < cutoffMs) continue; // older than 12 hours — drop it
        }

        const formatted = formatJob(j);
        formatted.clientSubs = clientSubCounts[j.id] || 0;
        formatted.latestClientSubDate = latestClientSubDate[j.id]
          ? new Date(latestClientSubDate[j.id]).toISOString()
          : null;
        // Mark fall-off status jobs so the frontend can style them
        if (FALLOFF_STATUSES.includes(status)) {
          formatted.fallingOff = true;
        }
        allJobs.push(mergeOverrides(formatted, overrides));
      }
    }

    res.json({ total: allJobs.length, data: allJobs });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/all — All jobs including closed (with overrides)
router.get('/all', async (req, res, next) => {
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
router.get('/users', async (req, res, next) => {
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
router.get('/opportunities', async (req, res, next) => {
  try {
    const result = await getOpenOpportunitiesFull();
    const opportunities = (result?.data || []).map(o => ({
      id: o.id,
      title: o.title || null,
      status: o.status || null,
      owner: o.owner ? `${o.owner.firstName || ''} ${o.owner.lastName || ''}`.trim() : null,
      client: o.clientCorporation?.name || null,
      dateAdded: o.dateAdded ? new Date(o.dateAdded).toISOString() : null,
      expectedCloseDate: o.expectedCloseDate ? new Date(o.expectedCloseDate).toISOString() : null,
      dealValue: o.dealValue || null,
      weightedDealValue: o.weightedDealValue || null,
    }));
    res.json({ total: opportunities.length, data: opportunities });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/opportunities/:id/update — Update opportunity fields in Bullhorn
router.post('/opportunities/:id/update', async (req, res, next) => {
  try {
    const oppId = parseInt(req.params.id, 10);
    if (isNaN(oppId) || oppId <= 0) {
      return res.status(400).json({ error: 'Invalid opportunity ID' });
    }

    const { fields } = req.body || {};

    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'fields object required' });
    }

    // Whitelist: only allow safe fields
    const ALLOWED = new Set(['expectedCloseDate']);
    const sanitized = {};
    for (const [key, val] of Object.entries(fields)) {
      if (ALLOWED.has(key)) sanitized[key] = val;
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

// POST /api/jobs/submissions/:id/update — Update submission fields in Bullhorn
router.post('/submissions/:id/update', async (req, res, next) => {
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

// GET /api/jobs/offer-out-candidates — Map of jobOrderId → candidate name(s) for subs in Offer Extended
router.get('/offer-out-candidates', async (req, res, next) => {
  try {
    const result = await getOfferExtendedSubmissions();
    const map = {};
    for (const sub of (result?.data || [])) {
      const jobId = sub.jobOrder?.id;
      const c = sub.candidate;
      if (!jobId || !c) continue;
      const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
      if (!name) continue;
      if (map[jobId]) {
        // avoid duplicate names
        if (!map[jobId].split(', ').includes(name)) map[jobId] += ', ' + name;
      } else {
        map[jobId] = name;
      }
    }
    res.json({ data: map });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id — Single job detail + submissions + overrides (must be after named routes)
router.get('/:id', async (req, res, next) => {
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
    }

    const notes = await getNotesForJob(jobId);

    // Status filtering already happens in getSubmissions() at the Bullhorn query level —
    // this is a defensive safety net matching the same list so behavior stays consistent.
    const validStatuses = new Set([
      'Client Submission', 'Interview Scheduled',
      'Interview Feedback', 'Client Feedback', 'Offer Extended', 'Backout', 'Placed',
    ]);
    const filteredSubs = (subsResult?.data || [])
      .filter(s => validStatuses.has(s.status))
      .map(formatSubmission);

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
router.post('/:id/bullhorn-update', async (req, res, next) => {
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
    ]);

    // Numeric fields — coerce string input to number or null
    const NUMERIC_FIELDS = new Set(['payRate', 'clientBillRate', 'salary', 'customFloat1']);

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

    // Track when status changes to a fall-off status
    if (sanitized.status) {
      const FALLOFF_STATUSES = ['Archive', 'Placed', 'Lost', 'Wash'];
      const statusChangedAt = FALLOFF_STATUSES.includes(sanitized.status)
        ? new Date().toISOString()
        : null; // clear it when moving back to an active status
      await upsertOverrides(jobId, { status_changed_at: statusChangedAt });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/jobs/:id/overrides — Update TR, Notes, Follow Up, Deadline
router.patch('/:id/overrides', async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const { recruiter, notes, follow_up, deadline, coverage_needed, tr_reassigned, tr_assigned_at, called_shot, forty_eight_hr } = req.body;
    const updatedBy = req.user?.email || req.user?.name || 'unknown';

    const result = await upsertOverrides(jobId, {
      recruiter: sanitize(recruiter),
      notes: sanitize(notes),
      follow_up: sanitize(follow_up),
      deadline: sanitize(deadline),
      coverage_needed,
      tr_reassigned,
      tr_assigned_at,
      called_shot,
      forty_eight_hr: sanitize(forty_eight_hr),
      updated_by: updatedBy,
    });

    // Push notes to Bullhorn as a Note entity on the JobOrder
    if (notes !== undefined && notes.trim()) {
      try {
        await addNoteToJob(jobId, notes.trim());
      } catch (err) {
        console.error(`Failed to push note to Bullhorn for job ${jobId}:`, err.message);
        // Don't fail the request — local save succeeded
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:id/notes — Add a note (stored locally)
router.post('/:id/notes', async (req, res, next) => {
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
    job.fortyEightHr = ov.forty_eight_hr || '';
    job.statusChangedAt = ov.status_changed_at || null;
  } else {
    job.recruiter = job.recruiter || '*';
    job.trReassigned = false;
    job.trAssignedAt = null;
    job.followUp = job.followUp || '';
    job.deadline = job.deadline || '';
    job.notes = job.notes || '';
    job.coverageNeeded = job.coverageNeeded || '';
    job.calledShot = false;
    job.fortyEightHr = '';
    job.statusChangedAt = null;
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
