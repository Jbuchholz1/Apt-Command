const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/db');
const { resolveRole } = require('../lib/roles');

// GET /api/users/me — Returns the current user's profile and role
router.get('/me', async (req, res, next) => {
  try {
    const email = req.user?.email || '';
    const name = req.user?.name || '';
    const role = await resolveRole(email);

    res.json({ email, name, role });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/announcement — Returns the current announcement
router.get('/announcement', async (req, res, next) => {
  try {
    if (!supabase) return res.json({ text: '' });

    const { data, error } = await supabase
      .from('announcements')
      .select('text, updated_by, updated_at')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    res.json(data || { text: '' });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/reminder — Returns the current reminder
router.get('/reminder', async (req, res, next) => {
  try {
    if (!supabase) return res.json({ text: '' });

    const { data, error } = await supabase
      .from('announcements')
      .select('text, updated_by, updated_at')
      .eq('id', 2)
      .maybeSingle();

    if (error) throw error;

    res.json(data || { text: '' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
