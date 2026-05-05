const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getActivePlacementsWithClient, updateClientCorporationField } = require('../lib/bullhorn');
const db = require('../lib/db');
const { syncBullhornClients } = require('../lib/orgflowSync');
const { imageFileFilter, verifyImageBuffer } = require('../lib/imageUpload');

// Multer: in-memory storage for logo uploads (max 5MB, images only).
// imageFileFilter rejects SVG and non-image mimetypes up front; verifyImageBuffer
// (applied at the route) does the magic-byte check that the mimetype header can't.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

// Org Flow is mutation-heavy (client imports, employee edits, position saves)
// and the UI expects changes to appear immediately. Override the global
// Cache-Control: max-age=300 from index.js so the browser always revalidates.
router.use((req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'no-store');
  next();
});

// =============================================
// Users
// =============================================

// GET /api/org-flow/users — all active users
router.get('/users', async (req, res, next) => {
  try {
    const users = await db.getActiveUsers();
    res.json(users);
  } catch (err) { next(err); }
});

// GET /api/org-flow/users/me — current user's Supabase profile ID
router.get('/users/me', async (req, res, next) => {
  try {
    const user = await db.getUserByEmail(req.user?.email || '');
    res.json(user);
  } catch (err) { next(err); }
});

// =============================================
// Clients
// =============================================

// GET /api/org-flow/clients — list clients (optional ?view=my for user's clients)
router.get('/clients', async (req, res, next) => {
  try {
    let userId = null;
    if (req.query.view === 'my' && req.query.userId) {
      userId = req.query.userId;
    }
    const clients = await db.getClients(userId);
    res.json(clients);
  } catch (err) { next(err); }
});

// GET /api/org-flow/clients/:id — single client
router.get('/clients/:id', async (req, res, next) => {
  try {
    const client = await db.getClientById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) { next(err); }
});

// POST /api/org-flow/clients — create client
router.post('/clients', async (req, res, next) => {
  try {
    const { name, created_by } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const client = await db.createClient(name.trim(), created_by || null);
    res.json(client);
  } catch (err) { next(err); }
});

// PATCH /api/org-flow/clients/:id — update client fields
router.patch('/clients/:id', async (req, res, next) => {
  try {
    const client = await db.updateClient(req.params.id, req.body);

    // Bullhorn write-back: when status changes on a client linked to a
    // ClientCorporation, push the new status to Bullhorn. Best-effort —
    // a Bullhorn-side failure (READ_ONLY_MODE, invalid value, perms) is
    // logged and surfaced in the response so the UI can warn, but the
    // local save is not rolled back.
    let bullhornSync = null;
    if (req.body.status && client?.bullhorn_client_id) {
      try {
        await updateClientCorporationField(client.bullhorn_client_id, { status: req.body.status });
        bullhornSync = { ok: true };
      } catch (bhErr) {
        console.warn('[orgflow] Bullhorn ClientCorporation status write-back failed:', bhErr.message);
        bullhornSync = { ok: false, error: bhErr.message, code: bhErr.code || null };
      }
    }

    res.json({ ...client, bullhornSync });
  } catch (err) {
    if (err.message && /column .*status.*schema cache/i.test(err.message)) {
      return res.status(500).json({
        error: 'The clients.status column is missing in Supabase. Run server/migrations/008_orgflow_clients_status.sql in your Supabase SQL editor, then retry.',
        code: 'STATUS_COLUMN_MISSING',
      });
    }
    next(err);
  }
});

// DELETE /api/org-flow/clients/:id — delete client
router.delete('/clients/:id', async (req, res, next) => {
  try {
    await db.deleteClient(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/org-flow/clients/import — bulk import clients from parsed Excel data
router.post('/clients/import', async (req, res, next) => {
  try {
    const { rows, currentUserId } = req.body;
    if (!rows || !Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' });

    // Resolve emails to user IDs
    const allUsers = await db.getActiveUsers();
    const emailToIdMap = new Map(allUsers.map(u => [u.email.toLowerCase(), u.id]));

    // Get existing clients for insert-vs-update logic
    const existingClients = await db.getClients();
    const existingClientMap = new Map(
      existingClients.map(c => [c.name.toLowerCase().trim(), c.id])
    );

    const clientsToInsert = [];
    const clientsToUpdate = [];
    const skippedRows = [];
    const warnings = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;

      if (!row.ClientName?.trim()) {
        skippedRows.push(`Row ${rowNumber}: Missing ClientName`);
        return;
      }

      const clientName = row.ClientName.trim();
      const accountManager = row.AccountManager?.trim() || '';
      const managerEmailField = row.AccountManagerEmail || row.reportToEmail || row.ReportToEmail || '';
      let managerId;

      if (managerEmailField?.trim()) {
        const email = managerEmailField.trim().toLowerCase();
        const userId = emailToIdMap.get(email);
        if (!userId) {
          warnings.push(`Row ${rowNumber}: Email "${managerEmailField}" not found, using current user`);
          managerId = currentUserId;
        } else {
          managerId = userId;
        }
      } else {
        managerId = currentUserId;
      }

      const existingClientId = existingClientMap.get(clientName.toLowerCase());
      if (existingClientId) {
        clientsToUpdate.push({ id: existingClientId, name: clientName, created_by: managerId, account_manager: accountManager });
      } else {
        clientsToInsert.push({ name: clientName, created_by: managerId, account_manager: accountManager });
      }
    });

    if (clientsToInsert.length === 0 && clientsToUpdate.length === 0) {
      return res.status(400).json({ error: 'No valid clients to import' });
    }

    const result = await db.bulkImportClients(clientsToInsert, clientsToUpdate);

    res.json({
      inserted: result.inserted,
      updated: result.updated,
      skippedRows,
      warnings,
    });
  } catch (err) { next(err); }
});

// POST /api/org-flow/sync-bullhorn-clients — pull active Bullhorn ClientCorporations
// into Org Flow. Also runs on a 30-minute cron (server/index.js); this endpoint
// exists for the manual "Sync from Bullhorn" button on the dashboard.
//
// Manual click forces a full scan (full: true) so status backfills cover
// every corp, and skips the contact sync (which iterates ~150 chunks at
// 1–2s each and would blow past the HTTP request timeout). Cron remains
// incremental and handles contacts on its 30-minute schedule.
router.post('/sync-bullhorn-clients', async (req, res, next) => {
  try {
    const result = await syncBullhornClients({ full: true, skipContacts: true });
    res.json(result);
  } catch (err) {
    if (err.code === 'STATUS_COLUMN_MISSING' || (err.message && /column .*status.*schema cache/i.test(err.message))) {
      return res.status(500).json({
        error: 'The clients.status column is missing in Supabase. Run server/migrations/008_orgflow_clients_status.sql in your Supabase SQL editor, then click Sync from Bullhorn again.',
        code: 'STATUS_COLUMN_MISSING',
      });
    }
    next(err);
  }
});

// GET /api/org-flow/sync-bullhorn-clients/status — last run info for UI
router.get('/sync-bullhorn-clients/status', async (req, res, next) => {
  try {
    const state = await db.getSyncState('orgflow_bullhorn_clients');
    res.json(state || { last_run_at: null, last_success_at: null });
  } catch (err) { next(err); }
});

// POST /api/org-flow/clients/:id/logo — upload client logo
router.post('/clients/:id/logo', upload.single('logo'), verifyImageBuffer, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const publicUrl = await db.uploadClientLogo(
      req.params.id,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    res.json({ logo_url: publicUrl });
  } catch (err) { next(err); }
});

// DELETE /api/org-flow/clients/:id/logo — remove client logo
router.delete('/clients/:id/logo', async (req, res, next) => {
  try {
    await db.removeClientLogo(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// =============================================
// Employees
// =============================================

// GET /api/org-flow/clients/:id/employees — list employees for a client
router.get('/clients/:id/employees', async (req, res, next) => {
  try {
    const employees = await db.getEmployeesByClient(req.params.id);
    res.json(employees);
  } catch (err) { next(err); }
});

// POST /api/org-flow/clients/:id/employees — create employee
router.post('/clients/:id/employees', async (req, res, next) => {
  try {
    const fields = { ...req.body, client_id: req.params.id };
    const employee = await db.createEmployee(fields);
    res.json(employee);
  } catch (err) { next(err); }
});

// PATCH /api/org-flow/employees/:id — update employee
router.patch('/employees/:id', async (req, res, next) => {
  try {
    const employee = await db.updateEmployee(req.params.id, req.body);
    res.json(employee);
  } catch (err) { next(err); }
});

// DELETE /api/org-flow/employees/:id — delete employee (with report reassignment)
router.delete('/employees/:id', async (req, res, next) => {
  try {
    // Need all employees for reassignment logic
    const clientId = req.query.clientId;
    const allEmployees = clientId ? await db.getEmployeesByClient(clientId) : [];
    await db.deleteEmployee(req.params.id, allEmployees);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/org-flow/employees/bulk-delete — delete multiple employees
router.post('/employees/bulk-delete', async (req, res, next) => {
  try {
    const { ids, clientId } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    const allEmployees = clientId ? await db.getEmployeesByClient(clientId) : [];
    await db.bulkDeleteEmployees(ids, allEmployees);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/org-flow/clients/:id/employees/positions — save employee positions
router.post('/clients/:id/employees/positions', async (req, res, next) => {
  try {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'updates array required' });
    await db.updateEmployeePositions(updates);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/org-flow/clients/:id/employees/reset-positions — reset all positions
router.post('/clients/:id/employees/reset-positions', async (req, res, next) => {
  try {
    await db.resetEmployeePositions(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/org-flow/clients/:id/employees/import — bulk import employees from parsed Excel data
router.post('/clients/:id/employees/import', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const { toInsert, toUpdate, validRows } = req.body;

    if (!validRows || !Array.isArray(validRows)) {
      return res.status(400).json({ error: 'validRows array required' });
    }

    const result = await db.bulkImportEmployees(
      clientId,
      toInsert || [],
      toUpdate || [],
      validRows
    );

    res.json(result);
  } catch (err) { next(err); }
});

// =============================================
// Client Assignments
// =============================================

// GET /api/org-flow/clients/:id/assignments — list assignments for a client
router.get('/clients/:id/assignments', async (req, res, next) => {
  try {
    const assignments = await db.getAssignments(req.params.id);
    res.json(assignments);
  } catch (err) { next(err); }
});

// POST /api/org-flow/clients/:id/assignments — assign user to client
router.post('/clients/:id/assignments', async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    // Use the authenticated user's email for assigned_by tracking
    const currentUser = await db.getUserByEmail(req.user?.email || '');
    const assignment = await db.createAssignment(req.params.id, user_id, currentUser?.id || null);
    res.json(assignment);
  } catch (err) { next(err); }
});

// DELETE /api/org-flow/assignments/:id — remove assignment
router.delete('/assignments/:id', async (req, res, next) => {
  try {
    await db.deleteAssignment(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// =============================================
// Bullhorn-sourced data (existing routes)
// =============================================

// GET /api/org-flow/contractor-counts
router.get('/contractor-counts', async (req, res, next) => {
  try {
    const result = await getActivePlacementsWithClient();
    const placements = result?.data || [];

    const dataByEmail = {};
    for (const p of placements) {
      const email = p.jobOrder?.clientContact?.email;
      if (!email) continue;
      const key = email.toLowerCase();
      if (!dataByEmail[key]) dataByEmail[key] = { contractors: 0, permPlacements: 0, placements: [] };

      const empType = (p.employeeType || '').toLowerCase();
      const isPerm = empType === 'perm';
      const candidateName = p.candidate
        ? `${p.candidate.firstName || ''} ${p.candidate.lastName || ''}`.trim()
        : 'Unknown';

      if (isPerm) {
        dataByEmail[key].permPlacements++;
      } else {
        dataByEmail[key].contractors++;
      }

      dataByEmail[key].placements.push({
        id: p.id,
        candidateId: p.candidate?.id || null,
        candidateName,
        type: isPerm ? 'perm' : 'contractor',
        jobTitle: p.jobOrder?.title || '',
      });
    }

    res.json(dataByEmail);
  } catch (err) {
    next(err);
  }
});

// GET /api/org-flow/client-health
router.get('/client-health', async (req, res, next) => {
  try {
    // Fetch all employees and contractor counts in parallel
    const { supabase } = require('../lib/db');
    if (!supabase) return res.json({});

    const [employeesRes, placementsResult] = await Promise.all([
      supabase.from('employees').select('id,client_id,name,role,email,num_ftes,num_contractors,reports_to_id').not('name', 'ilike', 'Default Contact%'),
      getActivePlacementsWithClient(),
    ]);

    const employees = employeesRes?.data || [];
    const placements = placementsResult?.data || [];

    // Build live counts by email, split by type, and track individual placements
    const liveCountByEmail = {};
    const placementsByEmail = {};
    for (const p of placements) {
      const email = p.jobOrder?.clientContact?.email;
      if (!email) continue;
      const key = email.toLowerCase();
      if (!liveCountByEmail[key]) liveCountByEmail[key] = { contractors: 0, permPlacements: 0, total: 0 };
      if (!placementsByEmail[key]) placementsByEmail[key] = [];

      const empType = (p.employeeType || '').toLowerCase();
      if (empType === 'perm') {
        liveCountByEmail[key].permPlacements++;
      } else {
        liveCountByEmail[key].contractors++;
      }
      liveCountByEmail[key].total++;

      placementsByEmail[key].push({
        candidateName: `${p.candidate?.firstName || ''} ${p.candidate?.lastName || ''}`.trim(),
        type: empType === 'perm' ? 'Perm' : 'Contractor',
        jobTitle: p.jobOrder?.title || '',
      });
    }

    // Build set of employee IDs that have direct reports
    const hasDirectReports = new Set();
    for (const emp of employees) {
      if (emp.reports_to_id) {
        hasDirectReports.add(emp.reports_to_id);
      }
    }

    // Group employees by client and calculate per-client stats
    const clientStats = {};

    for (const emp of employees) {
      const cid = emp.client_id;
      if (!clientStats[cid]) clientStats[cid] = { totalManagers: 0, healthyManagers: 0, managers: [], totalAllies: 0, allies: [] };

      const emailKey = emp.email ? emp.email.toLowerCase() : null;
      const counts = emailKey ? (liveCountByEmail[emailKey] || { contractors: 0, permPlacements: 0, total: 0 }) : { contractors: 0, permPlacements: 0, total: 0 };
      const hasFtes = (emp.num_ftes || 0) > 0;
      const hasContractors = (emp.num_contractors || 0) > 0;
      const hasReports = hasDirectReports.has(emp.id);
      const hasLivePlacements = counts.total > 0;

      // Accumulate allies for this client
      clientStats[cid].totalAllies += counts.total;
      if (hasLivePlacements && emailKey) {
        const empPlacements = placementsByEmail[emailKey] || [];
        for (const pl of empPlacements) {
          clientStats[cid].allies.push({
            contactName: emp.name || '',
            contactRole: emp.role || '',
            candidateName: pl.candidateName,
            type: pl.type,
            jobTitle: pl.jobTitle,
          });
        }
      }

      // Is this a people manager?
      const isPeopleManager = hasReports || hasFtes || hasContractors || hasLivePlacements;
      if (!isPeopleManager) continue;

      clientStats[cid].totalManagers++;
      if (hasLivePlacements) {
        clientStats[cid].healthyManagers++;
      }

      clientStats[cid].managers.push({
        name: emp.name || '',
        role: emp.role || '',
        email: emp.email || '',
        healthy: hasLivePlacements,
        activeContractors: counts.contractors,
        activePerm: counts.permPlacements,
        ftes: emp.num_ftes || 0,
        contractors: emp.num_contractors || 0,
        directReports: hasReports,
      });
    }

    // Build response: clientId → percentage + manager details
    const result = {};
    for (const [cid, stats] of Object.entries(clientStats)) {
      stats.managers.sort((a, b) => {
        if (a.healthy !== b.healthy) return a.healthy ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
      stats.allies.sort((a, b) => a.contactName.localeCompare(b.contactName) || a.candidateName.localeCompare(b.candidateName));
      result[cid] = {
        totalManagers: stats.totalManagers,
        healthyManagers: stats.healthyManagers,
        percentage: stats.totalManagers > 0 ? Math.round((stats.healthyManagers / stats.totalManagers) * 100) : 0,
        managers: stats.managers,
        totalAllies: stats.totalAllies,
        allies: stats.allies,
      };
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
