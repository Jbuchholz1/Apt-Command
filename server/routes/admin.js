const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('../middleware/adminAuth');
const { VALID_ROLES } = require('../lib/roles');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// All routes in this file require admin
router.use(requireAdmin);

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

// PATCH /api/admin/users/:id/role — Update a user's role
router.patch('/users/:id/role', async (req, res, next) => {
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

module.exports = router;
