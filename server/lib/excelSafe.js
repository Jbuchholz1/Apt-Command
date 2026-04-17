/**
 * Sanitize a cell value to prevent Excel formula injection.
 *
 * Excel interprets any cell starting with =, +, -, or @ as a formula.
 * An attacker who controls a field (e.g., a job title or candidate name)
 * could craft content like "=HYPERLINK(...)" or "=cmd|..." that executes
 * when the recipient opens the Excel file.
 *
 * This helper prefixes such values with a leading apostrophe — Excel's
 * standard escape for text that should not be interpreted as a formula.
 *
 * Returns the value unchanged for numbers, booleans, dates, null, or
 * strings that don't start with a dangerous character.
 */
function sanitizeCell(val) {
  if (typeof val !== 'string' || val.length === 0) return val;
  const first = val.charAt(0);
  if (first !== '=' && first !== '+' && first !== '-' && first !== '@') return val;

  // = and @ are always formula/reference starters — always escape
  if (first === '=' || first === '@') return "'" + val;

  // + and - are only dangerous if followed by non-numeric content.
  // Preserve pure numeric strings like "-5.00" or "+42" so currency/number
  // columns render correctly.
  if (/^[+-]\d+(\.\d+)?$/.test(val)) return val;

  return "'" + val;
}

/**
 * Sanitize a row object for Excel output — applies sanitizeCell to each
 * string value while passing numbers, dates, booleans, null, and nested
 * objects/arrays through unchanged.
 */
function sanitizeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const result = {};
  for (const key of Object.keys(row)) {
    result[key] = sanitizeCell(row[key]);
  }
  return result;
}

module.exports = { sanitizeCell, sanitizeRow };
