const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/db');
const { resolvePermissions } = require('../lib/roles');
const { getCorporateUserByEmail } = require('../lib/bullhorn');

// GET /api/users/me — Returns the current user's profile and role.
//
// The `bullhorn` block carries the caller's functional role
// (customText1 = "Account Manager" | "Recruiter") plus their Bullhorn
// CorporateUser id, so the client can render role-aware dashboards
// without a second round-trip. Fail-soft: if the Bullhorn lookup fails
// (outage, missing user), bullhorn is null and the app still loads.
router.get('/me', async (req, res, next) => {
  try {
    const email = req.user?.email || '';
    const name = req.user?.name || '';
    const { role, permissions } = await resolvePermissions(email);

    let bullhorn = null;
    if (email) {
      try {
        const corpUser = await getCorporateUserByEmail(email);
        if (corpUser) {
          bullhorn = {
            userId: corpUser.id,
            role: (corpUser.customText1 || '').trim(),
            name: `${corpUser.firstName || ''} ${corpUser.lastName || ''}`.trim(),
          };
        }
      } catch (err) {
        console.warn('[/api/users/me] Bullhorn lookup failed:', err.message);
      }
    }

    res.json({ email, name, role, permissions, bullhorn });
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

module.exports = router;
