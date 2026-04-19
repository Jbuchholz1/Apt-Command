import { useState, useEffect } from 'react';
import { formatPeriod } from '../lib/period';

const TYPE_OPTIONS = [
  { value: 'number', label: 'Number' },
  { value: 'task', label: 'Task' },
  { value: 'rollup', label: 'Rollup' },
];

export default function GoalForm({
  goal,
  parent,
  period,
  allGoals = [],
  canSetCompanyPriority,
  onSave,
  onCancel,
  defaultOwnerName,
  defaultOwnerEmail,
}) {
  const isEdit = !!goal;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(() => ({
    name: goal?.name || '',
    description: goal?.description || '',
    goal_type: goal?.goal_type || 'number',
    owner_email: goal?.owner_email || defaultOwnerEmail || '',
    owner_name: goal?.owner_name || defaultOwnerName || '',
    parent_id: goal?.parent_id ?? parent?.id ?? null,
    start_value: goal?.start_value ?? 0,
    current_value: goal?.current_value ?? 0,
    target_value: goal?.target_value ?? 100,
    unit: goal?.unit || '',
    is_company_priority: !!goal?.is_company_priority,
  }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.owner_email.trim()) { setError('Owner email is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        goal_type: form.goal_type,
        owner_email: form.owner_email.trim().toLowerCase(),
        owner_name: form.owner_name.trim() || null,
        parent_id: form.parent_id || null,
        period,
        status_mode: 'calculated',
        is_company_priority: !form.parent_id && !!form.is_company_priority,
      };
      if (form.goal_type === 'number') {
        payload.start_value = Number(form.start_value) || 0;
        payload.current_value = Number(form.current_value) || 0;
        payload.target_value = Number(form.target_value) || 0;
        payload.unit = form.unit.trim() || null;
      }
      await onSave?.(payload);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const parentOptions = allGoals.filter(g => !goal || g.id !== goal.id);

  return (
    <div className="gt-modal-overlay" onClick={onCancel}>
      <div className="gt-modal" onClick={e => e.stopPropagation()}>
        <div className="gt-modal-header">
          <h2>{isEdit ? 'Edit Goal' : 'Create Goal'}</h2>
          <span className="gt-modal-period">{formatPeriod(period)}</span>
          <button className="gt-modal-close" onClick={onCancel}>&times;</button>
        </div>

        <div className="gt-modal-body">
          <label className="gt-label">
            <span>Priority Name <span className="gt-required">*</span></span>
            <input
              className="gt-input"
              type="text"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="e.g. Hit 300 MAR Points"
              autoFocus
            />
          </label>

          <label className="gt-label">
            Description
            <textarea
              className="gt-textarea"
              rows={2}
              value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Optional — why does this matter?"
            />
          </label>

          <div className="gt-form-grid">
            <label className="gt-label">
              <span>Owner Email <span className="gt-required">*</span></span>
              <input
                className="gt-input"
                type="email"
                value={form.owner_email}
                onChange={e => update('owner_email', e.target.value)}
              />
            </label>
            <label className="gt-label">
              Owner Name
              <input
                className="gt-input"
                type="text"
                value={form.owner_name}
                onChange={e => update('owner_name', e.target.value)}
              />
            </label>
          </div>

          <label className="gt-label">
            Parent Goal
            <select
              className="gt-input"
              value={form.parent_id || ''}
              onChange={e => update('parent_id', e.target.value || null)}
            >
              <option value="">— No parent (top-level) —</option>
              {parentOptions.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>

          {!form.parent_id && canSetCompanyPriority && (
            <label className="gt-label-inline">
              <input
                type="checkbox"
                checked={form.is_company_priority}
                onChange={e => update('is_company_priority', e.target.checked)}
              />
              <span>Mark as Company Priority</span>
            </label>
          )}

          <div className="gt-fieldset">
            <div className="gt-fieldset-label">Success Measurement</div>
            <div className="gt-type-tabs">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`gt-type-tab ${form.goal_type === opt.value ? 'active' : ''}`}
                  onClick={() => update('goal_type', opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {form.goal_type === 'number' && (
              <div className="gt-form-grid">
                <label className="gt-label">
                  Start Value
                  <input
                    className="gt-input"
                    type="number"
                    value={form.start_value}
                    onChange={e => update('start_value', e.target.value)}
                  />
                </label>
                <label className="gt-label">
                  Current Value
                  <input
                    className="gt-input"
                    type="number"
                    value={form.current_value}
                    onChange={e => update('current_value', e.target.value)}
                  />
                </label>
                <label className="gt-label">
                  <span>Target <span className="gt-required">*</span></span>
                  <input
                    className="gt-input"
                    type="number"
                    value={form.target_value}
                    onChange={e => update('target_value', e.target.value)}
                  />
                </label>
                <label className="gt-label">
                  Unit
                  <input
                    className="gt-input"
                    type="text"
                    value={form.unit}
                    onChange={e => update('unit', e.target.value)}
                    placeholder="$, pts, %, ..."
                  />
                </label>
              </div>
            )}

            {form.goal_type === 'rollup' && (
              <p className="gt-form-hint">
                Progress is the simple average of this goal's direct children.
              </p>
            )}

            {form.goal_type === 'task' && (
              <p className="gt-form-hint">
                You'll add tasks after creating the goal.
              </p>
            )}
          </div>

          {error && <div className="gt-form-error">{error}</div>}
        </div>

        <div className="gt-modal-footer">
          <button className="gt-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button
            className="gt-btn-primary"
            onClick={handleSubmit}
            disabled={saving || !form.name.trim()}
          >
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Goal')}
          </button>
        </div>
      </div>
    </div>
  );
}
