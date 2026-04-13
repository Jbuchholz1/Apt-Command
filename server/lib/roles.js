/**
 * Role resolution — determines a user's app role.
 *
 * Strategy:
 *   1. Query user_profiles.role in Supabase (authoritative once migration runs)
 *   2. Fall back to BOOTSTRAP_ADMINS if DB has no role or query fails
 *   3. Default to 'basic'
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Bootstrap admin list — works even before the DB migration runs
const BOOTSTRAP_ADMINS = new Set([
  'james@aptcompanies.io',
  'matt@aptcompanies.io',
]);

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
