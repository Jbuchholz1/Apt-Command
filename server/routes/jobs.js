const express = require('express');
const ExcelJS = require('exceljs');
const { getOpenJobs, getRecentlyClosedJobs, getAllJobs, getJobById, getSubmissions, addNoteToJob, updateJobField, getCorporateUsers, getOpenOpportunitiesFull } = require('../lib/bullhorn');
const { getAllOverrides, getOverrides, upsertOverrides, getNotesForJob, addNote } = require('../lib/db');

const router = express.Router();

// GET /api/jobs/export — Excel export (must be above /:id to avoid conflict)
router.get('/export', async (req, res, next) => {
  try {
    const result = await getOpenJobs();
    const overrides = getAllOverrides();
    const jobs = (result?.data || []).map(j => mergeOverrides(formatJob(j), overrides));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Req Board');

    // Define columns
    sheet.columns = [
      { header: 'Pri', key: 'priority', width: 5 },
      { header: 'Req#', key: 'id', width: 7 },
      { header: 'Date', key: 'dateAdded', width: 12 },
      { header: 'AM', key: 'ownerInitials', width: 5 },
      { header: 'TR', key: 'recruiter', width: 8 },
      { header: 'Job Title', key: 'title', width: 32 },
      { header: 'Client', key: 'client', width: 22 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'BR/Salary', key: 'brSalary', width: 14 },
      { header: 'CE $', key: 'ceSpread', width: 10 },
      { header: 'Perm $', key: 'permFee', width: 10 },
      { header: 'Manager', key: 'clientContact', width: 18 },
      { header: 'Type', key: 'employmentType', width: 14 },
      { header: 'Remote', key: 'remote', width: 8 },
      { header: '# Open', key: 'numOpenings', width: 7 },
      { header: '# Filled', key: 'filled', width: 8 },
      { header: 'Follow Up', key: 'followUp', width: 20 },
      { header: 'Deadline', key: 'deadline', width: 18 },
      { header: 'Location', key: 'location', width: 16 },
      { header: 'Start', key: 'startDate', width: 12 },
      { header: 'End', key: 'estimatedEndDate', width: 12 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2744' } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 22;

    // Add data rows
    for (const job of jobs) {
      sheet.addRow({
        priority: job.priority || '',
        id: job.id,
        dateAdded: job.dateAdded ? new Date(job.dateAdded).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) : '',
        ownerInitials: job.ownerInitials || '',
        recruiter: job.recruiter || '',
        title: job.title || '',
        client: job.client || '',
        status: job.status || '',
        brSalary: job.brSalary || '',
        ceSpread: job.ceSpread || '',
        permFee: job.permFee || '',
        clientContact: job.clientContact || '',
        employmentType: job.employmentType || '',
        remote: job.remote || '',
        numOpenings: job.numOpenings || 0,
        filled: job.filled || '',
        followUp: job.followUp || '',
        deadline: job.deadline || '',
        location: [job.city, job.state].filter(Boolean).join(', '),
        startDate: job.startDate ? new Date(job.startDate).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) : '',
        estimatedEndDate: job.estimatedEndDate ? new Date(job.estimatedEndDate).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) : '',
      });
    }

    // Format currency columns
    sheet.getColumn('ceSpread').numFmt = '$#,##0';
    sheet.getColumn('permFee').numFmt = '$#,##0';

    // Auto-filter
    sheet.autoFilter = { from: 'A1', to: `U${jobs.length + 1}` };

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

// GET /api/jobs — All open jobs + recently closed (Archive/Placed/Lost within 48hrs)
router.get('/', async (req, res, next) => {
  try {
    const [openResult, closedResult] = await Promise.all([
      getOpenJobs(),
      getRecentlyClosedJobs(),
    ]);
    const overrides = getAllOverrides();

    // Merge open + recently closed, deduplicate by ID
    const seen = new Set();
    const allJobs = [];
    for (const j of [...(openResult?.data || []), ...(closedResult?.data || [])]) {
      if (!seen.has(j.id)) {
        seen.add(j.id);
        const formatted = formatJob(j);
        // Mark recently-closed jobs so the frontend can style them
        const status = Array.isArray(j.status) ? j.status[0] : j.status;
        if (['Archive', 'Placed', 'Lost'].includes(status) && !j.isOpen) {
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
    const overrides = getAllOverrides();
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
    }));
    res.json({ total: opportunities.length, data: opportunities });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id — Single job detail + submissions + overrides (must be after named routes)
router.get('/:id', async (req, res, next) => {
  try {
    const [jobResult, subsResult] = await Promise.all([
      getJobById(req.params.id),
      getSubmissions(req.params.id),
    ]);

    const job = jobResult?.data?.[0];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const overrides = getOverrides(parseInt(req.params.id, 10));
    const formatted = formatJob(job);
    if (overrides) {
      formatted.recruiter = overrides.recruiter || '';
      formatted.followUp = overrides.follow_up || '';
      formatted.deadline = overrides.deadline || '';
      formatted.notes = overrides.notes || '';
    }

    const notes = getNotesForJob(parseInt(req.params.id, 10));

    res.json({
      job: formatted,
      submissions: {
        total: subsResult?.count || 0,
        data: (subsResult?.data || []).map(formatSubmission),
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
    ]);

    const sanitized = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED_FIELDS.has(key)) {
        return res.status(400).json({ error: `Field "${key}" is not allowed` });
      }
      sanitized[key] = value;
    }

    const result = await updateJobField(jobId, sanitized);
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

    const { recruiter, notes, follow_up, deadline, coverage_needed } = req.body;
    const updatedBy = req.user?.email || req.user?.name || 'unknown';

    const result = upsertOverrides(jobId, {
      recruiter,
      notes,
      follow_up,
      deadline,
      coverage_needed,
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
    const note = addNote(jobId, comment.trim(), createdBy);
    res.json({ success: true, data: note });
  } catch (err) {
    next(err);
  }
});

// --- Helpers ---

function mergeOverrides(job, overridesMap) {
  const ov = overridesMap[job.id];
  if (ov) {
    // TR comes from Bullhorn assignedUsers; only use local override as fallback
    if (!job.recruiter && ov.recruiter) job.recruiter = ov.recruiter;
    job.followUp = ov.follow_up || '';
    job.deadline = ov.deadline || '';
    job.notes = ov.notes || '';
    job.coverageNeeded = ov.coverage_needed || '';
  } else {
    job.recruiter = job.recruiter || '';
    job.followUp = job.followUp || '';
    job.deadline = job.deadline || '';
    job.notes = job.notes || '';
    job.coverageNeeded = job.coverageNeeded || '';
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

  let ceSpread = null;
  if (billRate && payRate && billRate > payRate) {
    ceSpread = Math.round((billRate - payRate) * 40 * 100) / 100;
  }

  let permFee = null;
  if (salary && feePercent) {
    permFee = Math.round((salary * feePercent / 26) * 100) / 100;
  }

  let brSalary = null;
  if (billRate && payRate) {
    brSalary = `$${payRate}/$${billRate}`;
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
      ? `${job.clientContact.firstName || ''} ${job.clientContact.lastName || ''}`.trim()
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
      .join(', ') || '',
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
  };
}

module.exports = router;
