const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { supabase } = require('../lib/db');
const { issueExternalToken, requireAuth } = require('../middleware/auth');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../lib/passwords');

const LOCKOUT_THRESHOLD = 10;       // failed attempts before lockout
const LOCKOUT_MINUTES = 30;          // duration of the lockout window
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

// Strict IP limiter on the public login endpoint — defends the credential
// path from brute-force regardless of which account is being targeted.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again in a few minutes' },
});

// POST /api/auth/external/login — public, rate-limited.
// Body: { email, password }
router.post('/external/login', loginLimiter, async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });

    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, role, is_active, auth_provider, password_hash, password_updated_at, password_must_change, failed_login_count, locked_until')
      .ilike('email', email)
      .maybeSingle();
    if (error) throw error;

    // Constant-ish response shape regardless of which check fails — don't
    // leak whether the account exists. Lockout/inactive return distinct
    // codes only after the password matches, except for lockout which is
    // surfaced eagerly so the user knows to wait.
    if (!user || user.auth_provider !== 'external' || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return res.status(423).json({ error: 'Account is locked — try again later' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const nextCount = (user.failed_login_count || 0) + 1;
      const updates = { failed_login_count: nextCount };
      if (nextCount >= LOCKOUT_THRESHOLD) {
        updates.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
      }
      await supabase.from('user_profiles').update(updates).eq('id', user.id);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Success — clear failure state.
    await supabase
      .from('user_profiles')
      .update({ failed_login_count: 0, locked_until: null })
      .eq('id', user.id);

    const token = issueExternalToken({
      id: user.id,
      email: user.email,
      name: user.full_name || user.email,
      passwordUpdatedAt: user.password_updated_at,
    });

    res.json({
      token,
      expiresIn: TOKEN_TTL_SECONDS,
      user: {
        email: user.email,
        full_name: user.full_name,
        mustChangePassword: !!user.password_must_change,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/external/change-password — authenticated, external sessions only.
// Body: { currentPassword, newPassword }
router.post('/external/change-password', requireAuth, async (req, res, next) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Database not configured' });
    if (req.user?.provider !== 'external') {
      return res.status(403).json({ error: 'Only external users can change passwords here' });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }

    try {
      validatePasswordStrength(newPassword);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, password_hash')
      .eq('id', req.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ok = await verifyPassword(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await hashPassword(newPassword);
    const passwordUpdatedAt = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('user_profiles')
      .update({
        password_hash: newHash,
        password_updated_at: passwordUpdatedAt,
        password_must_change: false,
        failed_login_count: 0,
        locked_until: null,
      })
      .eq('id', user.id);
    if (updErr) throw updErr;

    // Re-issue the token with the new pwUpdatedAt claim. The old token (still
    // in the user's browser at the moment of this call) is invalidated by
    // the verifyExternalToken claim-vs-row check on its next request.
    const token = issueExternalToken({
      id: user.id,
      email: user.email,
      name: user.full_name || user.email,
      passwordUpdatedAt,
    });

    res.json({ token, expiresIn: TOKEN_TTL_SECONDS });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
