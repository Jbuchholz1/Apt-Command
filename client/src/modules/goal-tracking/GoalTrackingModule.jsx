import { useState, useEffect, useCallback, useMemo } from 'react';
import './goal-tracking.css';
import { getGoals, pinGoalPriority, unpinGoalPriority, deleteGoal } from '../../lib/api';
import { useUserRole } from '../../lib/UserRoleContext';
import { getCurrentPeriod } from './lib/period';
import { computeAllProgress, buildTree } from './lib/progress';
import QuarterNavigator from './components/QuarterNavigator';
import GoalFilters from './components/GoalFilters';
import CreateGoalButton from './components/CreateGoalButton';
import GoalTree from './components/GoalTree';
import GoalDetail from './components/GoalDetail';

function uniqueOwners(goals) {
  const map = new Map();
  for (const g of goals) {
    const email = (g.owner_email || '').toLowerCase();
    if (!email) continue;
    if (!map.has(email)) map.set(email, { email, name: g.owner_name || email });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function filterGoals({ goals, view, ownerEmail, currentUserEmail, pinnedIds }) {
  if (view === 'company') {
    const companyIds = new Set(goals.filter(g => g.is_company_priority).map(g => g.id));
    const include = new Set(companyIds);
    let added = true;
    while (added) {
      added = false;
      for (const g of goals) {
        if (!include.has(g.id) && g.parent_id && include.has(g.parent_id)) {
          include.add(g.id); added = true;
        }
      }
    }
    return goals.filter(g => include.has(g.id));
  }
  if (view === 'mine') {
    const mine = new Set(goals
      .filter(g => (g.owner_email || '').toLowerCase() === currentUserEmail || (pinnedIds || []).includes(g.id))
      .map(g => g.id));
    return goals.filter(g => mine.has(g.id));
  }
  if (ownerEmail) {
    return goals.filter(g => (g.owner_email || '').toLowerCase() === ownerEmail);
  }
  return goals;
}

export default function GoalTrackingModule() {
  const { email: currentEmail, name: currentName, isManager, loading: userLoading } = useUserRole();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [view, setView] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState(null);
  const [data, setData] = useState({ goals: [], tasks: [], myPriorityIds: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGoalId, setSelectedGoalId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getGoals(period);
      setData({
        goals: res.goals || [],
        tasks: res.tasks || [],
        myPriorityIds: res.myPriorityIds || [],
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const progressMap = useMemo(() => computeAllProgress(data.goals, data.tasks), [data.goals, data.tasks]);
  const owners = useMemo(() => uniqueOwners(data.goals), [data.goals]);

  const visibleGoals = useMemo(() => filterGoals({
    goals: data.goals,
    view,
    ownerEmail: ownerFilter?.toLowerCase() || null,
    currentUserEmail: (currentEmail || '').toLowerCase(),
    pinnedIds: data.myPriorityIds,
  }), [data.goals, data.myPriorityIds, view, ownerFilter, currentEmail]);

  const tree = useMemo(() => buildTree(visibleGoals), [visibleGoals]);

  const togglePin = useCallback(async (goal, pin) => {
    setData(d => ({
      ...d,
      myPriorityIds: pin
        ? [...d.myPriorityIds, goal.id]
        : d.myPriorityIds.filter(id => id !== goal.id),
    }));
    try {
      if (pin) await pinGoalPriority(goal.id);
      else await unpinGoalPriority(goal.id);
    } catch (err) {
      load();
    }
  }, [load]);

  const handleDelete = useCallback(async (goal) => {
    if (!window.confirm(`Delete "${goal.name}"? This will archive it.`)) return;
    await deleteGoal(goal.id);
    await load();
  }, [load]);

  if (userLoading) return <div className="gt-empty">Loading…</div>;

  return (
    <div className="gt-module">
      <div className="gt-toolbar">
        <QuarterNavigator period={period} onChange={setPeriod} />
        <CreateGoalButton
          period={period}
          allGoals={data.goals}
          canSetCompanyPriority={isManager}
          defaultOwnerEmail={currentEmail}
          defaultOwnerName={currentName}
          onCreated={load}
        />
      </div>

      <GoalFilters
        view={view}
        onViewChange={setView}
        owners={owners}
        owner={ownerFilter}
        onOwnerChange={setOwnerFilter}
      />

      {error && <div className="gt-form-error">{error}</div>}

      {loading && <div className="gt-empty">Loading goals…</div>}

      {!loading && visibleGoals.length === 0 && (
        <div className="gt-empty-state">
          {isManager ? 'Create your first Company Priority for this quarter.' : 'No goals in this period yet.'}
        </div>
      )}

      {!loading && visibleGoals.length > 0 && (
        <GoalTree
          tree={tree}
          progressMap={progressMap}
          pinnedIds={data.myPriorityIds}
          period={period}
          onSelect={(g) => setSelectedGoalId(g.id)}
          onTogglePin={togglePin}
          onDelete={handleDelete}
          canDelete={isManager}
        />
      )}

      {selectedGoalId && (
        <GoalDetail
          goalId={selectedGoalId}
          period={period}
          allGoals={data.goals}
          pinned={data.myPriorityIds.includes(selectedGoalId)}
          currentUser={{ email: currentEmail, name: currentName }}
          canManage={isManager}
          onClose={() => setSelectedGoalId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
