const express = require('express');
const router = express.Router();
const { supabase, listReconciliationQueue, getSchemaFeatures } = require('../lib/db');
const { requireModule } = require('../middleware/adminAuth');
const { VALID_ROLES } = require('../lib/roles');
const { isValidModuleKey, isValidAccessLevel, MODULE_KEYS } = require('../lib/modules');

// Admin module = any user with admin:basic can read; admin:admin needed
// for mutations (role changes, permission grants, announcement edits).
router.use(requireModule('admin'));

// GET /api/admin/users — List all users with roles
router.get('/users', async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, is_active, role')
      .order('full_name', { nullsFirst: false });

    if (error) throw error;

    res.json({ users: data || [] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/role — Update a user's role.
// Requires admin-level access on the admin module (or global admin).
router.patch('/users/:id/role', requireModule('admin', 'admin'), async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { id } = req.params;
    const { role } = req.body || {};

    // Validate role
    if (!role || !VALID_ROLES.has(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}` });
    }

    // Prevent self-demotion
    const requestingEmail = (req.user?.email || '').toLowerCase();
    const { data: targetUser } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', id)
      .maybeSingle();

    if (targetUser && (targetUser.email || '').toLowerCase() === requestingEmail && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot remove your own admin role' });
    }

    // Update the role
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ role })
      .eq('id', id)
      .select('id, email, full_name, is_active, role')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found' });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/announcement — Update the announcement text (admin-level on admin module)
router.put('/announcement', requireModule('admin', 'admin'), async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { text } = req.body || {};
    if (typeof text !== 'string') {
      return res.status(400).json({ error: 'text field required' });
    }

    // Upsert into announcements table (single-row, id=1)
    const { data, error } = await supabase
      .from('announcements')
      .upsert({ id: 1, text: text.trim(), updated_by: req.user?.email || '', updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/reconciliation-queue — list pending split-brain rows.
// Visible to managers+ so ops can see when Bullhorn/local writes diverged.
router.get('/reconciliation-queue', async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    const features = getSchemaFeatures();
    if (!features.reconciliationQueue) {
      return res.json({ enabled: false, rows: [] });
    }
    const status = ['pending', 'resolved', 'ignored'].includes(req.query.status)
      ? req.query.status
      : 'pending';
    const rows = await listReconciliationQueue({ status, limit: 200 });
    res.json({ enabled: true, rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users/:id/permissions — list a user's per-module grants
router.get('/users/:id/permissions', async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { id } = req.params;
    const { data: targetUser, error: userErr } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, role')
      .eq('id', id)
      .maybeSingle();
    if (userErr) throw userErr;
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const { data: rows, error: permErr } = await supabase
      .from('user_module_permissions')
      .select('module_key, access_level, granted_by, granted_at')
      .ilike('user_email', (targetUser.email || '').toLowerCase());
    if (permErr) throw permErr;

    res.json({
      user: targetUser,
      modules: MODULE_KEYS,
      permissions: rows || [],
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id/permissions — replace the user's full grant set
// Body: { permissions: [{ module_key, access_level }, ...] }
// Admin-level on admin module required. Self-revoke of admin:admin is blocked.
router.put('/users/:id/permissions', requireModule('admin', 'admin'), async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { id } = req.params;
    const { permissions } = req.body || {};
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions must be an array' });
    }

    // Validate every entry up-front
    const seen = new Set();
    for (const p of permissions) {
      if (!p || !isValidModuleKey(p.module_key)) {
        return res.status(400).json({ error: `Invalid module_key: ${p?.module_key}` });
      }
      if (!isValidAccessLevel(p.access_level)) {
        return res.status(400).json({ error: `Invalid access_level: ${p?.access_level}` });
      }
      if (seen.has(p.module_key)) {
        return res.status(400).json({ error: `Duplicate module_key: ${p.module_key}` });
      }
      seen.add(p.module_key);
    }

    const { data: targetUser, error: userErr } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('id', id)
      .maybeSingle();
    if (userErr) throw userErr;
    if (!targetUser || !targetUser.email) return res.status(404).json({ error: 'User not found' });

    const targetEmail = targetUser.email.toLowerCase();
    const requesterEmail = (req.user?.email || '').toLowerCase();

    // Self-protection: a user cannot revoke their own admin:admin grant.
    // (Global role 'admin' bypass still applies — they can recover by being
    // restored to global admin.)
    if (targetEmail === requesterEmail && req.user?.role !== 'admin') {
      const stillHasAdminAdmin = permissions.some(
        p => p.module_key === 'admin' && p.access_level === 'admin'
      );
      if (!stillHasAdminAdmin) {
        return res.status(400).json({
          error: 'Cannot revoke your own admin-level grant on the Admin module',
        });
      }
    }

    // Replace the full set: delete then insert. Not strictly transactional,
    // but the unique constraint plus the small row count keeps the window
    // narrow enough for an admin tool.
    const { error: delErr } = await supabase
      .from('user_module_permissions')
      .delete()
      .ilike('user_email', targetEmail);
    if (delErr) throw delErr;

    if (permissions.length > 0) {
      const rows = permissions.map(p => ({
        user_email: targetEmail,
        module_key: p.module_key,
        access_level: p.access_level,
        granted_by: req.user?.email || null,
      }));
      const { error: insErr } = await supabase
        .from('user_module_permissions')
        .insert(rows);
      if (insErr) throw insErr;
    }

    const { data: updated } = await supabase
      .from('user_module_permissions')
      .select('module_key, access_level, granted_by, granted_at')
      .ilike('user_email', targetEmail);

    res.json({ permissions: updated || [] });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/run-export-now — Trigger the nightly SharePoint export on-demand.
// Same code path as the 23:00 cron (see lib/scheduledExport.js + lib/sharepoint.js).
// Useful for ad-hoc snapshots before a major change, or for verifying the
// SharePoint upload pipeline without waiting for the next cron tick.
//
// Returns { ok, results } where results is an array of per-file status:
//   { name, filename, status: 'ok' | 'fail', webUrl?, error? }
router.post('/run-export-now', requireModule('admin', 'admin'), async (req, res, next) => {
  try {
    const { runNightlyExport } = require('../lib/scheduledExport');
    const results = await runNightlyExport();
    const ok = results.every(r => r.status === 'ok');
    res.json({ ok, results });
  } catch (err) {
    // Top-level errors (e.g., missing env vars) bubble to the standard handler.
    next(err);
  }
});

module.exports = router;
