const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'overrides.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS job_overrides (
    job_id INTEGER PRIMARY KEY,
    recruiter TEXT DEFAULT '',
    follow_up TEXT DEFAULT '',
    deadline TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT DEFAULT ''
  )
`);

// Migrations: add columns if missing (for existing databases)
try {
  db.exec(`ALTER TABLE job_overrides ADD COLUMN notes TEXT DEFAULT ''`);
} catch (e) { /* already exists */ }

try {
  db.exec(`ALTER TABLE job_overrides ADD COLUMN coverage_needed TEXT DEFAULT ''`);
} catch (e) { /* already exists */ }

/**
 * Get all overrides as a map keyed by job_id.
 */
function getAllOverrides() {
  const rows = db.prepare('SELECT * FROM job_overrides').all();
  const map = {};
  for (const row of rows) {
    map[row.job_id] = row;
  }
  return map;
}

/**
 * Get overrides for a specific job.
 */
function getOverrides(jobId) {
  return db.prepare('SELECT * FROM job_overrides WHERE job_id = ?').get(jobId) || null;
}

/**
 * Upsert overrides for a job. Only updates fields that are provided.
 */
function upsertOverrides(jobId, { recruiter, follow_up, deadline, notes, coverage_needed, updated_by }) {
  const existing = getOverrides(jobId);

  if (existing) {
    const updates = [];
    const params = [];
    if (recruiter !== undefined) { updates.push('recruiter = ?'); params.push(recruiter); }
    if (follow_up !== undefined) { updates.push('follow_up = ?'); params.push(follow_up); }
    if (deadline !== undefined) { updates.push('deadline = ?'); params.push(deadline); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (coverage_needed !== undefined) { updates.push('coverage_needed = ?'); params.push(coverage_needed); }
    updates.push("updated_at = datetime('now')");
    if (updated_by) { updates.push('updated_by = ?'); params.push(updated_by); }
    params.push(jobId);

    db.prepare(`UPDATE job_overrides SET ${updates.join(', ')} WHERE job_id = ?`).run(...params);
  } else {
    db.prepare(`
      INSERT INTO job_overrides (job_id, recruiter, follow_up, deadline, notes, coverage_needed, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      jobId,
      recruiter || '',
      follow_up || '',
      deadline || '',
      notes || '',
      coverage_needed || '',
      updated_by || ''
    );
  }

  return getOverrides(jobId);
}

// --- Notes ---

db.exec(`
  CREATE TABLE IF NOT EXISTS job_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    comment TEXT NOT NULL,
    created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

function getNotesForJob(jobId) {
  return db.prepare(
    'SELECT * FROM job_notes WHERE job_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(jobId);
}

function addNote(jobId, comment, createdBy) {
  const result = db.prepare(
    'INSERT INTO job_notes (job_id, comment, created_by) VALUES (?, ?, ?)'
  ).run(jobId, comment, createdBy || '');
  return db.prepare('SELECT * FROM job_notes WHERE id = ?').get(result.lastInsertRowid);
}

module.exports = { getAllOverrides, getOverrides, upsertOverrides, getNotesForJob, addNote };
