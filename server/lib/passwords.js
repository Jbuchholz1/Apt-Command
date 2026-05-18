const bcrypt = require('bcrypt');

const BCRYPT_COST = 12;
const MIN_LENGTH = 12;

// Tiny denylist of the most-obvious weak passwords. Length + letter+digit
// requirement does most of the work; this catches things that satisfy the
// rules but are still trivially guessable.
const OBVIOUS_PASSWORDS = new Set([
  'password1234',
  'passwordpassword',
  'aaaaaaaaaaaa',
  'aaaaaaaaaaaa1',
  'qwertyuiop12',
  '123456789012',
  'apt2026apt26',
  'changeme1234',
  'letmein12345',
  'welcome12345',
  'admin1234567',
]);

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * Throws an Error with a user-facing message if the password fails policy.
 * Policy: ≥12 chars, at least one letter and one digit, not in denylist.
 */
function validatePasswordStrength(plain) {
  if (typeof plain !== 'string') {
    throw new Error('Password is required');
  }
  if (plain.length < MIN_LENGTH) {
    throw new Error(`Password must be at least ${MIN_LENGTH} characters`);
  }
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) {
    throw new Error('Password must contain at least one letter and one digit');
  }
  if (OBVIOUS_PASSWORDS.has(plain.toLowerCase())) {
    throw new Error('Password is too common — choose something less guessable');
  }
}

module.exports = { hashPassword, verifyPassword, validatePasswordStrength };
