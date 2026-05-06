/**
 * Role and per-module permission resolution.
 *
 * Two layers:
 *   1. Global role (admin / manager / basic) from user_profiles.role.
 *      - admin → superuser bypass: implicit `admin` on every module
 *      - manager / basic → no implicit module access; must look up grants
 *   2. Per-module grants from user_module_permissions:
 *      { module_key, access_level: 'basic' | 'admin' }
 *
 * resolveRole stays for back-compat with code that only needs the global tier.
 * resolvePermissions returns both pieces in one DB round-trip.
 */

const { supabase } = require('./db');
const { MODULE_KEYS, isValidAccessLevel } = require('./modules');

function parseBootstrapAdmins() {
  const raw = process.env.BOOTSTRAP_ADMIN_EMAILS || '';
  return new Set(
    raw.split(',')
      .map(e => e.trim().toLowerCase())
      .filter(e => e.includes('@'))
  );
}

const BOOTSTRAP_ADMINS = parseBootstrapAdmins();

const VALID_ROLES = new Set(['admin', 'manager', 'basic']);

function adminEverywhere() {
  const map = {};
  for (const key of MODULE_KEYS) map[key] = 'admin';
  return map;
}

/**
 * Resolve a user's role by email.
 * @param {string} email
 * @returns {Promise<string>} 'admin', 'manager', or 'basic'
 */
async function resolveRole(email) {
  if (!email) return 'basic';
  const normalizedEmail = email.toLowerCase().trim();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (!error && data && data.role && VALID_ROLES.has(data.role)) {
        return data.role;
      }
    } catch (err) {
      console.warn('[ROLES] DB lookup failed, using bootstrap list:', err.message);
    }
  }

  if (BOOTSTRAP_ADMINS.has(normalizedEmail)) return 'admin';

  return 'basic';
}

/**
 * Resolve a user's role + per-module permissions in one pass.
 * Global admins bypass the grants table entirely (implicit admin everywhere).
 *
 * @param {string} email
 * @returns {Promise<{ role: string, permissions: Record<string, 'basic'|'admin'> }>}
 */
async function resolvePermissions(email) {
  const role = await resolveRole(email);

  if (role === 'admin') {
    return { role, permissions: adminEverywhere() };
  }

  const permissions = {};
  if (!email || !supabase) return { role, permissions };

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const { data, error } = await supabase
      .from('user_module_permissions')
      .select('module_key, access_level')
      .ilike('user_email', normalizedEmail);

    if (error) {
      // Table may not exist yet (migration not applied) — log and return empty.
      console.warn('[ROLES] user_module_permissions lookup failed:', error.message);
      return { role, permissions };
    }

    for (const row of data || []) {
      if (row && row.module_key && isValidAccessLevel(row.access_level)) {
        permissions[row.module_key] = row.access_level;
      }
    }
  } catch (err) {
    console.warn('[ROLES] user_module_permissions query threw:', err.message);
  }

  return { role, permissions };
}

module.exports = { resolveRole, resolvePermissions, VALID_ROLES };
