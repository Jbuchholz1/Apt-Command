const { resolveRole } = require('../lib/roles');

/**
 * Middleware that requires the requesting user to be an admin.
 * Must be placed AFTER requireAuth (which populates req.user).
 */
async function requireAdmin(req, res, next) {
  const email = req.user?.email;
  if (!email) {
    return res.status(401).json({ error: 'Unauthorized — no user identity' });
  }

  const role = await resolveRole(email);
  req.user.role = role;

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden — admin access required' });
  }

  next();
}

module.exports = { requireAdmin };
