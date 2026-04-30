// Project Management — Trello-style kanban for internal projects/tasks/deadlines.
//
// All routes require manager+ access (gated at the router level).
// Mutations support optimistic locking via If-Match (parses both '"3"' and '3').
// Position floats are computed server-side on /move so the client never has to
// reason about ordering math.

const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/db');
const { requireManager } = require('../middleware/adminAuth');

router.use(requireManager);

// Always revalidate — board state is mutation-heavy and stale renders confuse users.
router.use((req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'no-store');
  next();
});

// --- Helpers ---

function userEmail(req) {
  return (req.user?.email || '').toLowerCase().trim();
}

function userName(req) {
  return req.user?.name || req.user?.email || 'unknown';
}

function parseIfMatch(req) {
  const raw = req.header('If-Match');
  if (!raw || raw === '*') return undefined;
  const n = parseInt(raw.replace(/["W\/]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

function sanitize(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

// New position when inserting between two neighbors. Either may be null
// (head or tail). Caller is responsible for rebalancing on tight floats.
function computePosition(prevPos, nextPos) {
  if (prevPos == null && nextPos == null) return 1;
  if (prevPos == null) return nextPos - 1;
  if (nextPos == null) return prevPos + 1;
  return (prevPos + nextPos) / 2;
}

const TIGHT_POSITION_EPSILON = 1e-6;

async function rebalanceColumn(columnId) {
  const { data, error } = await supabase
    .from('pm_tasks')
    .select('id')
    .eq('column_id', columnId)
    .order('position', { ascending: true });
  if (error) throw error;
  let p = 1;
  for (const row of (data || [])) {
    await supabase.from('pm_tasks').update({ position: p }).eq('id', row.id);
    p += 1;
  }
}

function dbErr(res, err, fallback = 'Database error') {
  console.error('[pm]', err.message || err);
  return res.status(500).json({ error: fallback });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function badUuid(res, label) {
  return res.status(400).json({ error: `Invalid ${label} id` });
}

function ensureSupabase(res) {
  if (!supabase) {
    res.status(503).json({ error: 'Database not configured' });
    return false;
  }
  return true;
}

// --- Projects ---

// GET /api/project-management/projects
router.get('/projects', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const includeArchived = req.query.archived === 'true';
    let query = supabase
      .from('pm_projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (!includeArchived) query = query.is('archived_at', null);
    const { data, error } = await query;
    if (error) return dbErr(res, error);
    res.json({ data: data || [] });
  } catch (err) { next(err); }
});

// POST /api/project-management/projects
router.post('/projects', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const { name, description, color } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    const createdBy = userEmail(req) || userName(req);
    const { data: project, error } = await supabase
      .from('pm_projects')
      .insert({
        name: sanitize(name.trim()),
        description: sanitize(description) || null,
        color: color || null,
        created_by: createdBy,
        updated_by: createdBy,
      })
      .select()
      .single();
    if (error) return dbErr(res, error);

    // Seed default columns
    const defaults = [
      { name: 'To Do', position: 1 },
      { name: 'In Progress', position: 2 },
      { name: 'Done', position: 3 },
    ].map(c => ({ ...c, project_id: project.id }));
    const { data: columns, error: colErr } = await supabase
      .from('pm_columns')
      .insert(defaults)
      .select();
    if (colErr) return dbErr(res, colErr);

    res.json({ project, columns: columns || [] });
  } catch (err) { next(err); }
});

// GET /api/project-management/projects/:id — full board hydrate
router.get('/projects/:id', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const id = req.params.id;
    const [{ data: project, error: pErr }, { data: columns, error: cErr }, { data: tasks, error: tErr }] = await Promise.all([
      supabase.from('pm_projects').select('*').eq('id', id).maybeSingle(),
      supabase.from('pm_columns').select('*').eq('project_id', id).order('position', { ascending: true }),
      supabase.from('pm_tasks').select('*').eq('project_id', id).order('position', { ascending: true }),
    ]);
    if (pErr) return dbErr(res, pErr);
    if (cErr) return dbErr(res, cErr);
    if (tErr) return dbErr(res, tErr);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project, columns: columns || [], tasks: tasks || [] });
  } catch (err) { next(err); }
});

// PATCH /api/project-management/projects/:id
router.patch('/projects/:id', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const id = req.params.id;
    const { name, description, color } = req.body || {};
    const expectedVersion = parseIfMatch(req);

    const updates = { updated_at: new Date().toISOString(), updated_by: userEmail(req) || userName(req) };
    if (name !== undefined) updates.name = sanitize(name);
    if (description !== undefined) updates.description = sanitize(description);
    if (color !== undefined) updates.color = color;

    if (expectedVersion !== undefined) {
      updates.version = expectedVersion + 1;
      const { data, error } = await supabase
        .from('pm_projects')
        .update(updates)
        .eq('id', id)
        .eq('version', expectedVersion)
        .select()
        .maybeSingle();
      if (error) return dbErr(res, error);
      if (!data) {
        const { data: current } = await supabase.from('pm_projects').select('*').eq('id', id).maybeSingle();
        if (!current) return res.status(404).json({ error: 'Project not found' });
        return res.status(409).json({ error: 'Project was modified by another user', code: 'PM_CONFLICT', current });
      }
      return res.json({ data });
    }

    // Unversioned write — bump version anyway
    const { data: current } = await supabase.from('pm_projects').select('version').eq('id', id).maybeSingle();
    if (!current) return res.status(404).json({ error: 'Project not found' });
    updates.version = (current.version || 0) + 1;
    const { data, error } = await supabase.from('pm_projects').update(updates).eq('id', id).select().single();
    if (error) return dbErr(res, error);
    res.json({ data });
  } catch (err) { next(err); }
});

// DELETE /api/project-management/projects/:id — soft delete
router.delete('/projects/:id', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const { data, error } = await supabase
      .from('pm_projects')
      .update({
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: userEmail(req) || userName(req),
      })
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) return dbErr(res, error);
    if (!data) return res.status(404).json({ error: 'Project not found' });
    res.json({ data });
  } catch (err) { next(err); }
});

// POST /api/project-management/projects/:id/restore — un-archive
router.post('/projects/:id/restore', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const { data, error } = await supabase
      .from('pm_projects')
      .update({ archived_at: null, updated_at: new Date().toISOString(), updated_by: userEmail(req) || userName(req) })
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) return dbErr(res, error);
    if (!data) return res.status(404).json({ error: 'Project not found' });
    res.json({ data });
  } catch (err) { next(err); }
});

// --- Columns ---

// POST /api/project-management/projects/:id/columns
router.post('/projects/:id/columns', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const projectId = req.params.id;
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Column name is required' });

    const { data: last } = await supabase
      .from('pm_columns')
      .select('position')
      .eq('project_id', projectId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (last?.position || 0) + 1;

    const { data, error } = await supabase
      .from('pm_columns')
      .insert({ project_id: projectId, name: sanitize(name.trim()), position })
      .select()
      .single();
    if (error) return dbErr(res, error);
    res.json({ data });
  } catch (err) { next(err); }
});

// PATCH /api/project-management/columns/:id
router.patch('/columns/:id', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const { name, position } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = sanitize(name);
    if (position !== undefined) updates.position = Number(position);
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });
    const { data, error } = await supabase
      .from('pm_columns')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) return dbErr(res, error);
    if (!data) return res.status(404).json({ error: 'Column not found' });
    res.json({ data });
  } catch (err) { next(err); }
});

// DELETE /api/project-management/columns/:id (cascades tasks)
router.delete('/columns/:id', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const { error } = await supabase.from('pm_columns').delete().eq('id', req.params.id);
    if (error) return dbErr(res, error);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/project-management/projects/:id/columns/reorder
router.post('/projects/:id/columns/reorder', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });
    let p = 1;
    for (const id of orderedIds) {
      await supabase.from('pm_columns').update({ position: p }).eq('id', id).eq('project_id', req.params.id);
      p += 1;
    }
    const { data } = await supabase
      .from('pm_columns')
      .select('*')
      .eq('project_id', req.params.id)
      .order('position', { ascending: true });
    res.json({ data: data || [] });
  } catch (err) { next(err); }
});

// --- Tasks ---

// POST /api/project-management/projects/:id/tasks
router.post('/projects/:id/tasks', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const projectId = req.params.id;
    const {
      columnId, title, description, assignee_email, assignee_name,
      due_date, priority, labels, checklist,
    } = req.body || {};
    if (!columnId) return res.status(400).json({ error: 'columnId is required' });
    if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required' });

    const { data: last } = await supabase
      .from('pm_tasks')
      .select('position')
      .eq('column_id', columnId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (last?.position || 0) + 1;

    const createdBy = userEmail(req) || userName(req);
    const row = {
      project_id: projectId,
      column_id: columnId,
      title: sanitize(title.trim()),
      description: sanitize(description) || null,
      assignee_email: assignee_email || null,
      assignee_name: assignee_name || null,
      due_date: due_date || null,
      priority: priority || null,
      labels: Array.isArray(labels) ? labels : [],
      checklist: Array.isArray(checklist) ? checklist : [],
      position,
      created_by: createdBy,
      updated_by: createdBy,
    };

    // If column is "Done", auto-set completed_at
    const { data: col } = await supabase.from('pm_columns').select('name').eq('id', columnId).maybeSingle();
    if (col && /^done$/i.test((col.name || '').trim())) row.completed_at = new Date().toISOString();

    const { data, error } = await supabase.from('pm_tasks').insert(row).select().single();
    if (error) return dbErr(res, error);
    res.json({ data });
  } catch (err) { next(err); }
});

// PATCH /api/project-management/tasks/:id
router.patch('/tasks/:id', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const id = req.params.id;
    const expectedVersion = parseIfMatch(req);
    const fields = req.body || {};

    const ALLOWED = new Set([
      'title', 'description', 'assignee_email', 'assignee_name',
      'due_date', 'priority', 'labels', 'checklist',
    ]);
    const updates = { updated_at: new Date().toISOString(), updated_by: userEmail(req) || userName(req) };
    for (const [k, v] of Object.entries(fields)) {
      if (!ALLOWED.has(k)) continue;
      if (k === 'title' && (!v || !String(v).trim())) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      if (k === 'priority' && v && !['low', 'normal', 'high', 'urgent'].includes(v)) {
        return res.status(400).json({ error: 'Invalid priority' });
      }
      if (typeof v === 'string') updates[k] = sanitize(v);
      else updates[k] = v;
    }

    if (expectedVersion !== undefined) {
      updates.version = expectedVersion + 1;
      const { data, error } = await supabase
        .from('pm_tasks')
        .update(updates)
        .eq('id', id)
        .eq('version', expectedVersion)
        .select()
        .maybeSingle();
      if (error) return dbErr(res, error);
      if (!data) {
        const { data: current } = await supabase.from('pm_tasks').select('*').eq('id', id).maybeSingle();
        if (!current) return res.status(404).json({ error: 'Task not found' });
        return res.status(409).json({ error: 'Task was modified by another user', code: 'PM_CONFLICT', current });
      }
      return res.json({ data });
    }

    // Unversioned — bump anyway
    const { data: current } = await supabase.from('pm_tasks').select('version').eq('id', id).maybeSingle();
    if (!current) return res.status(404).json({ error: 'Task not found' });
    updates.version = (current.version || 0) + 1;
    const { data, error } = await supabase.from('pm_tasks').update(updates).eq('id', id).select().single();
    if (error) return dbErr(res, error);
    res.json({ data });
  } catch (err) { next(err); }
});

// DELETE /api/project-management/tasks/:id
router.delete('/tasks/:id', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const { error } = await supabase.from('pm_tasks').delete().eq('id', req.params.id);
    if (error) return dbErr(res, error);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/project-management/tasks/:id/move
// Body: { columnId, beforeTaskId?, afterTaskId? }
//   beforeTaskId — drop the moving card immediately above this neighbor
//   afterTaskId  — drop it immediately below this neighbor
//   neither      — append to the end of the column
router.post('/tasks/:id/move', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const taskId = req.params.id;
    const { columnId, beforeTaskId, afterTaskId } = req.body || {};
    if (!columnId) return res.status(400).json({ error: 'columnId is required' });

    // Compute the new position by inspecting neighbors in the destination column.
    let prevPos = null;
    let nextPos = null;
    if (afterTaskId) {
      const { data: after } = await supabase
        .from('pm_tasks').select('position').eq('id', afterTaskId).maybeSingle();
      if (after) {
        prevPos = after.position;
        // find the row that comes right after `after` in the same column
        const { data: nextRow } = await supabase
          .from('pm_tasks')
          .select('position')
          .eq('column_id', columnId)
          .gt('position', after.position)
          .neq('id', taskId)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();
        nextPos = nextRow?.position ?? null;
      }
    } else if (beforeTaskId) {
      const { data: before } = await supabase
        .from('pm_tasks').select('position').eq('id', beforeTaskId).maybeSingle();
      if (before) {
        nextPos = before.position;
        const { data: prevRow } = await supabase
          .from('pm_tasks')
          .select('position')
          .eq('column_id', columnId)
          .lt('position', before.position)
          .neq('id', taskId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle();
        prevPos = prevRow?.position ?? null;
      }
    } else {
      // No neighbors specified — drop at the end
      const { data: last } = await supabase
        .from('pm_tasks')
        .select('position')
        .eq('column_id', columnId)
        .neq('id', taskId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      prevPos = last?.position ?? null;
    }

    let newPosition = computePosition(prevPos, nextPos);

    // Detect float-precision degradation and rebalance the destination column.
    if (prevPos != null && nextPos != null && Math.abs(nextPos - prevPos) < TIGHT_POSITION_EPSILON) {
      await rebalanceColumn(columnId);
      // Re-read neighbors after rebalance
      let p = null, n = null;
      if (afterTaskId) {
        const { data: after } = await supabase
          .from('pm_tasks').select('position').eq('id', afterTaskId).maybeSingle();
        if (after) {
          p = after.position;
          const { data: nextRow } = await supabase
            .from('pm_tasks').select('position').eq('column_id', columnId)
            .gt('position', after.position).neq('id', taskId)
            .order('position', { ascending: true }).limit(1).maybeSingle();
          n = nextRow?.position ?? null;
        }
      } else if (beforeTaskId) {
        const { data: before } = await supabase
          .from('pm_tasks').select('position').eq('id', beforeTaskId).maybeSingle();
        if (before) {
          n = before.position;
          const { data: prevRow } = await supabase
            .from('pm_tasks').select('position').eq('column_id', columnId)
            .lt('position', before.position).neq('id', taskId)
            .order('position', { ascending: false }).limit(1).maybeSingle();
          p = prevRow?.position ?? null;
        }
      }
      newPosition = computePosition(p, n);
    }

    // Auto set/clear completed_at when entering/leaving the "Done" column.
    const { data: col } = await supabase.from('pm_columns').select('name').eq('id', columnId).maybeSingle();
    const isDoneCol = !!(col && /^done$/i.test((col.name || '').trim()));

    const updates = {
      column_id: columnId,
      position: newPosition,
      updated_at: new Date().toISOString(),
      updated_by: userEmail(req) || userName(req),
    };

    // Read the current completed_at to decide if it changes.
    const { data: cur } = await supabase
      .from('pm_tasks').select('completed_at, version').eq('id', taskId).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Task not found' });

    if (isDoneCol && !cur.completed_at) {
      updates.completed_at = new Date().toISOString();
    } else if (!isDoneCol && cur.completed_at) {
      updates.completed_at = null;
    }
    updates.version = (cur.version || 0) + 1;

    const { data, error } = await supabase
      .from('pm_tasks').update(updates).eq('id', taskId).select().single();
    if (error) return dbErr(res, error);
    res.json({ data });
  } catch (err) { next(err); }
});

// --- Comments ---

// GET /api/project-management/tasks/:id/comments
router.get('/tasks/:id/comments', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    if (!UUID_RE.test(req.params.id)) return badUuid(res, 'task');
    const { data, error } = await supabase
      .from('pm_comments')
      .select('*')
      .eq('task_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) return dbErr(res, error);
    res.json({ data: data || [] });
  } catch (err) { next(err); }
});

// POST /api/project-management/tasks/:id/comments
router.post('/tasks/:id/comments', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    if (!UUID_RE.test(req.params.id)) return badUuid(res, 'task');
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body is required' });
    const { data, error } = await supabase
      .from('pm_comments')
      .insert({
        task_id: req.params.id,
        body: sanitize(body.trim()),
        created_by: userEmail(req) || 'unknown',
        created_by_name: req.user?.name || null,
      })
      .select()
      .single();
    if (error) return dbErr(res, error);
    res.json({ data });
  } catch (err) { next(err); }
});

// PATCH /api/project-management/comments/:id (only original author)
router.patch('/comments/:id', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body is required' });
    const { data: existing } = await supabase
      .from('pm_comments').select('created_by').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Comment not found' });
    if ((existing.created_by || '').toLowerCase() !== userEmail(req)) {
      return res.status(403).json({ error: 'Only the author can edit this comment' });
    }
    const { data, error } = await supabase
      .from('pm_comments')
      .update({ body: sanitize(body.trim()), edited_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return dbErr(res, error);
    res.json({ data });
  } catch (err) { next(err); }
});

// DELETE /api/project-management/comments/:id (author or admin)
router.delete('/comments/:id', async (req, res, next) => {
  try {
    if (!ensureSupabase(res)) return;
    const { data: existing } = await supabase
      .from('pm_comments').select('created_by').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Comment not found' });
    const isAuthor = (existing.created_by || '').toLowerCase() === userEmail(req);
    const isAdmin = req.user?.role === 'admin';
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Only the author or an admin can delete this comment' });
    }
    const { error } = await supabase.from('pm_comments').delete().eq('id', req.params.id);
    if (error) return dbErr(res, error);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
