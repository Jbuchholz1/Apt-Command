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
//
// External users (auth_provider='external') skip the Bullhorn lookup
// entirely and surface `password_must_change` so the client can show the
// forced-change modal.
router.get('/me', async (req, res, next) => {
  try {
    const email = req.user?.email || '';
    const name = req.user?.name || '';
    const provider = req.user?.provider || 'azure';
    const { role, permissions } = await resolvePermissions(email);

    let authProvider = provider;
    let passwordMustChange = false;
    if (supabase && email) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('auth_provider, password_must_change')
        .ilike('email', email)
        .maybeSingle();
      if (profile) {
        authProvider = profile.auth_provider || provider;
        passwordMustChange = !!profile.password_must_change;
      }
    }

    let bullhorn = null;
    if (email && authProvider !== 'external') {
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

    res.json({
      email,
      name,
      role,
      permissions,
      bullhorn,
      auth_provider: authProvider,
      password_must_change: passwordMustChange,
    });
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
