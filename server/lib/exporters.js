// Workbook builders for the three nightly exports (Req Board, Org Flow, Pipeline).
//
// Each function fetches its own data and returns an xlsx Buffer, so they can
// be called from both HTTP routes (manual download) and the unattended cron
// orchestrator (lib/scheduledExport.js) without depending on req.user.

const ExcelJS = require('exceljs');
const {
  getOpenJobs,
  getClientSubmissions,
  getOpenOpportunitiesFull,
} = require('./bullhorn');
const db = require('./db');
const { sanitizeRow } = require('./excelSafe');

const HEADER_FILL_ARGB = 'FF04144F';

function styleHeaderRow(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_ARGB } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 22;
}

function autofilterAndFreeze(sheet, lastColLetter, rowCount) {
  sheet.autoFilter = { from: 'A1', to: `${lastColLetter}${rowCount + 1}` };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

// Inlined here so the shape stays in lockstep with the route's existing
// override merge / formatter logic. routes/jobs.js still owns the field
// formatter for /api/req-board/jobs (the live API); the export reuses
// the same field set but doesn't depend on the route handler.
function mergeOverrides(job, overridesMap) {
  const ov = overridesMap[job.id];
  if (ov) {
    if (ov.recruiter === 'ZZ' || ov.recruiter === '*') {
      job.recruiter = ov.recruiter;
    } else if (!job.recruiter && ov.recruiter) {
      job.recruiter = ov.recruiter;
    }
    job.followUp = ov.follow_up || '';
    job.deadline = ov.deadline || '';
    job.notes = ov.notes || '';
    job.fortyEightHr = ov.forty_eight_hr || '';
    job.calledShot = ov.called_shot === true || ov.called_shot === 'true';
  } else {
    job.recruiter = job.recruiter || '*';
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
    title: job.title || '',
    status: Array.isArray(job.status) ? job.status[0] : (job.status || ''),
    ownerInitials: job.owner
      ? `${(job.owner.firstName || '')[0] || ''}${(job.owner.lastName || '')[0] || ''}`.toUpperCase()
      : '',
    client: job.clientCorporation?.name || '',
    clientContact: job.clientContact
      ? `${(job.clientContact.firstName || '')[0] || ''}. ${job.clientContact.lastName || ''}`.trim()
      : '',
    employmentType: empType || '',
    numOpenings: job.numOpenings || 0,
    brSalary: brSalary || '',
    ceSpread: ceSpread || '',
    permFee: permFee || '',
    remote: job.customText1 || '',
    dateAdded: job.dateAdded || null,
    priority: job.type === 1 ? 'A' : job.type === 2 ? 'B' : job.type === 3 ? 'C' : '',
    recruiter: (job.assignedUsers?.data || [])
      .map(u => `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase())
      .filter(Boolean)
      .join(', ') || '*',
    notes: '',
    followUp: '',
    deadline: '',
    fortyEightHr: '',
  };
}

function formatDateMMDDYY(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}

function formatDateISO(ms) {
  if (!ms) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

// ============================================================================
// Req Board — extends the existing /api/req-board/jobs/export shape
// ============================================================================

async function buildReqBoardWorkbook() {
  const result = await getOpenJobs();
  const overrides = await db.getAllOverrides();
  const boardJobIds = (result?.data || []).map(j => j.id);
  const clientSubsResult = await getClientSubmissions(boardJobIds);

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

  styleHeaderRow(sheet);

  for (const job of jobs) {
    sheet.addRow(sanitizeRow({
      priority: job.priority || '',
      id: job.id,
      dateAdded: formatDateMMDDYY(job.dateAdded),
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

  sheet.getColumn('ceSpread').numFmt = '$#,##0';
  sheet.getColumn('permFee').numFmt = '$#,##0';

  autofilterAndFreeze(sheet, 'T', jobs.length);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ============================================================================
// Org Flow — Clients sheet + Employees sheet
// ============================================================================

async function buildOrgFlowWorkbook() {
  const clients = await db.getAllClients();
  const clientIds = clients.map(c => c.id);
  const employees = clientIds.length ? await fetchAllEmployees(clientIds) : [];

  const clientNameById = new Map(clients.map(c => [c.id, c.name]));

  const workbook = new ExcelJS.Workbook();

  const clientsSheet = workbook.addWorksheet('Clients');
  clientsSheet.columns = [
    { header: 'Client ID', key: 'id', width: 36 },
    { header: 'Name', key: 'name', width: 32 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Account Manager', key: 'account_manager', width: 24 },
    { header: 'Bullhorn Client ID', key: 'bullhorn_client_id', width: 18 },
    { header: 'Created By (User ID)', key: 'created_by', width: 36 },
    { header: 'Logo URL', key: 'logo_url', width: 40 },
  ];
  styleHeaderRow(clientsSheet);
  for (const c of clients) {
    clientsSheet.addRow(sanitizeRow({
      id: c.id || '',
      name: c.name || '',
      status: c.status || '',
      account_manager: c.account_manager || '',
      bullhorn_client_id: c.bullhorn_client_id || '',
      created_by: c.created_by || '',
      logo_url: c.logo_url || '',
    }));
  }
  autofilterAndFreeze(clientsSheet, 'G', clients.length);

  const empSheet = workbook.addWorksheet('Employees');
  empSheet.columns = [
    { header: 'Employee ID', key: 'id', width: 36 },
    { header: 'Client', key: 'client', width: 28 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Role', key: 'role', width: 22 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: '# FTEs', key: 'num_ftes', width: 8 },
    { header: '# Contractors', key: 'num_contractors', width: 12 },
    { header: 'Reports To (Employee ID)', key: 'reports_to_id', width: 36 },
    { header: 'Bullhorn Contact ID', key: 'bullhorn_contact_id', width: 18 },
  ];
  styleHeaderRow(empSheet);
  for (const e of employees) {
    empSheet.addRow(sanitizeRow({
      id: e.id || '',
      client: clientNameById.get(e.client_id) || '',
      name: e.name || '',
      role: e.role || '',
      department: e.department || '',
      email: e.email || '',
      phone: e.phone || '',
      num_ftes: e.num_ftes ?? '',
      num_contractors: e.num_contractors ?? '',
      reports_to_id: e.reports_to_id || '',
      bullhorn_contact_id: e.bullhorn_contact_id || '',
    }));
  }
  autofilterAndFreeze(empSheet, 'K', employees.length);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// db.getEmployeesForClientIds returns a sparse projection (id, client_id,
// email, bullhorn_contact_id) tuned for the sync job. We need the full row
// for the export, so query employees in chunks via getEmployeesByClient.
async function fetchAllEmployees(clientIds) {
  const out = [];
  for (const id of clientIds) {
    const rows = await db.getEmployeesByClient(id);
    for (const r of rows) out.push(r);
  }
  return out;
}

// ============================================================================
// Pipeline — open opportunities
// ============================================================================

async function buildPipelineWorkbook() {
  const result = await getOpenOpportunitiesFull();
  const opportunities = (result?.data || []).map(o => ({
    id: o.id,
    title: o.title || '',
    status: o.status || '',
    owner: o.owner ? `${o.owner.firstName || ''} ${o.owner.lastName || ''}`.trim() : '',
    client: o.clientCorporation?.name || '',
    dateAdded: formatDateISO(o.dateAdded),
    expectedCloseDate: formatDateISO(o.expectedCloseDate),
    dealValue: o.dealValue || 0,
    weightedDealValue: o.weightedDealValue || 0,
  }));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Pipeline');

  sheet.columns = [
    { header: 'Req#', key: 'id', width: 9 },
    { header: 'Title', key: 'title', width: 32 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Owner', key: 'owner', width: 18 },
    { header: 'Client', key: 'client', width: 24 },
    { header: 'Date Added', key: 'dateAdded', width: 12 },
    { header: 'Expected Close', key: 'expectedCloseDate', width: 14 },
    { header: 'Deal Value', key: 'dealValue', width: 14 },
    { header: 'Weighted Deal Value', key: 'weightedDealValue', width: 18 },
  ];
  styleHeaderRow(sheet);

  for (const o of opportunities) {
    sheet.addRow(sanitizeRow(o));
  }

  sheet.getColumn('dealValue').numFmt = '$#,##0';
  sheet.getColumn('weightedDealValue').numFmt = '$#,##0';

  autofilterAndFreeze(sheet, 'I', opportunities.length);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = {
  buildReqBoardWorkbook,
  buildOrgFlowWorkbook,
  buildPipelineWorkbook,
};
