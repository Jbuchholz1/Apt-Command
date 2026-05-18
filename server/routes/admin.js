const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const { supabase, listReconciliationQueue, getSchemaFeatures } = require('../lib/db');
const { requireModule } = require('../middleware/adminAuth');
const { VALID_ROLES } = require('../lib/roles');
const { isValidModuleKey, isValidAccessLevel, MODULE_KEYS } = require('../lib/modules');
const { hashPassword, validatePasswordStrength } = require('../lib/passwords');

// Admin module = any user with admin:basic can read; admin:admin needed
// for mutations (role changes, permission grants, announcement edits).
router.use(requireModule('admin'));

// GET /api/admin/users — List all users with roles
router.get('/users', async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, is_active, role, auth_provider')
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

// POST /api/admin/users/external — Create a new external (non-Azure) user.
// Body: { email, full_name, initial_password }
// On success: returns the new user row. The password is set with
// password_must_change=true so the user must rotate it on first login.
router.post('/users/external', requireModule('admin', 'admin'), async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
    const initialPassword = typeof req.body?.initial_password === 'string' ? req.body.initial_password : '';

    if (!rawEmail || !rawEmail.includes('@')) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (!fullName) {
      return res.status(400).json({ error: 'Full name is required' });
    }
    try {
      validatePasswordStrength(initialPassword);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const email = rawEmail.toLowerCase();

    // Pre-flight: surface a clear message when colliding with an existing
    // Azure user (the unique index would also catch this, but with a less
    // friendly error).
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id, auth_provider')
      .ilike('email', email)
      .maybeSingle();
    if (existing) {
      if (existing.auth_provider === 'azure') {
        return res.status(409).json({ error: 'This email already exists as a Microsoft user' });
      }
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const passwordHash = await hashPassword(initialPassword);
    const nowIso = new Date().toISOString();

    // user_profiles.id is NOT NULL with no default (Azure users get their
    // `oid` written here on first login). Generate a UUID server-side for
    // external rows so the insert satisfies the constraint.
    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        id: randomUUID(),
        email,
        full_name: fullName,
        is_active: true,
        role: 'basic',
        auth_provider: 'external',
        password_hash: passwordHash,
        password_updated_at: nowIso,
        password_must_change: true,
        failed_login_count: 0,
      })
      .select('id, email, full_name, is_active, role, auth_provider')
      .single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id — Remove an external user. Refuses Azure users
// (they're managed in Entra) and self-delete. Also cleans up the user's
// per-module permission grants, which are keyed by email and would otherwise
// linger as orphans.
router.delete('/users/:id', requireModule('admin', 'admin'), async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { id } = req.params;
    const { data: target, error: tErr } = await supabase
      .from('user_profiles')
      .select('id, email, auth_provider')
      .eq('id', id)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.auth_provider !== 'external') {
      return res.status(400).json({ error: 'Only external users can be deleted here — Azure users are managed in Entra' });
    }

    const requesterEmail = (req.user?.email || '').toLowerCase();
    if ((target.email || '').toLowerCase() === requesterEmail) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Clean up permission grants first (FK-free but keyed by email).
    await supabase
      .from('user_module_permissions')
      .delete()
      .ilike('user_email', (target.email || '').toLowerCase());

    const { error: delErr } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', id);
    if (delErr) throw delErr;

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id/password — Admin password reset for an external user.
// Body: { new_password }
// Only allowed when the target row is auth_provider='external'.
router.put('/users/:id/password', requireModule('admin', 'admin'), async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const { id } = req.params;
    const newPassword = typeof req.body?.new_password === 'string' ? req.body.new_password : '';
    try {
      validatePasswordStrength(newPassword);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const { data: target, error: tErr } = await supabase
      .from('user_profiles')
      .select('id, auth_provider')
      .eq('id', id)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.auth_provider !== 'external') {
      return res.status(400).json({ error: 'Only external users have app-managed passwords' });
    }

    const passwordHash = await hashPassword(newPassword);
    const { error: updErr } = await supabase
      .from('user_profiles')
      .update({
        password_hash: passwordHash,
        password_updated_at: new Date().toISOString(),
        password_must_change: true,
        failed_login_count: 0,
        locked_until: null,
      })
      .eq('id', id);
    if (updErr) throw updErr;

    res.json({ ok: true });
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
