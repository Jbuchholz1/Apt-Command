const { resolveRole, resolvePermissions } = require('../lib/roles');

/**
 * Helper — resolves the user's role and attaches it to req.user.
 */
async function attachRole(req, res) {
  const email = req.user?.email;
  if (!email) {
    res.status(401).json({ error: 'Unauthorized — no user identity' });
    return null;
  }
  if (req.user.role) return req.user.role;
  const role = await resolveRole(email);
  req.user.role = role;
  return role;
}

/**
 * Helper — resolves role + per-module permissions and attaches both to req.user.
 * Idempotent: safe to call multiple times within a request.
 */
async function attachPermissions(req, res) {
  const email = req.user?.email;
  if (!email) {
    res.status(401).json({ error: 'Unauthorized — no user identity' });
    return null;
  }
  if (req.user.permissions) return req.user.permissions;
  const { role, permissions } = await resolvePermissions(email);
  req.user.role = role;
  req.user.permissions = permissions;
  return permissions;
}

/**
 * Middleware factory — gate a route on a specific module + access level.
 * @param {string} moduleKey  e.g. 'operations', 'reporting_sales'
 * @param {'basic'|'admin'} level  defaults to 'basic'
 */
function requireModule(moduleKey, level = 'basic') {
  return async (req, res, next) => {
    try {
      const permissions = await attachPermissions(req, res);
      if (!permissions) return; // 401 already sent

      const granted = permissions[moduleKey];
      if (!granted) {
        return res.status(403).json({ error: `Forbidden — no access to ${moduleKey}` });
      }
      if (level === 'admin' && granted !== 'admin') {
        return res.status(403).json({ error: `Forbidden — ${moduleKey} admin access required` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware — allow only internal (Azure SSO) staff; block external vendor
 * logins (req.user.provider === 'external'). Used for endpoints that expose
 * firm-wide Bullhorn data — Universal Search and the Daily Brief dashboard —
 * which external vendors must not reach. requireAuth still runs first, so
 * req.user is always present here.
 */
function requireInternal(req, res, next) {
  if (req.user?.provider === 'external') {
    return res.status(403).json({ error: 'Forbidden — internal staff only' });
  }
  next();
}

/**
 * Legacy — requires global admin tier. Kept for back-compat where a route
 * gates on the global role (e.g. role-change endpoint). For module access,
 * prefer requireModule.
 */
async function requireAdmin(req, res, next) {
  const role = await attachRole(req, res);
  if (!role) return;

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden — admin access required' });
  }
  next();
}

/**
 * Legacy — requires global admin or manager tier. Kept for back-compat.
 * Prefer requireModule for new code.
 */
async function requireManager(req, res, next) {
  const role = await attachRole(req, res);
  if (!role) return;

  if (role !== 'admin' && role !== 'manager') {
    return res.status(403).json({ error: 'Forbidden — manager or admin access required' });
  }
  next();
}

module.exports = { requireAdmin, requireManager, requireModule, requireInternal, attachPermissions };
