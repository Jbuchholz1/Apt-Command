const { createClient: createSupabaseClient } = require('@supabase/supabase-js');

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

// Auto-migrate: ensure status_changed_at column exists on job_overrides
async function ensureSchema() {
  if (!supabase) return;
  try {
    // Try reading the column — if it fails, add it via RPC or ignore gracefully
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
      }
    }
  } catch (err) {
    console.warn('[db] Schema check failed:', err.message);
  }
}
ensureSchema();

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
async function upsertOverrides(jobId, { recruiter, follow_up, deadline, notes, coverage_needed, tr_reassigned, tr_assigned_at, called_shot, forty_eight_hr, status_changed_at, updated_by }) {
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
  if (forty_eight_hr !== undefined) updates.forty_eight_hr = forty_eight_hr;
  if (status_changed_at !== undefined) updates.status_changed_at = status_changed_at;
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

// --- Placement Checklist ---

async function getAllPlacementChecklist() {
  if (!supabase) return {};
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
    .select('*, account_manager:user_profiles!created_by(email, full_name)');

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
  const ALLOWED = new Set(['name', 'created_by', 'logo_url', 'account_manager']);
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

// =============================================
// Org Flow — employees
// =============================================

async function getEmployeesByClient(clientId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('client_id', clientId);
  if (error) { console.error('[db] getEmployeesByClient error:', error.message); return []; }
  return data || [];
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
    'position_x', 'position_y', 'updated_at',
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

async function createSupportTicket({ category, title, description, screenshot_url, submitted_by, submitted_by_name }) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({ category, title, description, screenshot_url, submitted_by, submitted_by_name })
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

module.exports = {
  supabase, // Shared client — import this instead of creating your own
  getAllOverrides, getOverrides, upsertOverrides, getNotesForJob, addNote,
  getAllPlacementChecklist, getPlacementChecklist, upsertPlacementChecklist,
  // Org Flow
  getUserByEmail, getActiveUsers,
  getClients, getClientById, createClient, updateClient, deleteClient, bulkImportClients,
  getEmployeesByClient, createEmployee, updateEmployee, deleteEmployee,
  bulkDeleteEmployees, updateEmployeePositions, resetEmployeePositions, bulkImportEmployees,
  getAssignments, createAssignment, deleteAssignment,
  uploadClientLogo, removeClientLogo,
  // Support
  pingSupabase,
  createSupportTicket, getSupportTickets, getSupportTicketById, updateSupportTicket, uploadSupportScreenshot,
  getTicketComments, addTicketComment,
  getKnownIssues, createKnownIssue, updateKnownIssue,
};
