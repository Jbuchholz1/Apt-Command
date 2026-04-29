/**
 * Role resolution — determines a user's app role.
 *
 * Strategy:
 *   1. Query user_profiles.role in Supabase (authoritative once migration runs)
 *   2. Fall back to BOOTSTRAP_ADMINS if DB has no role or query fails
 *   3. Default to 'basic'
 */

const { supabase } = require('./db');

// Bootstrap admin list — comma-separated emails in BOOTSTRAP_ADMIN_EMAILS.
// If the env var is unset, no users are bootstrap admins and the Supabase
// user_profiles.role column becomes the only path to admin.
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

/**
 * Resolve a user's role by email.
 * @param {string} email
 * @returns {Promise<string>} 'admin', 'manager', or 'basic'
 */
async function resolveRole(email) {
  if (!email) return 'basic';
  const normalizedEmail = email.toLowerCase().trim();

  // Try database lookup
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
      // DB query failed (e.g. role column doesn't exist yet) — fall through to bootstrap
      console.warn('[ROLES] DB lookup failed, using bootstrap list:', err.message);
    }
  }

  // Fallback to bootstrap list
  if (BOOTSTRAP_ADMINS.has(normalizedEmail)) return 'admin';

  return 'basic';
}

module.exports = { resolveRole, VALID_ROLES };
