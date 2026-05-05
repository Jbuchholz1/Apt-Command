const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const cache = require('./cache');

// getAllOverrides() is called on every board load. A 30s TTL with explicit
// bust-on-write lets 30 concurrent users share one Supabase round-trip
// without introducing staleness the user could notice.
const OVERRIDES_TTL_MS = 30 * 1000;
const PLACEMENT_CHECKLIST_TTL_MS = 30 * 1000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[db] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — overrides/notes WILL NOT PERSIST');
  console.error('[db]   SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
  console.error('[db]   SUPABASE_SERVICE_KEY:', supabaseKey ? 'SET' : 'MISSING');
} else {
  console.log('[db] Supabase connected');
}

const supabase = supabaseUrl && supabaseKey
  ? createSupabaseClient(supabaseUrl, supabaseKey)
  : null;

// Track which optional schema features are present. The server degrades
// gracefully if migrations haven't been applied yet:
//   - Without the `version` column, optimistic locking is skipped.
//   - Without the `reconciliation_queue` table, split-brain events are logged
//     to stderr instead.
const schemaFeatures = {
  statusChangedAt: false,
  jobOverridesVersion: false,
  reconciliationQueue: false,
};

function getSchemaFeatures() {
  return { ...schemaFeatures };
}

// Auto-migrate: ensure status_changed_at column exists on job_overrides,
// and detect the optional optimistic-locking + reconciliation features.
async function ensureSchema() {
  if (!supabase) return;
  try {
    // status_changed_at: auto-add if missing (legacy behavior).
    const { error } = await supabase.from('job_overrides').select('status_changed_at').limit(1);
    if (error && error.message.includes('status_changed_at')) {
      console.log('[db] Adding status_changed_at column to job_overrides...');
      const { error: rpcErr } = await supabase.rpc('exec_sql', {
        query: "ALTER TABLE job_overrides ADD COLUMN IF NOT EXISTS status_changed_at TEXT;"
      });
      if (rpcErr) {
        console.warn('[db] Could not auto-add status_changed_at — add manually:', rpcErr.message);
      } else {
        console.log('[db] status_changed_at column added successfully');
        schemaFeatures.statusChangedAt = true;
      }
    } else if (!error) {
      schemaFeatures.statusChangedAt = true;
    }

    // clients.status: auto-add if missing (org-flow client status pill, migration 008).
    const { error: csErr } = await supabase.from('clients').select('status').limit(1);
    if (csErr && csErr.message.toLowerCase().includes('status')) {
      console.log('[db] Adding status column to clients...');
      const { error: rpcErr } = await supabase.rpc('exec_sql', {
        query: "ALTER TABLE clients ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Unqualified';"
      });
      if (rpcErr) {
        console.warn('[db] Could not auto-add clients.status — run migration 008 manually:', rpcErr.message);
      } else {
        console.log('[db] clients.status column added successfully');
      }
    } else if (!csErr) {
      // Column exists — backfill rows still on the old draft default ("Active")
      // to match the Bullhorn picklist ("Active Account"). Idempotent.
      const { data: stale } = await supabase.from('clients').select('id').eq('status', 'Active').limit(1);
      if (stale && stale.length > 0) {
        console.log('[db] Backfilling clients.status: "Active" → "Active Account"...');
        const { error: updErr } = await supabase.from('clients').update({ status: 'Active Account' }).eq('status', 'Active');
        if (updErr) console.warn('[db] clients.status backfill failed:', updErr.message);
      }
    }

    // version: probe only — migration 002 must be applied manually.
    const { error: vErr } = await supabase.from('job_overrides').select('version').limit(1);
    if (!vErr) {
      schemaFeatures.jobOverridesVersion = true;
    } else if (vErr.message.includes('version')) {
      console.log('[db] Optimistic-locking disabled — apply migration 002_concurrency_safety.sql to enable');
    }

    // reconciliation_queue: probe only.
    const { error: rErr } = await supabase.from('reconciliation_queue').select('id').limit(1);
    if (!rErr) {
      schemaFeatures.reconciliationQueue = true;
    } else {
      console.log('[db] Reconciliation queue disabled — apply migration 002_concurrency_safety.sql to enable');
    }
  } catch (err) {
    console.warn('[db] Schema check failed:', err.message);
  }
}
ensureSchema();

/**
 * Get all overrides as a map keyed by job_id.
 * Cached briefly to absorb load spikes; busted on every override write.
 */
async function getAllOverrides() {
  if (!supabase) return {};
  return cache.cached('overrides:all', OVERRIDES_TTL_MS, async () => {
    const { data, error } = await supabase
      .from('job_overrides')
      .select('*');

    if (error) {
      console.error('[db] getAllOverrides error:', error.message);
      return {};
    }

    const map = {};
    for (const row of (data || [])) {
      map[row.job_id] = row;
    }
    return map;
  });
}

/**
 * Get overrides for a specific job.
 */
async function getOverrides(jobId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('job_overrides')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  if (error) {
    console.error('[db] getOverrides error:', error.message);
    return null;
  }
  return data;
}

/**
 * Custom error thrown by upsertOverrides when a versioned write loses a
 * conflict race. Routes translate this into an HTTP 409 carrying the
 * current row so the client can show the user what changed.
 */
class OverrideConflictError extends Error {
  constructor(message, current) {
    super(message);
    this.name = 'OverrideConflictError';
    this.code = 'OVERRIDE_CONFLICT';
    this.current = current;
  }
}

/**
 * Upsert overrides for a job. Only updates fields that are provided.
 *
 * Concurrency modes:
 *   - If `expectedVersion` is passed AND the `version` column exists, this
 *     performs an atomic UPDATE ... WHERE job_id=? AND version=expectedVersion
 *     and throws OverrideConflictError if no row matched. The version column
 *     is incremented on every successful write.
 *   - Otherwise (no expectedVersion, or column absent pre-migration), falls
 *     back to the legacy field-level last-write-wins upsert for backward
 *     compatibility.
 */
async function upsertOverrides(jobId, updatesInput, options = {}) {
  if (!supabase) return null;
  const {
    recruiter, follow_up, deadline, notes, coverage_needed,
    tr_reassigned, tr_assigned_at, called_shot, forty_eight_hr,
    status_changed_at, updated_by,
  } = updatesInput || {};
  const { expectedVersion } = options;

  const updates = { updated_at: new Date().toISOString() };
  if (recruiter !== undefined) updates.recruiter = recruiter;
  if (follow_up !== undefined) updates.follow_up = follow_up;
  if (deadline !== undefined) updates.deadline = deadline;
  if (notes !== undefined) updates.notes = notes;
  if (coverage_needed !== undefined) updates.coverage_needed = coverage_needed;
  if (tr_reassigned !== undefined) updates.tr_reassigned = tr_reassigned;
  if (tr_assigned_at !== undefined) updates.tr_assigned_at = tr_assigned_at;
  if (called_shot !== undefined) updates.called_shot = called_shot;
  if (forty_eight_hr !== undefined) updates.forty_eight_hr = forty_eight_hr;
  if (status_changed_at !== undefined) updates.status_changed_at = status_changed_at;
  if (updated_by) updates.updated_by = updated_by;

  const useVersionedPath = (
    expectedVersion !== undefined &&
    expectedVersion !== null &&
    schemaFeatures.jobOverridesVersion
  );

  if (useVersionedPath) {
    const nextVersion = Number(expectedVersion) + 1;
    // Atomic: only update if the version still matches what the client saw.
    const { data, error } = await supabase
      .from('job_overrides')
      .update({ ...updates, version: nextVersion })
      .eq('job_id', jobId)
      .eq('version', expectedVersion)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[db] upsertOverrides (versioned) error:', error.message);
      throw error;
    }

    if (!data) {
      // Two possibilities: (a) row doesn't exist yet — safe to insert fresh
      // with version 1; (b) row exists but version mismatched — conflict.
      const { data: current } = await supabase
        .from('job_overrides')
        .select('*')
        .eq('job_id', jobId)
        .maybeSingle();

      if (!current) {
        // First write for this job. Insert at version 1.
        const { data: inserted, error: insErr } = await supabase
          .from('job_overrides')
          .insert({ job_id: jobId, version: 1, ...updates })
          .select()
          .single();
        if (insErr) {
          // Could lose the race against another concurrent insert — surface
          // as conflict so the client retries with a fresh version.
          const { data: afterRace } = await supabase
            .from('job_overrides')
            .select('*')
            .eq('job_id', jobId)
            .maybeSingle();
          throw new OverrideConflictError(
            'Override was created by another user simultaneously',
            afterRace || null,
          );
        }
        cache.bust('overrides:all');
        return inserted;
      }

      throw new OverrideConflictError(
        'Override was modified by another user',
        current,
      );
    }

    cache.bust('overrides:all');
    return data;
  }

  // Legacy path: no optimistic locking. Field-level last-write-wins.
  const row = { job_id: jobId, ...updates };
  if (schemaFeatures.jobOverridesVersion) {
    // When the column exists but the caller didn't opt in, still bump so
    // a concurrent versioned writer can detect our write.
    row.version = (typeof expectedVersion === 'number' ? expectedVersion : 0) + 1;
  }
  const { data, error } = await supabase
    .from('job_overrides')
    .upsert(row, { onConflict: 'job_id' })
    .select()
    .single();

  if (error) {
    console.error('[db] upsertOverrides error:', error.message);
    return null;
  }
  cache.bust('overrides:all');
  return data;
}

/**
 * Enqueue a row for manual reconciliation after a Bullhorn/Supabase split-brain.
 * Returns the inserted row, or null if the queue table doesn't exist (pre-migration)
 * or the write itself failed. Never throws — this is best-effort auditing.
 */
async function enqueueReconciliation({ jobId, kind, attemptedPayload, errorMessage, createdBy }) {
  if (!supabase) return null;
  if (!schemaFeatures.reconciliationQueue) {
    console.warn(
      `[db] Reconciliation split-brain for job ${jobId} (${kind}) — queue table absent, ` +
      `logging only. Error: ${errorMessage}`,
    );
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('reconciliation_queue')
      .insert({
        job_id: jobId,
        kind,
        attempted_payload: attemptedPayload || null,
        error: errorMessage || null,
        created_by: createdBy || null,
      })
      .select()
      .single();
    if (error) {
      console.error('[db] enqueueReconciliation error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[db] enqueueReconciliation threw:', err.message);
    return null;
  }
}

async function listReconciliationQueue({ status = 'pending', limit = 100 } = {}) {
  if (!supabase || !schemaFeatures.reconciliationQueue) return [];
  const { data, error } = await supabase
    .from('reconciliation_queue')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[db] listReconciliationQueue error:', error.message);
    return [];
  }
  return data || [];
}

// --- Notes ---

async function getNotesForJob(jobId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('job_notes')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[db] getNotesForJob error:', error.message);
    return [];
  }
  return data || [];
}

async function addNote(jobId, comment, createdBy) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('job_notes')
    .insert({ job_id: jobId, comment, created_by: createdBy || '' })
    .select()
    .single();

  if (error) {
    console.error('[db] addNote error:', error.message);
    return null;
  }
  return data;
}

// --- Placement Checklist ---

async function getAllPlacementChecklist() {
  if (!supabase) return {};
  return cache.cached('placementChecklist:all', PLACEMENT_CHECKLIST_TTL_MS, async () => {
    const { data, error } = await supabase
      .from('placement_checklist')
      .select('*');

    if (error) {
      console.error('[db] getAllPlacementChecklist error:', error.message);
      return {};
    }

    const map = {};
    for (const row of (data || [])) {
      map[row.placement_id] = row;
    }
    return map;
  });
}

async function getPlacementChecklist(placementId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('placement_checklist')
    .select('*')
    .eq('placement_id', placementId)
    .maybeSingle();

  if (error) {
    console.error('[db] getPlacementChecklist error:', error.message);
    return null;
  }
  return data;
}

async function upsertPlacementChecklist(placementId, fields) {
  if (!supabase) return null;

  const ALLOWED = new Set([
    'ob_paperwork_complete', 'new_hire_filed',
    'healthcare_effective_date', 'healthcare_payroll_deduction_date',
    'enrolled_in_healthcare', 'added_to_payroll',
    'four01k_opt_in', 'four01k_forms_received', 'added_to_census',
    'background_drug_status',
  ]);

  const updates = { updated_at: new Date().toISOString() };
  for (const [key, val] of Object.entries(fields)) {
    if (ALLOWED.has(key) && val !== undefined) {
      updates[key] = val;
    }
  }
  if (fields.updated_by) updates.updated_by = fields.updated_by;

  const { data, error } = await supabase
    .from('placement_checklist')
    .upsert({
      placement_id: placementId,
      ...updates,
    }, { onConflict: 'placement_id' })
    .select()
    .single();

  if (error) {
    console.error('[db] upsertPlacementChecklist error:', error.message);
    return null;
  }
  cache.bust('placementChecklist:all');
  return data;
}

// =============================================
// Org Flow — user_profiles
// =============================================

async function getUserByEmail(email) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (error) { console.error('[db] getUserByEmail error:', error.message); return null; }
  return data;
}

async function getActiveUsers() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { nullsFirst: false });
  if (error) { console.error('[db] getActiveUsers error:', error.message); return []; }
  return data || [];
}

// =============================================
// Org Flow — clients
// =============================================

async function getClients(userId) {
  if (!supabase) return [];

  let query = supabase
    .from('clients')
    .select('*, account_manager:user_profiles!created_by(email, full_name)')
    .not('name', 'ilike', 'Imported Contacts%');

  if (userId) {
    const { data: assignments } = await supabase
      .from('client_assignments')
      .select('client_id')
      .eq('user_id', userId);

    const assignedClientIds = assignments?.map(a => a.client_id) || [];

    if (assignedClientIds.length > 0) {
      query = query.or(`created_by.eq.${userId},id.in.(${assignedClientIds.join(',')})`);
    } else {
      query = query.eq('created_by', userId);
    }
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) { console.error('[db] getClients error:', error.message); return []; }
  return data || [];
}

async function getClientById(clientId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();
  if (error) { console.error('[db] getClientById error:', error.message); return null; }
  return data;
}

// Unfiltered fetch of every client row — used by the Bullhorn sync job to
// dedupe across the whole table regardless of which user owns each row.
// Do NOT expose this through user-facing endpoints; use getClients(userId).
async function getAllClients() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, bullhorn_client_id, created_by');
  if (error) { console.error('[db] getAllClients error:', error.message); return []; }
  return data || [];
}

// Org Flow clients that have been linked to a Bullhorn ClientCorporation —
// the input set for the contact sync (we only pull contacts for clients we
// can map back to a Supabase row).
async function getAllClientsLinkedToBullhorn() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('clients')
    .select('id, bullhorn_client_id')
    .not('bullhorn_client_id', 'is', null);
  if (error) { console.error('[db] getAllClientsLinkedToBullhorn error:', error.message); return []; }
  return data || [];
}

async function createClient(name, createdBy) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('clients')
    .insert([{ name, created_by: createdBy }])
    .select()
    .single();
  if (error) { console.error('[db] createClient error:', error.message); throw error; }
  return data;
}

async function updateClient(clientId, fields) {
  if (!supabase) return null;
  const ALLOWED = new Set(['name', 'created_by', 'logo_url', 'account_manager', 'bullhorn_client_id', 'status']);
  const updates = {};
  for (const [key, val] of Object.entries(fields)) {
    if (ALLOWED.has(key)) updates[key] = val;
  }
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', clientId)
    .select()
    .single();
  if (error) { console.error('[db] updateClient error:', error.message); throw error; }
  return data;
}

async function deleteClient(clientId) {
  if (!supabase) return;
  const { error } = await supabase.from('clients').delete().eq('id', clientId);
  if (error) { console.error('[db] deleteClient error:', error.message); throw error; }
}

async function bulkImportClients(clientsToInsert, clientsToUpdate) {
  if (!supabase) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;

  if (clientsToInsert.length > 0) {
    const { error } = await supabase.from('clients').insert(clientsToInsert);
    if (error) throw error;
    inserted = clientsToInsert.length;
  }

  for (const client of clientsToUpdate) {
    const { error } = await supabase
      .from('clients')
      .update({ name: client.name, created_by: client.created_by, account_manager: client.account_manager })
      .eq('id', client.id);
    if (error) {
      console.error(`[db] bulkImportClients update error for ${client.name}:`, error.message);
    } else {
      updated++;
    }
  }

  return { inserted, updated };
}

// Bulk apply the result of a Bullhorn sync run. Each update row carries
// only the fields the sync wants to change ({ id, name?, bullhorn_client_id?, created_by? }),
// so we don't clobber unrelated columns like logo_url or account_manager.
// `linked` counts updates that set a previously-NULL bullhorn_client_id —
// the backfill path, useful telemetry for the first run.
async function bulkSyncBullhornClients(toInsert, toUpdate) {
  if (!supabase) return { inserted: 0, linked: 0, updated: 0 };

  let inserted = 0;
  let linked = 0;
  let updated = 0;

  if (toInsert.length > 0) {
    const { error } = await supabase.from('clients').insert(toInsert);
    if (error) throw error;
    inserted = toInsert.length;
  }

  // Parallelize updates within chunks. Sequential awaits across thousands
  // of rows take minutes (Supabase round-trip is 50–100ms each); chunked
  // parallel calls finish well within the HTTP request window.
  const CHUNK = 50;
  let columnMissingError = null;

  for (let i = 0; i < toUpdate.length && !columnMissingError; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(async (row) => {
      const updates = {};
      if (row.name !== undefined) updates.name = row.name;
      if (row.bullhorn_client_id !== undefined) updates.bullhorn_client_id = row.bullhorn_client_id;
      if (row.created_by !== undefined) updates.created_by = row.created_by;
      if (row.status !== undefined) updates.status = row.status;
      if (Object.keys(updates).length === 0) return null;

      const { error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', row.id);
      if (error) {
        console.error(`[db] bulkSyncBullhornClients update error for client ${row.id}:`, error.message);
        return { error };
      }
      return { row };
    }));
    for (const r of results) {
      if (!r) continue;
      if (r.error) {
        // Surface the specific "missing column" case so the route handler
        // can return an actionable message instead of generic 500.
        if (r.error.message && /column .*status.*schema cache/i.test(r.error.message)) {
          columnMissingError = r.error;
        }
        continue;
      }
      if (r.row._wasUnlinked) linked++;
      else updated++;
    }
  }

  if (columnMissingError) {
    const err = new Error("Could not find the 'status' column of 'clients' in the schema cache");
    err.code = 'STATUS_COLUMN_MISSING';
    throw err;
  }

  return { inserted, linked, updated };
}

async function getSyncState(key) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('sync_state')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  if (error) { console.error('[db] getSyncState error:', error.message); return null; }
  return data;
}

async function upsertSyncState(key, fields) {
  if (!supabase) return null;
  const row = { key, ...fields, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('sync_state')
    .upsert(row, { onConflict: 'key' })
    .select()
    .single();
  if (error) { console.error('[db] upsertSyncState error:', error.message); return null; }
  return data;
}

// =============================================
// Org Flow — employees
// =============================================

async function getEmployeesByClient(clientId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('client_id', clientId)
    .not('name', 'ilike', 'Default Contact%');
  if (error) { console.error('[db] getEmployeesByClient error:', error.message); return []; }
  return data || [];
}

// Bulk dedupe-source for the Bullhorn contact sync. Pulls just the columns
// the sync needs to decide insert-vs-skip across many clients in one query.
async function getEmployeesForClientIds(clientIds) {
  if (!supabase || !clientIds?.length) return [];
  const { data, error } = await supabase
    .from('employees')
    .select('id, client_id, email, bullhorn_contact_id')
    .in('client_id', clientIds);
  if (error) { console.error('[db] getEmployeesForClientIds error:', error.message); return []; }
  return data || [];
}

// Single bulk insert for the contact sync. Each row is { client_id, name,
// email, bullhorn_contact_id, ... }. No upsert path — the sync only inserts
// rows that passed dedupe upstream.
async function bulkInsertEmployees(rows) {
  if (!supabase || !rows?.length) return { inserted: 0 };
  const { error } = await supabase.from('employees').insert(rows);
  if (error) throw error;
  return { inserted: rows.length };
}

async function createEmployee(fields) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('employees')
    .insert([fields])
    .select()
    .single();
  if (error) { console.error('[db] createEmployee error:', error.message); throw error; }
  return data;
}

async function updateEmployee(employeeId, fields) {
  if (!supabase) return null;
  const ALLOWED = new Set([
    'name', 'role', 'department', 'email', 'phone',
    'reports_to_id', 'num_ftes', 'num_contractors', 'num_apt_contractors',
    'position_x', 'position_y', 'updated_at', 'bullhorn_contact_id',
  ]);
  const updates = {};
  for (const [key, val] of Object.entries(fields)) {
    if (ALLOWED.has(key)) updates[key] = val;
  }
  const { data, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', employeeId)
    .select()
    .single();
  if (error) { console.error('[db] updateEmployee error:', error.message); throw error; }
  return data;
}

async function deleteEmployee(employeeId, allEmployees) {
  if (!supabase) return;

  // Find the employee to get their manager
  const { data: emp } = await supabase.from('employees').select('reports_to_id').eq('id', employeeId).maybeSingle();

  // Reassign direct reports to the deleted employee's manager
  const directReports = (allEmployees || []).filter(e => e.reports_to_id === employeeId);
  if (directReports.length > 0) {
    await supabase
      .from('employees')
      .update({ reports_to_id: emp?.reports_to_id || null })
      .in('id', directReports.map(e => e.id));
  }

  const { error } = await supabase.from('employees').delete().eq('id', employeeId);
  if (error) { console.error('[db] deleteEmployee error:', error.message); throw error; }
}

async function bulkDeleteEmployees(ids, allEmployees) {
  if (!supabase) return;

  // For each employee being deleted, reassign their direct reports
  for (const id of ids) {
    const employee = allEmployees.find(e => e.id === id);
    if (!employee) continue;

    const directReports = allEmployees.filter(e => e.reports_to_id === employee.id);
    if (directReports.length > 0) {
      await supabase
        .from('employees')
        .update({ reports_to_id: employee.reports_to_id || null })
        .in('id', directReports.map(e => e.id));
    }
  }

  const { error } = await supabase.from('employees').delete().in('id', ids);
  if (error) { console.error('[db] bulkDeleteEmployees error:', error.message); throw error; }
}

async function updateEmployeePositions(updates) {
  if (!supabase) return;
  for (const u of updates) {
    await supabase
      .from('employees')
      .update({ position_x: u.position_x, position_y: u.position_y })
      .eq('id', u.id);
  }
}

async function resetEmployeePositions(clientId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('employees')
    .update({ position_x: 0, position_y: 0 })
    .eq('client_id', clientId);
  if (error) { console.error('[db] resetEmployeePositions error:', error.message); throw error; }
}

async function bulkImportEmployees(clientId, toInsert, toUpdate, validRows) {
  if (!supabase) return { processedCount: 0, relationshipsUpdated: 0, warnings: [] };

  let processedCount = 0;
  const warnings = [];

  // Update existing employees
  for (const emp of toUpdate) {
    const { error } = await supabase
      .from('employees')
      .update({
        name: emp.name, email: emp.email, role: emp.role,
        department: emp.department, phone: emp.phone,
        num_contractors: emp.num_contractors, num_apt_contractors: emp.num_apt_contractors,
      })
      .eq('id', emp.id);
    if (!error) processedCount++;
  }

  // Insert new employees
  if (toInsert.length > 0) {
    const { data: insertedEmployees, error: insertError } = await supabase
      .from('employees')
      .insert(toInsert)
      .select();
    if (insertError) throw insertError;
    processedCount += insertedEmployees?.length || 0;
  }

  // Re-fetch all employees to build ID maps
  const { data: allEmployees, error: fetchError } = await supabase
    .from('employees')
    .select('*')
    .eq('client_id', clientId);
  if (fetchError) throw fetchError;

  const emailToDbId = new Map();
  const nameToDbId = new Map();
  (allEmployees || []).forEach(emp => {
    if (emp.email?.trim()) emailToDbId.set(emp.email.trim().toLowerCase(), emp.id);
    if (emp.name?.trim()) nameToDbId.set(emp.name.trim().toLowerCase(), emp.id);
  });

  // Second pass: update reporting relationships
  let relationshipsUpdated = 0;
  for (const row of validRows) {
    const reportsToField = row.ReportsToEmail || row.reportToEmail || row.ReportsTo || '';
    if (!reportsToField?.trim()) continue;

    const reportsToValue = reportsToField.trim();
    const reportsToLower = reportsToValue.toLowerCase();

    const employeeEmail = row.Email?.trim().toLowerCase() || '';
    const employeeName = row.Name?.trim().toLowerCase() || '';

    let employeeId = employeeEmail ? emailToDbId.get(employeeEmail) : null;
    if (!employeeId && employeeName) employeeId = nameToDbId.get(employeeName);

    if (!employeeId) {
      warnings.push(`Row ${row.rowNumber}: Could not find employee "${row.Name}" in database`);
      continue;
    }

    let managerId = null;
    if (reportsToValue.includes('@')) {
      managerId = emailToDbId.get(reportsToLower);
    } else {
      managerId = nameToDbId.get(reportsToLower);
      if (!managerId) managerId = emailToDbId.get(reportsToLower);
    }

    if (!managerId) {
      warnings.push(`Row ${row.rowNumber}: Manager "${reportsToValue}" not found in import data`);
      continue;
    }

    if (employeeId && managerId && employeeId !== managerId) {
      const { error: updateError } = await supabase
        .from('employees')
        .update({ reports_to_id: managerId })
        .eq('id', employeeId);
      if (!updateError) relationshipsUpdated++;
    }
  }

  return { processedCount, relationshipsUpdated, warnings };
}

// =============================================
// Org Flow — client_assignments
// =============================================

async function getAssignments(clientId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('client_assignments')
    .select('*, user_profiles(email, full_name)')
    .eq('client_id', clientId);
  if (error) { console.error('[db] getAssignments error:', error.message); return []; }
  return data || [];
}

async function createAssignment(clientId, userId, assignedBy) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('client_assignments')
    .insert([{ client_id: clientId, user_id: userId, assigned_by: assignedBy }])
    .select()
    .single();
  if (error) { console.error('[db] createAssignment error:', error.message); throw error; }
  return data;
}

async function deleteAssignment(assignmentId) {
  if (!supabase) return;
  const { error } = await supabase.from('client_assignments').delete().eq('id', assignmentId);
  if (error) { console.error('[db] deleteAssignment error:', error.message); throw error; }
}

// =============================================
// Org Flow — Supabase Storage (client-logos)
// =============================================

async function uploadClientLogo(clientId, fileBuffer, fileName, mimeType) {
  if (!supabase) return null;

  // Get current logo URL to remove old file
  const client = await getClientById(clientId);
  if (client?.logo_url) {
    const oldPath = client.logo_url.split('/').pop();
    if (oldPath) {
      await supabase.storage.from('client-logos').remove([`${clientId}/${oldPath}`]);
    }
  }

  const fileExt = fileName.split('.').pop();
  const newFileName = `${Date.now()}.${fileExt}`;
  const filePath = `${clientId}/${newFileName}`;

  const { error: uploadError } = await supabase.storage
    .from('client-logos')
    .upload(filePath, fileBuffer, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('client-logos')
    .getPublicUrl(filePath);

  await updateClient(clientId, { logo_url: publicUrl });
  return publicUrl;
}

// =============================================
// Support — Supabase ping
// =============================================

async function pingSupabase() {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('job_overrides').select('job_id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

// =============================================
// Support — Tickets
// =============================================

async function createSupportTicket({ category, tool, title, description, screenshot_url, submitted_by, submitted_by_name }) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({ category, tool: tool || null, title, description, screenshot_url, submitted_by, submitted_by_name })
    .select()
    .single();
  if (error) { console.error('[db] createSupportTicket error:', error.message); throw error; }
  return data;
}

async function getSupportTickets({ submittedBy }) {
  if (!supabase) return [];

  // Auto-close resolved tickets older than 72 hours
  await autoCloseResolvedTickets();

  let query = supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (submittedBy) {
    query = query.eq('submitted_by', submittedBy);
  }
  const { data, error } = await query;
  if (error) { console.error('[db] getSupportTickets error:', error.message); return []; }
  return data || [];
}

async function autoCloseResolvedTickets() {
  if (!supabase) return;
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('support_tickets')
    .update({ status: 'closed', updated_at: new Date().toISOString(), updated_by: 'system' })
    .eq('status', 'resolved')
    .lt('resolved_at', cutoff);
  if (error) console.error('[db] autoCloseResolvedTickets error:', error.message);
}

async function updateSupportTicket(id, { status, admin_notes, updated_by }) {
  if (!supabase) return null;
  const updates = { updated_at: new Date().toISOString() };
  if (status) {
    updates.status = status;
    if (status === 'resolved') updates.resolved_at = new Date().toISOString();
  }
  if (admin_notes !== undefined) updates.admin_notes = admin_notes;
  if (updated_by) updates.updated_by = updated_by;

  const { data, error } = await supabase
    .from('support_tickets')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) { console.error('[db] updateSupportTicket error:', error.message); throw error; }
  return data;
}

async function getSupportTicketById(id) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) { console.error('[db] getSupportTicketById error:', error.message); return null; }
  return data;
}

// =============================================
// Support — Ticket Comments (thread)
// =============================================

async function getTicketComments(ticketId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('support_ticket_comments')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) { console.error('[db] getTicketComments error:', error.message); return []; }
  return data || [];
}

async function addTicketComment({ ticketId, authorEmail, authorName, comment }) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('support_ticket_comments')
    .insert({
      ticket_id: ticketId,
      author_email: authorEmail,
      author_name: authorName,
      comment,
    })
    .select()
    .single();
  if (error) { console.error('[db] addTicketComment error:', error.message); throw error; }
  // Bump the parent ticket's updated_at so "latest activity" reflects the new comment
  await supabase
    .from('support_tickets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', ticketId);
  return data;
}

async function markTicketViewed({ ticketId, userEmail }) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('ticket_read_state')
    .upsert(
      { user_email: userEmail, ticket_id: ticketId, last_viewed_at: new Date().toISOString() },
      { onConflict: 'user_email,ticket_id' },
    )
    .select()
    .single();
  if (error) { console.error('[db] markTicketViewed error:', error.message); throw error; }
  return data;
}

/**
 * Returns unread counts for a user:
 *   - my_tickets: tickets they submitted with unseen activity from someone else
 *   - my_queue:   tickets assigned to them that are either never-viewed OR
 *                 have unseen comments from someone else
 *
 * "Unseen activity" = a comment authored by someone else with created_at > last_viewed_at
 * "Never viewed"    = no ticket_read_state row for (user, ticket) AND ticket exists
 */
async function getUnreadCounts(userEmail) {
  if (!supabase) return { my_tickets: 0, my_queue: 0 };

  // Load tickets where user is submitter or assignee
  const { data: tickets, error: tErr } = await supabase
    .from('support_tickets')
    .select('id, submitted_by, assigned_to, updated_at, created_at')
    .or(`submitted_by.eq.${userEmail},assigned_to.eq.${userEmail}`);
  if (tErr) { console.error('[db] getUnreadCounts tickets:', tErr.message); return { my_tickets: 0, my_queue: 0 }; }
  if (!tickets || tickets.length === 0) return { my_tickets: 0, my_queue: 0 };

  const ticketIds = tickets.map(t => t.id);

  // Load comments not authored by me
  const { data: comments, error: cErr } = await supabase
    .from('support_ticket_comments')
    .select('ticket_id, author_email, created_at')
    .in('ticket_id', ticketIds)
    .neq('author_email', userEmail);
  if (cErr) { console.error('[db] getUnreadCounts comments:', cErr.message); return { my_tickets: 0, my_queue: 0 }; }

  // Load my read state
  const { data: reads, error: rErr } = await supabase
    .from('ticket_read_state')
    .select('ticket_id, last_viewed_at')
    .eq('user_email', userEmail)
    .in('ticket_id', ticketIds);
  if (rErr) { console.error('[db] getUnreadCounts reads:', rErr.message); return { my_tickets: 0, my_queue: 0 }; }

  const lastViewedByTicket = {};
  for (const r of (reads || [])) lastViewedByTicket[r.ticket_id] = new Date(r.last_viewed_at).getTime();

  const latestExternalCommentByTicket = {};
  for (const c of (comments || [])) {
    const ts = new Date(c.created_at).getTime();
    if (!latestExternalCommentByTicket[c.ticket_id] || ts > latestExternalCommentByTicket[c.ticket_id]) {
      latestExternalCommentByTicket[c.ticket_id] = ts;
    }
  }

  let myTicketsUnread = 0;
  let myQueueUnread = 0;

  for (const t of tickets) {
    const lastViewed = lastViewedByTicket[t.id] ?? 0;
    const latestComment = latestExternalCommentByTicket[t.id] ?? 0;
    const hasUnreadComment = latestComment > lastViewed;
    const neverViewed = !(t.id in lastViewedByTicket);

    if (t.submitted_by === userEmail && hasUnreadComment) {
      myTicketsUnread += 1;
    }
    if (t.assigned_to === userEmail && (neverViewed || hasUnreadComment)) {
      myQueueUnread += 1;
    }
  }

  return { my_tickets: myTicketsUnread, my_queue: myQueueUnread };
}

async function updateTicketAssignee(id, { assigned_to, assigned_to_name, updated_by }) {
  if (!supabase) return null;
  const updates = {
    assigned_to: assigned_to || null,
    assigned_to_name: assigned_to_name || null,
    updated_at: new Date().toISOString(),
  };
  if (updated_by) updates.updated_by = updated_by;

  const { data, error } = await supabase
    .from('support_tickets')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) { console.error('[db] updateTicketAssignee error:', error.message); throw error; }
  return data;
}

async function uploadSupportScreenshot(fileBuffer, fileName, mimeType) {
  if (!supabase) return null;
  const fileExt = fileName.split('.').pop();
  const newFileName = `${Date.now()}.${fileExt}`;
  const filePath = `tickets/${newFileName}`;

  const { error: uploadError } = await supabase.storage
    .from('support-screenshots')
    .upload(filePath, fileBuffer, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('support-screenshots')
    .getPublicUrl(filePath);

  return publicUrl;
}

// =============================================
// Support — Known Issues
// =============================================

async function getKnownIssues(statusFilter) {
  if (!supabase) return [];
  let query = supabase
    .from('known_issues')
    .select('*')
    .order('created_at', { ascending: false });
  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }
  const { data, error } = await query;
  if (error) { console.error('[db] getKnownIssues error:', error.message); return []; }
  return data || [];
}

async function createKnownIssue({ title, description, severity, created_by }) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('known_issues')
    .insert({ title, description, severity, created_by })
    .select()
    .single();
  if (error) { console.error('[db] createKnownIssue error:', error.message); throw error; }
  return data;
}

async function updateKnownIssue(id, updates) {
  if (!supabase) return null;
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('known_issues')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) { console.error('[db] updateKnownIssue error:', error.message); throw error; }
  return data;
}

async function removeClientLogo(clientId) {
  if (!supabase) return;

  const client = await getClientById(clientId);
  if (client?.logo_url) {
    const oldPath = client.logo_url.split('/').pop();
    if (oldPath) {
      await supabase.storage.from('client-logos').remove([`${clientId}/${oldPath}`]);
    }
  }

  await updateClient(clientId, { logo_url: null });
}

// =============================================
// Goal Tracking
// =============================================

const GOAL_UPDATABLE = new Set([
  'name', 'description', 'goal_type', 'owner_email', 'owner_name',
  'rollup_method', 'start_value', 'current_value', 'target_value', 'unit',
  'status_mode', 'status_override', 'is_company_priority',
  'weight', 'sort_order', 'parent_id', 'period',
]);
const TASK_UPDATABLE = new Set(['title', 'assignee_email', 'assignee_name', 'due_date', 'sort_order']);

function clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

async function computeGoalProgress(goalId) {
  if (!supabase) return 0;
  const { data: goal } = await supabase
    .from('goals')
    .select('id, goal_type, start_value, current_value, target_value')
    .eq('id', goalId)
    .maybeSingle();
  if (!goal) return 0;

  if (goal.goal_type === 'number') {
    const s = Number(goal.start_value ?? 0);
    const c = Number(goal.current_value ?? s);
    const t = Number(goal.target_value ?? s);
    if (t === s) return c >= t ? 100 : 0;
    return clampPct(((c - s) / (t - s)) * 100);
  }

  if (goal.goal_type === 'task') {
    const { data: tasks } = await supabase
      .from('goal_tasks').select('completed').eq('goal_id', goalId);
    if (!tasks || tasks.length === 0) return 0;
    const done = tasks.filter(t => t.completed).length;
    return clampPct((done / tasks.length) * 100);
  }

  if (goal.goal_type === 'rollup') {
    const { data: children } = await supabase
      .from('goals')
      .select('id')
      .eq('parent_id', goalId)
      .is('archived_at', null);
    if (!children || children.length === 0) return 0;
    const pcts = await Promise.all(children.map(c => computeGoalProgress(c.id)));
    return clampPct(pcts.reduce((s, p) => s + p, 0) / pcts.length);
  }

  return 0;
}

async function cascadeCheckinToAncestors(goalId, createdBy) {
  if (!supabase) return;
  const { data: goal } = await supabase
    .from('goals').select('parent_id').eq('id', goalId).maybeSingle();
  if (!goal?.parent_id) return;
  const parentPct = await computeGoalProgress(goal.parent_id);
  await supabase.from('goal_checkins').insert({
    goal_id: goal.parent_id,
    progress_pct: parentPct,
    source: 'rollup',
    created_by: createdBy || 'system',
  });
  await cascadeCheckinToAncestors(goal.parent_id, createdBy);
}

async function listGoals(period) {
  if (!supabase) return { goals: [], tasks: [] };
  const { data: goals, error } = await supabase
    .from('goals')
    .select('*')
    .eq('period', period)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) { console.error('[db] listGoals error:', error.message); return { goals: [], tasks: [] }; }
  const goalIds = (goals || []).map(g => g.id);
  let tasks = [];
  if (goalIds.length > 0) {
    const { data } = await supabase
      .from('goal_tasks').select('*').in('goal_id', goalIds)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    tasks = data || [];
  }
  const withProgress = await Promise.all((goals || []).map(async g => ({
    ...g,
    live_progress_pct: await computeGoalProgress(g.id),
  })));
  return { goals: withProgress, tasks };
}

async function listArchivedGoals(period) {
  if (!supabase) return { goals: [], tasks: [] };
  const { data: goals, error } = await supabase
    .from('goals')
    .select('*')
    .eq('period', period)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });
  if (error) { console.error('[db] listArchivedGoals error:', error.message); return { goals: [], tasks: [] }; }
  const goalIds = (goals || []).map(g => g.id);
  let tasks = [];
  if (goalIds.length > 0) {
    const { data } = await supabase
      .from('goal_tasks').select('*').in('goal_id', goalIds);
    tasks = data || [];
  }
  return { goals: goals || [], tasks };
}

async function countArchivedGoals(period) {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('goals')
    .select('id', { count: 'exact', head: true })
    .eq('period', period)
    .not('archived_at', 'is', null);
  if (error) { console.error('[db] countArchivedGoals error:', error.message); return 0; }
  return count || 0;
}

async function getGoal(id) {
  if (!supabase) return null;
  const { data: goal, error } = await supabase
    .from('goals').select('*').eq('id', id).maybeSingle();
  if (error) { console.error('[db] getGoal error:', error.message); return null; }
  if (!goal) return null;
  const [{ data: children }, { data: tasks }, { data: checkins }] = await Promise.all([
    supabase.from('goals').select('*').eq('parent_id', id).is('archived_at', null)
      .order('sort_order', { ascending: true }),
    supabase.from('goal_tasks').select('*').eq('goal_id', id)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('goal_checkins').select('*').eq('goal_id', id)
      .order('created_at', { ascending: true }),
  ]);
  const live_progress_pct = await computeGoalProgress(id);
  return {
    goal: { ...goal, live_progress_pct },
    children: children || [],
    tasks: tasks || [],
    checkins: checkins || [],
  };
}

async function createGoal(fields) {
  if (!supabase) return null;
  const row = {};
  for (const [k, v] of Object.entries(fields)) {
    if (GOAL_UPDATABLE.has(k) || k === 'created_by') row[k] = v;
  }
  const { data, error } = await supabase.from('goals').insert(row).select().single();
  if (error) { console.error('[db] createGoal error:', error.message); throw error; }
  return data;
}

async function updateGoal(id, fields) {
  if (!supabase) return null;
  const updates = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    if (GOAL_UPDATABLE.has(k)) updates[k] = v;
  }
  const { data, error } = await supabase
    .from('goals').update(updates).eq('id', id).select().single();
  if (error) { console.error('[db] updateGoal error:', error.message); throw error; }
  return data;
}

async function archiveGoal(id) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('goals')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) { console.error('[db] archiveGoal error:', error.message); throw error; }
  return data;
}

async function reorderGoals(ordering) {
  if (!supabase) return;
  for (const item of ordering) {
    await supabase.from('goals')
      .update({ sort_order: item.sort_order, parent_id: item.parent_id ?? null })
      .eq('id', item.id);
  }
}

async function insertCheckin(goalId, { value, note, status, source, createdBy }) {
  if (!supabase) return null;
  const progress_pct = await computeGoalProgress(goalId);
  const { data, error } = await supabase.from('goal_checkins').insert({
    goal_id: goalId,
    progress_pct,
    value: value ?? null,
    note: note || null,
    status: status || null,
    source: source || 'manual',
    created_by: createdBy || 'system',
  }).select().single();
  if (error) { console.error('[db] insertCheckin error:', error.message); throw error; }
  await cascadeCheckinToAncestors(goalId, createdBy);
  return data;
}

async function listCheckins(goalId, { from, to } = {}) {
  if (!supabase) return [];
  let query = supabase.from('goal_checkins').select('*').eq('goal_id', goalId)
    .order('created_at', { ascending: true });
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  const { data, error } = await query;
  if (error) { console.error('[db] listCheckins error:', error.message); return []; }
  return data || [];
}

async function listTasksForGoal(goalId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('goal_tasks').select('*').eq('goal_id', goalId)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error) { console.error('[db] listTasksForGoal error:', error.message); return []; }
  return data || [];
}

async function createTask(goalId, fields) {
  if (!supabase) return null;
  const row = { goal_id: goalId, created_by: fields.created_by || null };
  for (const [k, v] of Object.entries(fields)) {
    if (TASK_UPDATABLE.has(k)) row[k] = v;
  }
  const { data, error } = await supabase.from('goal_tasks').insert(row).select().single();
  if (error) { console.error('[db] createTask error:', error.message); throw error; }
  return data;
}

async function updateTask(taskId, fields) {
  if (!supabase) return null;
  const updates = {};
  for (const [k, v] of Object.entries(fields)) {
    if (TASK_UPDATABLE.has(k)) updates[k] = v;
  }
  if (fields.completed !== undefined) {
    updates.completed = !!fields.completed;
    if (fields.completed) {
      updates.completed_at = new Date().toISOString();
      updates.completed_by = fields.completed_by || null;
    } else {
      updates.completed_at = null;
      updates.completed_by = null;
    }
  }
  const { data, error } = await supabase
    .from('goal_tasks').update(updates).eq('id', taskId).select().single();
  if (error) { console.error('[db] updateTask error:', error.message); throw error; }
  return data;
}

async function deleteTask(taskId) {
  if (!supabase) return;
  const { error } = await supabase.from('goal_tasks').delete().eq('id', taskId);
  if (error) { console.error('[db] deleteTask error:', error.message); throw error; }
}

async function pinPriority(userEmail, goalId) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('goal_priorities')
    .upsert({ user_email: userEmail, goal_id: goalId }, { onConflict: 'user_email,goal_id' })
    .select().single();
  if (error) { console.error('[db] pinPriority error:', error.message); throw error; }
  return data;
}

async function unpinPriority(userEmail, goalId) {
  if (!supabase) return;
  const { error } = await supabase.from('goal_priorities').delete()
    .eq('user_email', userEmail).eq('goal_id', goalId);
  if (error) { console.error('[db] unpinPriority error:', error.message); throw error; }
}

async function listGoalTasksForUser(email) {
  if (!supabase || !email) return [];
  const lower = email.toLowerCase();
  const { data, error } = await supabase
    .from('goal_tasks')
    .select('id, title, due_date, completed, goal_id, goals!inner(name, period, archived_at)')
    .eq('assignee_email', lower)
    .eq('completed', false)
    .not('due_date', 'is', null);
  if (error) { console.error('[db] listGoalTasksForUser:', error.message); return []; }
  return (data || []).filter(r => !r.goals?.archived_at);
}

async function listMyPriorityIds(userEmail, period) {
  if (!supabase) return [];
  let query = supabase
    .from('goal_priorities')
    .select('goal_id, goals!inner(period, archived_at)')
    .eq('user_email', userEmail);
  if (period) query = query.eq('goals.period', period);
  const { data, error } = await query;
  if (error) { console.error('[db] listMyPriorityIds error:', error.message); return []; }
  return (data || [])
    .filter(r => !r.goals?.archived_at)
    .map(r => r.goal_id);
}

module.exports = {
  supabase, // Shared client — import this instead of creating your own
  getSchemaFeatures,
  OverrideConflictError,
  enqueueReconciliation, listReconciliationQueue,
  getAllOverrides, getOverrides, upsertOverrides, getNotesForJob, addNote,
  getAllPlacementChecklist, getPlacementChecklist, upsertPlacementChecklist,
  // Org Flow
  getUserByEmail, getActiveUsers,
  getClients, getClientById, getAllClients, getAllClientsLinkedToBullhorn,
  createClient, updateClient, deleteClient, bulkImportClients,
  bulkSyncBullhornClients, getSyncState, upsertSyncState,
  getEmployeesByClient, getEmployeesForClientIds, createEmployee, updateEmployee, deleteEmployee,
  bulkDeleteEmployees, bulkInsertEmployees, updateEmployeePositions, resetEmployeePositions, bulkImportEmployees,
  getAssignments, createAssignment, deleteAssignment,
  uploadClientLogo, removeClientLogo,
  // Support
  pingSupabase,
  createSupportTicket, getSupportTickets, getSupportTicketById, updateSupportTicket, uploadSupportScreenshot,
  getTicketComments, addTicketComment, updateTicketAssignee,
  markTicketViewed, getUnreadCounts,
  getKnownIssues, createKnownIssue, updateKnownIssue,
  // Goal Tracking
  computeGoalProgress,
  listGoals, listArchivedGoals, countArchivedGoals,
  getGoal, createGoal, updateGoal, archiveGoal, reorderGoals,
  insertCheckin, listCheckins,
  listTasksForGoal, createTask, updateTask, deleteTask,
  pinPriority, unpinPriority, listMyPriorityIds,
  listGoalTasksForUser,
};
