function clamp(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function numberProgress(goal) {
  const s = Number(goal.start_value ?? 0);
  const c = Number(goal.current_value ?? s);
  const t = Number(goal.target_value ?? s);
  if (t === s) return c >= t ? 100 : 0;
  return clamp(((c - s) / (t - s)) * 100);
}

export function taskProgress(tasks) {
  if (!tasks || tasks.length === 0) return 0;
  const done = tasks.filter(t => t.completed).length;
  return clamp((done / tasks.length) * 100);
}

export function rollupProgress(children, childPcts) {
  if (!children || children.length === 0) return 0;
  const totalWeight = children.reduce((s, c) => s + Number(c.weight ?? 1), 0);
  if (totalWeight === 0) return 0;
  const weighted = children.reduce((s, c) => s + (childPcts[c.id] ?? 0) * Number(c.weight ?? 1), 0);
  return clamp(weighted / totalWeight);
}

// Compute progress for every goal in the list, returning a map by id.
// Uses live data: tasks for task goals, number math for number goals, and
// children's computed progress for rollup goals (recursive bottom-up).
export function computeAllProgress(goals, tasks) {
  const byParent = new Map();
  const byId = new Map();
  for (const g of goals) {
    byId.set(g.id, g);
    const key = g.parent_id || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(g);
  }
  const tasksByGoal = new Map();
  for (const t of (tasks || [])) {
    if (!tasksByGoal.has(t.goal_id)) tasksByGoal.set(t.goal_id, []);
    tasksByGoal.get(t.goal_id).push(t);
  }

  const memo = {};
  function compute(id) {
    if (id in memo) return memo[id];
    const g = byId.get(id);
    if (!g) return 0;
    if (g.goal_type === 'number') {
      memo[id] = numberProgress(g);
    } else if (g.goal_type === 'task') {
      memo[id] = taskProgress(tasksByGoal.get(id) || []);
    } else {
      const kids = byParent.get(id) || [];
      const childPcts = {};
      for (const c of kids) childPcts[c.id] = compute(c.id);
      memo[id] = rollupProgress(kids, childPcts);
    }
    return memo[id];
  }

  for (const g of goals) compute(g.id);
  return memo;
}

export function buildTree(goals) {
  const byParent = new Map();
  for (const g of goals) {
    const key = g.parent_id || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(g);
  }
  const sortChildren = arr => arr.sort((a, b) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    new Date(a.created_at) - new Date(b.created_at));

  function build(parentId) {
    const kids = sortChildren(byParent.get(parentId) || []);
    return kids.map(g => ({ ...g, children: build(g.id) }));
  }
  return build(null);
}
