const express = require('express');
const router = express.Router();
const { supabase, listReconciliationQueue, getSchemaFeatures } = require('../lib/db');
const { requireAdmin, requireManager } = require('../middleware/adminAuth');
const { VALID_ROLES } = require('../lib/roles');

// Most admin routes require manager or above; role changes require full admin
router.use(requireManager);

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

// PATCH /api/admin/users/:id/role — Update a user's role (admin only — managers cannot change roles)
router.patch('/users/:id/role', requireAdmin, async (req, res, next) => {
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

// PUT /api/admin/announcement — Update the announcement text
router.put('/announcement', async (req, res, next) => {
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

module.exports = router;
