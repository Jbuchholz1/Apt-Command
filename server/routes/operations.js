const express = require('express');
const ExcelJS = require('exceljs');
const { getPendingApprovedPlacements, updatePlacementField } = require('../lib/bullhorn');
const {
  getAllPlacementChecklist, upsertPlacementChecklist,
  getAllCOIRecords, createCOIRecord, updateCOIRecord, deleteCOIRecord,
  listVendorContracts, createVendorContract, updateVendorContract, deleteVendorContract,
  bulkCreateVendorContracts,
} = require('../lib/db');
const { requireModule } = require('../middleware/adminAuth');
const { sanitizeRow } = require('../lib/excelSafe');

const router = express.Router();

// All Operations routes require basic operations access for reads;
// mutating handlers add a second requireModule('operations', 'admin') gate.
router.use(requireModule('operations'));
const requireOpsAdmin = requireModule('operations', 'admin');

// Helper: format Bullhorn timestamp to MM/DD/YY
function fmtDate(val) {
  if (!val) return '';
  try {
    const d = new Date(val);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
  } catch { return ''; }
}

// GET /api/operations/placements — Pending & Approved placements with checklist state
router.get('/placements', async (req, res, next) => {
  try {
    const [bhResult, checklistMap] = await Promise.all([
      getPendingApprovedPlacements(),
      getAllPlacementChecklist(),
    ]);

    const placements = (bhResult?.data || []).map(p => {
      const checklist = checklistMap[p.id] || {};
      return {
        id: p.id,
        candidate: p.candidate
          ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim()
          : null,
        candidateId: p.candidate?.id || null,
        jobTitle: p.jobOrder?.title || null,
        jobOrderId: p.jobOrder?.id || null,
        client: p.jobOrder?.clientCorporation?.name || null,
        employmentType: p.employmentType || null,
        dateBegin: p.dateBegin ? new Date(p.dateBegin).toISOString() : null,
        status: p.status,
        am: p.jobOrder?.owner
          ? `${(p.jobOrder.owner.firstName || '')[0] || ''}${(p.jobOrder.owner.lastName || '')[0] || ''}`.toUpperCase()
          : '—',
        tr: (p.jobOrder?.assignedUsers?.data || [])
          .map(u => `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase())
          .filter(Boolean)
          .join(', ') || '*',
        // Checklist fields (default false / null)
        background_drug_status: checklist.background_drug_status || 'N/A',
        ob_paperwork_complete: checklist.ob_paperwork_complete || false,
        new_hire_filed: checklist.new_hire_filed || false,
        ex_ab_sow_complete: checklist.ex_ab_sow_complete || false,
        healthcare_effective_date: checklist.healthcare_effective_date || null,
        healthcare_payroll_deduction_date: checklist.healthcare_payroll_deduction_date || null,
        enrolled_in_healthcare: checklist.enrolled_in_healthcare || false,
        added_to_payroll: checklist.added_to_payroll || false,
        four01k_opt_in: checklist.four01k_opt_in || false,
        four01k_forms_received: checklist.four01k_forms_received || false,
        added_to_census: checklist.added_to_census || false,
      };
    });

    res.json({ total: placements.length, data: placements });
  } catch (err) {
    next(err);
  }
});

// POST /api/operations/placements/:id/bullhorn-update — Update Bullhorn fields on a placement
const ALLOWED_BH_FIELDS = new Set(['dateBegin']);
router.post('/placements/:id/bullhorn-update', requireOpsAdmin, async (req, res, next) => {
  try {
    const placementId = parseInt(req.params.id, 10);
    if (isNaN(placementId)) {
      return res.status(400).json({ error: 'Invalid placement ID' });
    }

    const updates = {};
    for (const [key, val] of Object.entries(req.body)) {
      if (ALLOWED_BH_FIELDS.has(key)) {
        updates[key] = val;
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await updatePlacementField(placementId, updates);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/operations/placements/:id — Update checklist for a placement
router.patch('/placements/:id', requireOpsAdmin, async (req, res, next) => {
  try {
    const placementId = parseInt(req.params.id, 10);
    if (isNaN(placementId)) {
      return res.status(400).json({ error: 'Invalid placement ID' });
    }

    const result = await upsertPlacementChecklist(placementId, {
      ...req.body,
      updated_by: req.user?.name || req.user?.email || '',
    });

    if (!result) {
      return res.status(500).json({ error: 'Failed to save checklist' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/operations/placements/export — Excel export of placements tracker
router.get('/placements/export', async (req, res, next) => {
  try {
    const [bhResult, checklistMap] = await Promise.all([
      getPendingApprovedPlacements(),
      getAllPlacementChecklist(),
    ]);

    const placements = (bhResult?.data || []).map(p => {
      const cl = checklistMap[p.id] || {};
      return {
        employmentType: p.employmentType || '',
        am: p.jobOrder?.owner
          ? `${(p.jobOrder.owner.firstName || '')[0] || ''}${(p.jobOrder.owner.lastName || '')[0] || ''}`.toUpperCase()
          : '',
        tr: (p.jobOrder?.assignedUsers?.data || [])
          .map(u => `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase())
          .filter(Boolean).join(', ') || '*',
        candidate: p.candidate ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim() : '',
        startDate: fmtDate(p.dateBegin),
        client: p.jobOrder?.clientCorporation?.name || '',
        bgDrugStatus: cl.background_drug_status || 'N/A',
        obPaperwork: cl.ob_paperwork_complete ? 'Yes' : '',
        newHireFiled: cl.new_hire_filed ? 'Yes' : '',
        exAbSow: cl.ex_ab_sow_complete ? 'Yes' : '',
        hcEffective: fmtDate(cl.healthcare_effective_date),
        hcPayrollDed: fmtDate(cl.healthcare_payroll_deduction_date),
        enrolledHc: cl.enrolled_in_healthcare ? 'Yes' : '',
        addedPayroll: cl.added_to_payroll ? 'Yes' : '',
        four01kOptIn: cl.four01k_opt_in ? 'Yes' : '',
        four01kForms: cl.four01k_forms_received ? 'Yes' : '',
        addedCensus: cl.added_to_census ? 'Yes' : '',
      };
    });

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Placements');

    sheet.columns = [
      { header: 'Type', key: 'employmentType', width: 14 },
      { header: 'AM', key: 'am', width: 5 },
      { header: 'TR', key: 'tr', width: 5 },
      { header: 'Placement Name', key: 'candidate', width: 22 },
      { header: 'Start Date', key: 'startDate', width: 12 },
      { header: 'Client', key: 'client', width: 22 },
      { header: 'Background & Drug Status', key: 'bgDrugStatus', width: 22 },
      { header: 'OB Paperwork', key: 'obPaperwork', width: 13 },
      { header: 'New Hire Filed', key: 'newHireFiled', width: 14 },
      { header: 'Ex A/B, SOW', key: 'exAbSow', width: 13 },
      { header: 'HC Effective Date', key: 'hcEffective', width: 16 },
      { header: 'HC Payroll Ded.', key: 'hcPayrollDed', width: 16 },
      { header: 'Enrolled HC', key: 'enrolledHc', width: 12 },
      { header: 'Added Payroll', key: 'addedPayroll', width: 13 },
      { header: '401k Opt In', key: 'four01kOptIn', width: 12 },
      { header: '401k Forms', key: 'four01kForms', width: 12 },
      { header: 'Added Census', key: 'addedCensus', width: 13 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF04144F' } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 22;

    for (const p of placements) {
      sheet.addRow(sanitizeRow(p));
    }

    // Auto-filter & freeze header
    sheet.autoFilter = { from: 'A1', to: `Q${placements.length + 1}` };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=APT_Placements_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

// =============================================
// COI Tracking — fillable list
// =============================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/coi', async (req, res, next) => {
  try {
    const records = await getAllCOIRecords();
    res.json({ data: records });
  } catch (err) {
    next(err);
  }
});

router.post('/coi', requireOpsAdmin, async (req, res, next) => {
  try {
    const { client_name, coi_link, expiration_date } = req.body || {};
    const created = await createCOIRecord({
      client_name,
      coi_link,
      expiration_date,
      created_by: req.user?.name || req.user?.email || '',
    });
    res.json({ data: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/coi/:id', requireOpsAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Invalid COI record ID' });
    }
    const updated = await updateCOIRecord(
      id,
      req.body || {},
      req.user?.name || req.user?.email || '',
    );
    if (!updated) {
      return res.status(404).json({ error: 'COI record not found' });
    }
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/coi/:id', requireOpsAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Invalid COI record ID' });
    }
    await deleteCOIRecord(id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// =============================================
// Contract Tracking
// =============================================

// GET /api/operations/contracts — list all vendor contracts
router.get('/contracts', async (req, res, next) => {
  try {
    const data = await listVendorContracts();
    res.json({ data, total: data.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/operations/contracts — create a new contract
router.post('/contracts', requireOpsAdmin, async (req, res, next) => {
  try {
    if (!req.body?.vendor_name) {
      return res.status(400).json({ error: 'vendor_name is required' });
    }
    const createdBy = req.user?.name || req.user?.email || '';
    const row = await createVendorContract(req.body, createdBy);
    if (!row) return res.status(500).json({ error: 'Failed to create contract' });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/operations/contracts/:id — update a contract
router.patch('/contracts/:id', requireOpsAdmin, async (req, res, next) => {
  try {
    const updatedBy = req.user?.name || req.user?.email || '';
    const row = await updateVendorContract(req.params.id, req.body, updatedBy);
    if (!row) return res.status(404).json({ error: 'Contract not found' });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/operations/contracts/:id — delete a contract
router.delete('/contracts/:id', requireOpsAdmin, async (req, res, next) => {
  try {
    const ok = await deleteVendorContract(req.params.id);
    if (!ok) return res.status(500).json({ error: 'Failed to delete contract' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/operations/contracts/import — bulk import from parsed Excel rows
//
// Body: { rows: [{ "Vendor Name": "...", "Start Date": "...", ... }] }
// Headers match the export format. Per-row validation; invalid rows are
// skipped and reported. All valid rows insert as new (no upsert by vendor).
router.post('/contracts/import', requireOpsAdmin, async (req, res, next) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'rows array required' });
    }

    const toInsert = [];
    const skippedRows = [];

    rows.forEach((raw, idx) => {
      const rowNum = idx + 2; // +2 = +1 for header row, +1 for 1-indexing
      const vendor = pickFirst(raw, ['Vendor Name', 'vendor_name', 'Vendor']);
      if (!vendor || !String(vendor).trim()) {
        skippedRows.push(`Row ${rowNum}: Missing Vendor Name`);
        return;
      }

      const startDate = parseImportDate(pickFirst(raw, ['Start Date', 'Contract Start', 'contract_start_date']));
      const endDate = parseImportDate(pickFirst(raw, ['End Date', 'Contract End', 'contract_end_date']));
      const monthly = parseImportNumber(pickFirst(raw, ['Monthly Cost', 'monthly_cost']));
      const yearly = parseImportNumber(pickFirst(raw, ['Yearly Cost', 'yearly_cost']));
      const noticeDays = parseImportNumber(pickFirst(raw, ['Notice Period (days)', 'Notice Period', 'notice_period_days']));
      const autoRenewing = parseImportBool(pickFirst(raw, ['Auto-Renewing', 'Auto Renewing', 'auto_renewing']));
      const cancelled = parseImportBool(pickFirst(raw, ['Cancelled', 'cancelled']));
      const link = pickFirst(raw, ['Contract Link', 'contract_link']);

      toInsert.push({
        vendor_name: String(vendor).trim(),
        contract_start_date: startDate,
        contract_end_date: endDate,
        monthly_cost: monthly,
        yearly_cost: yearly,
        notice_period_days: noticeDays != null ? Math.trunc(noticeDays) : null,
        auto_renewing: autoRenewing,
        cancelled,
        contract_link: link ? String(link).trim() : null,
      });
    });

    if (toInsert.length === 0) {
      return res.status(400).json({ error: 'No valid rows to import', skippedRows });
    }

    const createdBy = req.user?.name || req.user?.email || '';
    const result = await bulkCreateVendorContracts(toInsert, createdBy);

    res.json({
      inserted: result.inserted,
      skippedRows,
    });
  } catch (err) {
    next(err);
  }
});

// --- Import helpers ---
function pickFirst(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return undefined;
}

function parseImportDate(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (!s) return null;
  // ISO timestamp (ExcelJS returns dates as ISO strings) — extract YYYY-MM-DD
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // M/D/YYYY or MM/DD/YYYY
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  // M/D/YY or MM/DD/YY  → assume 20YY for 00-99
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s);
  if (m) {
    const yy = parseInt(m[3], 10);
    const yyyy = yy + (yy < 50 ? 2000 : 1900);
    return `${yyyy}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  // Fallback: let Date parse, extract YYYY-MM-DD
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseImportNumber(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const s = String(val).trim().replace(/[$,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseImportBool(val) {
  if (val == null || val === '') return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const s = String(val).trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'x';
}

// GET /api/operations/contracts/export — Excel export of contracts
router.get('/contracts/export', async (req, res, next) => {
  try {
    const contracts = await listVendorContracts();

    const rows = contracts.map(c => ({
      vendor_name: c.vendor_name || '',
      contract_start_date: fmtDate(c.contract_start_date),
      contract_end_date: fmtDate(c.contract_end_date),
      monthly_cost: c.monthly_cost != null ? Number(c.monthly_cost) : null,
      yearly_cost: c.yearly_cost != null ? Number(c.yearly_cost) : null,
      notice_period_days: c.notice_period_days != null ? Number(c.notice_period_days) : null,
      auto_renewing: c.auto_renewing ? 'Yes' : 'No',
      cancelled: c.cancelled ? 'Yes' : 'No',
      contract_link: c.contract_link || '',
    }));

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Contracts');

    sheet.columns = [
      { header: 'Vendor Name', key: 'vendor_name', width: 26 },
      { header: 'Start Date', key: 'contract_start_date', width: 12 },
      { header: 'End Date', key: 'contract_end_date', width: 12 },
      { header: 'Monthly Cost', key: 'monthly_cost', width: 14, style: { numFmt: '"$"#,##0.00' } },
      { header: 'Yearly Cost', key: 'yearly_cost', width: 14, style: { numFmt: '"$"#,##0.00' } },
      { header: 'Notice Period (days)', key: 'notice_period_days', width: 18 },
      { header: 'Auto-Renewing', key: 'auto_renewing', width: 14 },
      { header: 'Cancelled', key: 'cancelled', width: 11 },
      { header: 'Contract Link', key: 'contract_link', width: 40 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF04144F' } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 22;

    for (const r of rows) {
      sheet.addRow(sanitizeRow(r));
    }

    sheet.autoFilter = { from: 'A1', to: `I${rows.length + 1}` };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=APT_Contracts_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
