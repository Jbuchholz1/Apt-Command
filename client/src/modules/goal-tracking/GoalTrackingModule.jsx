import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import './goal-tracking.css';
import {
  getGoals,
  pinGoalPriority,
  unpinGoalPriority,
  deleteGoal,
  createGoal,
  updateGoal,
} from '../../lib/api';
import { useUserRole } from '../../lib/UserRoleContext';
import { getCurrentPeriod, formatPeriod } from './lib/period';
import { computeAllProgress, buildTree } from './lib/progress';
import { resolveStatus, statusLabel } from './lib/status';

import GoalForm from './components/GoalForm';
import GoalDetail from './components/GoalDetail';
import LedgerMasthead from './components/LedgerMasthead';
import QuarterSwitcher from './components/QuarterSwitcher';
import LedgerFilterBar from './components/LedgerFilterBar';
import LedgerList from './components/LedgerList';
import QuarterAtAGlance from './components/QuarterAtAGlance';
import Distribution from './components/Distribution';
import WatermarkCorner from './components/WatermarkCorner';

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

function computeAggregates(visibleGoals, tree, progressMap, period) {
  const active = tree.length;
  const priorities = visibleGoals.filter(g => g.is_company_priority).length;

  let onTrack = 0;
  const dist = { on: 0, atRisk: 0, off: 0 };
  for (const g of visibleGoals) {
    const pct = progressMap[g.id] ?? 0;
    const color = resolveStatus(g, pct, period);
    const lbl = statusLabel(color, pct);
    if (lbl === 'on' || lbl === 'complete') onTrack += 1;
    if (lbl === 'on' || lbl === 'complete') dist.on += 1;
    else if (lbl === 'at-risk') dist.atRisk += 1;
    else dist.off += 1;
  }

  let wSum = 0;
  let wTot = 0;
  for (const root of tree) {
    const w = Number(root.weight ?? 1) || 1;
    wSum += (progressMap[root.id] ?? 0) * w;
    wTot += w;
  }
  const aggregatePct = wTot > 0 ? wSum / wTot : 0;

  return { active, priorities, onTrack, aggregatePct, distribution: dist };
}

export default function GoalTrackingModule() {
  const { email: currentEmail, name: currentName, isManager, loading: userLoading } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();

  const archivedParam = searchParams.get('archived');
  const archiveMode = !!archivedParam;

  const qParam = searchParams.get('q');
  const [period, setPeriodState] = useState(qParam || getCurrentPeriod());
  const [view, setView] = useState('all');
  const [statusFilter, setStatusFilter] = useState('any');
  const [ownerFilter, setOwnerFilter] = useState(null);
  const [data, setData] = useState({ goals: [], tasks: [], myPriorityIds: [], archivedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [formConfig, setFormConfig] = useState(null);

  const setPeriod = useCallback((p) => {
    setPeriodState(p);
    const next = new URLSearchParams(searchParams);
    if (p === getCurrentPeriod()) next.delete('q'); else next.set('q', p);
    next.delete('archived');
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const enterArchive = useCallback((archivePeriod) => {
    const next = new URLSearchParams(searchParams);
    next.set('archived', archivePeriod);
    next.delete('q');
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const exitArchive = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('archived');
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const effectivePeriod = archiveMode ? archivedParam : period;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getGoals(effectivePeriod, archiveMode ? { archived: true } : undefined);
      setData({
        goals: res.goals || [],
        tasks: res.tasks || [],
        myPriorityIds: res.myPriorityIds || [],
        archivedCount: res.archivedCount || 0,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [effectivePeriod, archiveMode]);

  useEffect(() => { load(); }, [load]);

  const progressMap = useMemo(
    () => computeAllProgress(data.goals, data.tasks),
    [data.goals, data.tasks],
  );
  const owners = useMemo(() => uniqueOwners(data.goals), [data.goals]);

  const filtered = useMemo(() => {
    let gs = filterGoals({
      goals: data.goals,
      view,
      ownerEmail: ownerFilter?.toLowerCase() || null,
      currentUserEmail: (currentEmail || '').toLowerCase(),
      pinnedIds: data.myPriorityIds,
    });
    if (statusFilter !== 'any') {
      gs = gs.filter(g => {
        const pct = progressMap[g.id] ?? 0;
        return statusLabel(resolveStatus(g, pct, effectivePeriod), pct) === statusFilter;
      });
    }
    return gs;
  }, [data.goals, data.myPriorityIds, view, ownerFilter, currentEmail, statusFilter, progressMap, effectivePeriod]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const aggregates = useMemo(
    () => computeAggregates(filtered, tree, progressMap, effectivePeriod),
    [filtered, tree, progressMap, effectivePeriod],
  );

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
    const descendantIds = new Set([goal.id]);
    let added = true;
    while (added) {
      added = false;
      for (const g of data.goals) {
        if (g.parent_id && descendantIds.has(g.parent_id) && !descendantIds.has(g.id)) {
          descendantIds.add(g.id);
          added = true;
        }
      }
    }
    setData(d => ({
      ...d,
      goals: d.goals.filter(g => !descendantIds.has(g.id)),
      tasks: d.tasks.filter(t => !descendantIds.has(t.goal_id)),
      myPriorityIds: d.myPriorityIds.filter(id => !descendantIds.has(id)),
    }));
    setSelectedGoalId(sid => (descendantIds.has(sid) ? null : sid));
    try {
      await deleteGoal(goal.id);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
    await load();
  }, [load, data.goals]);

  const handleFormSave = useCallback(async (payload) => {
    if (formConfig?.goal) {
      await updateGoal(formConfig.goal.id, payload);
    } else {
      await createGoal(payload);
    }
    setFormConfig(null);
    await load();
  }, [formConfig, load]);

  if (userLoading) return <div className="ql-loading">Loading…</div>;

  return (
    <div className="ql-module">
      <WatermarkCorner />

      <LedgerMasthead
        onNewGoal={() => setFormConfig({})}
        canCreate={isManager || !archiveMode}
        archiveMode={archiveMode}
      />

      {archiveMode && (
        <div className="ql-archive-banner">
          <span className="ql-archive-eyebrow">
            VIEWING ARCHIVE · {formatPeriod(archivedParam)}
          </span>
          <button type="button" className="ql-btn-secondary" onClick={exitArchive}>
            <ArrowLeft size={13} /> Back to current
          </button>
        </div>
      )}

      <div className="ql-columns">
        <div className="ql-ledger-col">
          {!archiveMode && (
            <QuarterSwitcher period={period} onChange={setPeriod} />
          )}

          <LedgerFilterBar
            view={view}
            onViewChange={setView}
            owners={owners}
            owner={ownerFilter}
            onOwnerChange={setOwnerFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            goalCount={filtered.length}
            priorityCount={aggregates.priorities}
          />

          {error && <div className="ql-error">{error}</div>}

          {loading ? (
            <div className="ql-list-loading">Loading goals…</div>
          ) : (
            <LedgerList
              tree={tree}
              progressMap={progressMap}
              pinnedIds={data.myPriorityIds}
              period={effectivePeriod}
              currentEmail={currentEmail}
              isManager={isManager}
              readOnly={archiveMode}
              archivedCount={data.archivedCount}
              onSelect={(g) => setSelectedGoalId(g.id)}
              onTogglePin={togglePin}
              onEdit={(g) => setFormConfig({ goal: g })}
              onAddSubGoal={(g) => setFormConfig({ parent: g })}
              onDelete={handleDelete}
              onViewArchive={enterArchive}
            />
          )}
        </div>

        <aside className="ql-side-rail">
          <QuarterAtAGlance aggregates={aggregates} />
          <Distribution distribution={aggregates.distribution} />
        </aside>
      </div>

      {selectedGoalId && (
        <GoalDetail
          goalId={selectedGoalId}
          period={effectivePeriod}
          allGoals={data.goals}
          pinned={data.myPriorityIds.includes(selectedGoalId)}
          currentUser={{ email: currentEmail, name: currentName }}
          canManage={isManager && !archiveMode}
          onClose={() => setSelectedGoalId(null)}
          onChanged={load}
          onDelete={handleDelete}
        />
      )}

      {formConfig && (
        <GoalForm
          goal={formConfig.goal}
          parent={formConfig.parent}
          period={period}
          allGoals={data.goals}
          canSetCompanyPriority={isManager}
          isManager={isManager}
          defaultOwnerEmail={currentEmail}
          defaultOwnerName={currentName}
          onSave={handleFormSave}
          onCancel={() => setFormConfig(null)}
        />
      )}
    </div>
  );
}
