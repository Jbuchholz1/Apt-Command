// Goal Tracking routes
//
// Permission matrix:
//   POST /goals (top-level OR is_company_priority=true)  → manager | admin
//   POST /goals (sub-goal, parent_id set, not company)   → any authed
//   PATCH /goals/:id                                     → owner | manager | admin
//   DELETE /goals/:id (soft-delete)                      → owner | admin
//   POST /goals/:id/checkin                              → owner | manager | admin
//   POST /goals/:id/tasks, PATCH/DELETE task             → goal owner | task assignee | manager | admin
//   POST/DELETE /goals/:id/priority                      → self only (req.user.email)
//   GET endpoints                                        → any authed

const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { resolveRole } = require('../lib/roles');
const { getCurrentPeriod } = require('../lib/period');

// Shift a period string (e.g. "2026-Q2") by delta quarters. Negative = earlier.
function shiftPeriod(period, delta) {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!m) return period;
  const fy = parseInt(m[1], 10);
  const q = parseInt(m[2], 10);
  const total = fy * 4 + (q - 1) + delta;
  return `${Math.floor(total / 4)}-Q${(total % 4) + 1}`;
}

// Goal data is mutation-heavy (create, check-in, task toggle) and the UI
// expects the list to reflect changes immediately. Override the global
// Cache-Control: max-age=300 from index.js so the browser always revalidates.
router.use((req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'no-store');
  next();
});

function userEmail(req) {
  return (req.user?.email || '').toLowerCase().trim();
}

async function isManager(req) {
  const role = await resolveRole(userEmail(req));
  return role === 'admin' || role === 'manager';
}

async function isAdmin(req) {
  const role = await resolveRole(userEmail(req));
  return role === 'admin';
}

async function loadGoalOr404(id, res) {
  const row = await db.getGoal(id);
  if (!row) {
    res.status(404).json({ error: 'Goal not found' });
    return null;
  }
  return row;
}

// ---- Read ----

router.get('/', async (req, res, next) => {
  try {
    const period = req.query.period || getCurrentPeriod();
    const archived = req.query.archived === 'true';
    const { goals, tasks } = archived
      ? await db.listArchivedGoals(period)
      : await db.listGoals(period);
    const myPriorityIds = await db.listMyPriorityIds(userEmail(req), period);
    // Footer reads "Plus N archived goals from {prevPeriod}", so the count must
    // be scoped to the previous period — not the one currently being viewed.
    const archivedCount = archived ? 0 : await db.countArchivedGoals(shiftPeriod(period, -1));
    res.json({ period, goals, tasks, myPriorityIds, archivedCount, archived });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await loadGoalOr404(req.params.id, res);
    if (!row) return;
    res.json(row);
  } catch (err) { next(err); }
});

router.get('/:id/history', async (req, res, next) => {
  try {
    const checkins = await db.listCheckins(req.params.id, { from: req.query.from, to: req.query.to });
    res.json({ checkins });
  } catch (err) { next(err); }
});

router.get('/:id/tasks', async (req, res, next) => {
  try {
    const tasks = await db.listTasksForGoal(req.params.id);
    res.json({ tasks });
  } catch (err) { next(err); }
});

// ---- Create ----

router.post('/', async (req, res, next) => {
  try {
    const email = userEmail(req);
    if (!email) return res.status(401).json({ error: 'Unauthorized' });

    const { name, goal_type, period, parent_id, is_company_priority } = req.body || {};
    if (!name || !goal_type || !period) {
      return res.status(400).json({ error: 'name, goal_type, and period are required' });
    }
    if (!['rollup', 'number', 'task'].includes(goal_type)) {
      return res.status(400).json({ error: 'invalid goal_type' });
    }

    const isTopOrCompany = !parent_id || !!is_company_priority;
    if (isTopOrCompany && !(await isManager(req))) {
      return res.status(403).json({ error: 'Only managers/admins can create top-level or company-priority goals' });
    }

    const goal = await db.createGoal({
      ...req.body,
      owner_email: (req.body.owner_email || email).toLowerCase(),
      owner_name: req.body.owner_name || req.user?.name || '',
      created_by: email,
    });
    res.status(201).json({ goal });
  } catch (err) { next(err); }
});

// ---- Update / Archive ----

router.patch('/:id', async (req, res, next) => {
  try {
    const row = await loadGoalOr404(req.params.id, res);
    if (!row) return;
    const email = userEmail(req);
    const owner = (row.goal.owner_email || '').toLowerCase();
    if (owner !== email && !(await isManager(req))) {
      return res.status(403).json({ error: 'Not allowed to edit this goal' });
    }
    // Only managers/admins can toggle is_company_priority
    if (typeof req.body.is_company_priority === 'boolean' && !(await isManager(req))) {
      return res.status(403).json({ error: 'Only managers/admins can change company-priority flag' });
    }

    const oldCurrent = row.goal.current_value;
    const oldStatusOverride = row.goal.status_override;
    const updated = await db.updateGoal(req.params.id, req.body);

    // Record a check-in when the tracked state changes — keeps the Graph populated
    // now that the standalone Check-In panel is gone.
    const currentChanged = updated.goal_type === 'number'
      && req.body.current_value !== undefined
      && Number(updated.current_value) !== Number(oldCurrent);
    const statusChanged = req.body.status_override !== undefined
      && updated.status_override !== oldStatusOverride;
    if (currentChanged || statusChanged) {
      await db.insertCheckin(req.params.id, {
        value: currentChanged ? updated.current_value : null,
        status: updated.status_override || null,
        source: 'manual',
        createdBy: email,
      });
    }

    res.json({ goal: updated });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const row = await loadGoalOr404(req.params.id, res);
    if (!row) return;
    const email = userEmail(req);
    const owner = (row.goal.owner_email || '').toLowerCase();
    if (owner !== email && !(await isAdmin(req))) {
      return res.status(403).json({ error: 'Not allowed to delete this goal' });
    }
    await db.archiveGoal(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/reorder', async (req, res, next) => {
  try {
    if (!(await isManager(req))) {
      return res.status(403).json({ error: 'Only managers/admins can reorder' });
    }
    const { ordering } = req.body || {};
    if (!Array.isArray(ordering)) return res.status(400).json({ error: 'ordering must be an array' });
    await db.reorderGoals(ordering);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- Check-ins ----

router.post('/:id/checkin', async (req, res, next) => {
  try {
    const row = await loadGoalOr404(req.params.id, res);
    if (!row) return;
    const email = userEmail(req);
    const owner = (row.goal.owner_email || '').toLowerCase();
    if (owner !== email && !(await isManager(req))) {
      return res.status(403).json({ error: 'Not allowed to submit check-ins for this goal' });
    }

    const { current_value, note, status, status_mode } = req.body || {};

    // Update the goal if value/status fields are supplied
    const goalUpdates = {};
    if (current_value !== undefined && row.goal.goal_type === 'number') {
      goalUpdates.current_value = current_value;
    }
    if (status_mode !== undefined) goalUpdates.status_mode = status_mode;
    if (status !== undefined) goalUpdates.status_override = status;
    if (Object.keys(goalUpdates).length > 0) {
      await db.updateGoal(req.params.id, goalUpdates);
    }

    const checkin = await db.insertCheckin(req.params.id, {
      value: current_value,
      note,
      status,
      source: 'manual',
      createdBy: email,
    });

    const refreshed = await db.getGoal(req.params.id);
    res.json({ checkin, goal: refreshed?.goal });
  } catch (err) { next(err); }
});

// ---- Tasks ----

function canEditTask(email, role, goal, task) {
  if (role === 'admin' || role === 'manager') return true;
  if ((goal.owner_email || '').toLowerCase() === email) return true;
  if (task && (task.assignee_email || '').toLowerCase() === email) return true;
  return false;
}

router.post('/:id/tasks', async (req, res, next) => {
  try {
    const row = await loadGoalOr404(req.params.id, res);
    if (!row) return;
    const email = userEmail(req);
    const role = await resolveRole(email);
    if (!canEditTask(email, role, row.goal, null)) {
      return res.status(403).json({ error: 'Not allowed to add tasks to this goal' });
    }
    const { title, assignee_email, assignee_name, due_date } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const task = await db.createTask(req.params.id, {
      title,
      assignee_email: (assignee_email || '').toLowerCase() || null,
      assignee_name: assignee_name || null,
      due_date: due_date || null,
      created_by: email,
    });
    res.status(201).json({ task });
  } catch (err) { next(err); }
});

router.patch('/:id/tasks/:taskId', async (req, res, next) => {
  try {
    const row = await loadGoalOr404(req.params.id, res);
    if (!row) return;
    const task = (row.tasks || []).find(t => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const email = userEmail(req);
    const role = await resolveRole(email);
    if (!canEditTask(email, role, row.goal, task)) {
      return res.status(403).json({ error: 'Not allowed to edit this task' });
    }

    const wasComplete = !!task.completed;
    const updateFields = { ...req.body };
    if (req.body.completed !== undefined) {
      updateFields.completed_by = req.body.completed ? email : null;
    }
    const updated = await db.updateTask(req.params.taskId, updateFields);

    // When a task flips to completed, write a check-in on the parent goal
    if (req.body.completed === true && !wasComplete) {
      await db.insertCheckin(req.params.id, {
        source: 'task_completion',
        note: `Task completed: ${task.title}`,
        createdBy: email,
      });
    } else if (req.body.completed === false && wasComplete) {
      await db.insertCheckin(req.params.id, {
        source: 'task_completion',
        note: `Task reopened: ${task.title}`,
        createdBy: email,
      });
    }

    const refreshed = await db.getGoal(req.params.id);
    res.json({ task: updated, goal: refreshed?.goal });
  } catch (err) { next(err); }
});

router.delete('/:id/tasks/:taskId', async (req, res, next) => {
  try {
    const row = await loadGoalOr404(req.params.id, res);
    if (!row) return;
    const task = (row.tasks || []).find(t => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const email = userEmail(req);
    const role = await resolveRole(email);
    if (!canEditTask(email, role, row.goal, task)) {
      return res.status(403).json({ error: 'Not allowed to delete this task' });
    }
    await db.deleteTask(req.params.taskId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- Priority pin ----

router.post('/:id/priority', async (req, res, next) => {
  try {
    const email = userEmail(req);
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    await db.pinPriority(email, req.params.id);
    res.json({ pinned: true });
  } catch (err) { next(err); }
});

router.delete('/:id/priority', async (req, res, next) => {
  try {
    const email = userEmail(req);
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    await db.unpinPriority(email, req.params.id);
    res.json({ pinned: false });
  } catch (err) { next(err); }
});

module.exports = router;
