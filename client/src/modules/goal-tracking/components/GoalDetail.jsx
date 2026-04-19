import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { getGoal, updateGoal, pinGoalPriority, unpinGoalPriority } from '../../../lib/api';
import StatusDot from './StatusDot';
import TagChip from './TagChip';
import TaskList from './TaskList';
import ProgressGraph from './ProgressGraph';
import GoalForm from './GoalForm';
import { resolveStatus } from '../lib/status';
import { formatPeriod } from '../lib/period';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'graph', label: 'Graph' },
];

export default function GoalDetail({
  goalId,
  period,
  allGoals,
  pinned,
  currentUser,
  canManage,
  onClose,
  onChanged,
  onDelete,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!goalId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getGoal(goalId);
      setData(res);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [goalId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!goalId) return null;

  const goal = data?.goal;
  const pct = goal?.live_progress_pct ?? 0;
  const status = goal ? resolveStatus(goal, pct, period) : 'gray';
  const canEdit = !!goal && (canManage || goal.owner_email?.toLowerCase() === currentUser?.email?.toLowerCase());
  const canDelete = canEdit;
  const showTasksTab = goal?.goal_type === 'task';

  const togglePin = async () => {
    if (pinned) await unpinGoalPriority(goalId);
    else await pinGoalPriority(goalId);
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    onClose?.();
    onDelete(goal);
  };

  const handleEditSave = async (payload) => {
    await updateGoal(goalId, payload);
    setEditOpen(false);
    await load();
    onChanged?.();
  };

  return (
    <>
      <div className="gt-detail-overlay" onClick={onClose}>
        <div className="gt-detail-panel" onClick={e => e.stopPropagation()}>
          <div className="gt-detail-header">
            <h2>{loading ? 'Loading…' : goal?.name || 'Goal'}</h2>
            <button className="gt-detail-close" onClick={onClose}>&times;</button>
          </div>

          {error && <div className="gt-form-error">{error}</div>}

          {loading && <div className="gt-empty">Loading goal details…</div>}

          {!loading && goal && (
            <>
              <div className="gt-detail-meta">
                <StatusDot status={status} size={10} />
                <span className="gt-detail-pct">{Math.round(pct)}%</span>
                <span className="gt-detail-type">{goal.goal_type.toUpperCase()}</span>
                <span className="gt-detail-owner">{goal.owner_name || goal.owner_email}</span>
                <span className="gt-detail-period">{formatPeriod(period)}</span>
                <div className="gt-detail-tags">
                  {goal.is_company_priority && <TagChip kind="company" />}
                  {pinned && <TagChip kind="mine" />}
                </div>
                <div className="gt-detail-actions">
                  <button className="gt-btn-ghost" onClick={togglePin}>
                    {pinned ? 'Unpin' : 'Pin as My Priority'}
                  </button>
                  {canEdit && (
                    <button className="gt-btn-ghost" onClick={() => setEditOpen(true)}>
                      <Pencil size={13} /> Edit
                    </button>
                  )}
                  {canDelete && (
                    <button className="gt-btn-ghost gt-btn-danger" onClick={handleDelete}>
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
              </div>

              <div className="gt-detail-tabs">
                {TABS.filter(t => t.value !== 'tasks' || showTasksTab).map(t => (
                  <button
                    key={t.value}
                    className={`gt-detail-tab ${tab === t.value ? 'active' : ''}`}
                    onClick={() => setTab(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'overview' && (
                <div className="gt-detail-body">
                  {goal.description && (
                    <div className="gt-detail-desc">{goal.description}</div>
                  )}

                  {goal.goal_type === 'number' && (
                    <div className="gt-detail-kv">
                      <div><span>Start</span><strong>{goal.start_value ?? 0}{goal.unit || ''}</strong></div>
                      <div><span>Current</span><strong>{goal.current_value ?? 0}{goal.unit || ''}</strong></div>
                      <div><span>Target</span><strong>{goal.target_value ?? 0}{goal.unit || ''}</strong></div>
                    </div>
                  )}

                </div>
              )}

              {tab === 'tasks' && showTasksTab && (
                <div className="gt-detail-body">
                  <TaskList
                    goalId={goal.id}
                    tasks={data.tasks}
                    onChange={() => { load(); onChanged?.(); }}
                  />
                </div>
              )}

              {tab === 'graph' && (
                <div className="gt-detail-body">
                  <ProgressGraph checkins={data.checkins} period={period} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {editOpen && (
        <GoalForm
          goal={goal}
          period={period}
          allGoals={allGoals}
          canSetCompanyPriority={canManage}
          onSave={handleEditSave}
          onCancel={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
