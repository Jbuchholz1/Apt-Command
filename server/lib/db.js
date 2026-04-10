const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[db] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — overrides/notes WILL NOT PERSIST');
  console.error('[db]   SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
  console.error('[db]   SUPABASE_SERVICE_KEY:', supabaseKey ? 'SET' : 'MISSING');
} else {
  console.log('[db] Supabase connected:', supabaseUrl);
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * Get all overrides as a map keyed by job_id.
 */
async function getAllOverrides() {
  if (!supabase) return {};
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
 * Upsert overrides for a job. Only updates fields that are provided.
 */
async function upsertOverrides(jobId, { recruiter, follow_up, deadline, notes, coverage_needed, tr_reassigned, tr_assigned_at, called_shot, updated_by }) {
  if (!supabase) return null;

  const updates = { updated_at: new Date().toISOString() };
  if (recruiter !== undefined) updates.recruiter = recruiter;
  if (follow_up !== undefined) updates.follow_up = follow_up;
  if (deadline !== undefined) updates.deadline = deadline;
  if (notes !== undefined) updates.notes = notes;
  if (coverage_needed !== undefined) updates.coverage_needed = coverage_needed;
  if (tr_reassigned !== undefined) updates.tr_reassigned = tr_reassigned;
  if (tr_assigned_at !== undefined) updates.tr_assigned_at = tr_assigned_at;
  if (called_shot !== undefined) updates.called_shot = called_shot;
  if (updated_by) updates.updated_by = updated_by;

  const { data, error } = await supabase
    .from('job_overrides')
    .upsert({
      job_id: jobId,
      ...updates,
    }, { onConflict: 'job_id' })
    .select()
    .single();

  if (error) {
    console.error('[db] upsertOverrides error:', error.message);
    return null;
  }
  return data;
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

module.exports = { getAllOverrides, getOverrides, upsertOverrides, getNotesForJob, addNote };
