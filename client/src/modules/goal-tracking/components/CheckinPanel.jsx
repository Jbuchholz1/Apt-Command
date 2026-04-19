import { useState } from 'react';
import { checkinGoal } from '../../../lib/api';

export default function CheckinPanel({ goal, onSubmitted }) {
  const [value, setValue] = useState(goal.current_value ?? '');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isNumber = goal.goal_type === 'number';
  const isUserDriven = goal.status_mode === 'user_driven';

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { note: note.trim() || undefined };
      if (isNumber) payload.current_value = Number(value);
      if (isUserDriven && status) payload.status = status;
      await checkinGoal(goal.id, payload);
      setNote('');
      setStatus('');
      onSubmitted?.();
    } catch (err) {
      setError(err.message || 'Check-in failed');
    } finally {
      setSaving(false);
    }
  };

  if (goal.goal_type === 'rollup') {
    return (
      <div className="gt-checkin-panel">
        <div className="gt-empty">Rollup goals update automatically from their children.</div>
      </div>
    );
  }

  return (
    <div className="gt-checkin-panel">
      <div className="gt-checkin-title">Update Progress</div>
      {isNumber && (
        <label className="gt-label">
          Current Value
          <input
            className="gt-input"
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
          />
        </label>
      )}
      {!isNumber && (
        <p className="gt-form-hint">
          Progress is computed from completed tasks. Add a note to record context.
        </p>
      )}
      <label className="gt-label">
        Note
        <textarea
          className="gt-textarea"
          rows={2}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional"
        />
      </label>
      {isUserDriven && (
        <label className="gt-label">
          Status
          <select className="gt-input" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">— No change —</option>
            <option value="green">Green — On track</option>
            <option value="yellow">Yellow — At risk</option>
            <option value="red">Red — Behind</option>
          </select>
        </label>
      )}
      {error && <div className="gt-form-error">{error}</div>}
      <div className="gt-checkin-actions">
        <button className="gt-btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Record Check-in'}
        </button>
      </div>
    </div>
  );
}
