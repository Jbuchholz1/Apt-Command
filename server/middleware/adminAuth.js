const { resolveRole } = require('../lib/roles');

/**
 * Helper — resolves the user's role and attaches it to req.user.
 */
async function attachRole(req, res) {
  const email = req.user?.email;
  if (!email) {
    res.status(401).json({ error: 'Unauthorized — no user identity' });
    return null;
  }
  const role = await resolveRole(email);
  req.user.role = role;
  return role;
}

/**
 * Middleware that requires the requesting user to be an admin.
 * Must be placed AFTER requireAuth (which populates req.user).
 */
async function requireAdmin(req, res, next) {
  const role = await attachRole(req, res);
  if (!role) return; // 401 already sent

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden — admin access required' });
  }

  next();
}

/**
 * Middleware that requires the requesting user to be a manager or admin.
 * Managers have the same access as admins except Operations and role changes.
 */
async function requireManager(req, res, next) {
  const role = await attachRole(req, res);
  if (!role) return; // 401 already sent

  if (role !== 'admin' && role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden — manager or admin access required' });
  }

  next();
}

module.exports = { requireAdmin, requireManager };
