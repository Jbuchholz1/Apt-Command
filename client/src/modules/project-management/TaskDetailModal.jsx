import { useState, useEffect, useRef } from 'react';
import { X, Trash2 } from 'lucide-react';
import { pmUpdateTask, pmDeleteTask } from '../../lib/api';
import { showToast } from '../../lib/toast';
import LabelEditor from './LabelEditor';
import ChecklistEditor from './ChecklistEditor';
import CommentsThread from './CommentsThread';

const PRIORITIES = [
  { value: '', label: 'No priority' },
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export default function TaskDetailModal({ task, columns, onClose, onUpdated, onDeleted }) {
  const [draft, setDraft] = useState({
    title: task.title || '',
    description: task.description || '',
    assignee_email: task.assignee_email || '',
    assignee_name: task.assignee_name || '',
    due_date: task.due_date || '',
    priority: task.priority || '',
    labels: Array.isArray(task.labels) ? task.labels : [],
    checklist: Array.isArray(task.checklist) ? task.checklist : [],
  });
  const versionRef = useRef(task.version);
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef(null);
  const [dirty, setDirty] = useState(false);

  // Keep version ref in sync if parent updates
  useEffect(() => { versionRef.current = task.version; }, [task.version]);

  const patch = async (fields) => {
    try {
      setSaving(true);
      const res = await pmUpdateTask(task.id, fields, { expectedVersion: versionRef.current });
      versionRef.current = res.data.version;
      onUpdated(res.data);
      setDirty(false);
    } catch (err) {
      if (err.status === 409 && err.body?.current) {
        showToast('This task was modified by someone else — refreshing.');
        const cur = err.body.current;
        versionRef.current = cur.version;
        setDraft({
          title: cur.title || '',
          description: cur.description || '',
          assignee_email: cur.assignee_email || '',
          assignee_name: cur.assignee_name || '',
          due_date: cur.due_date || '',
          priority: cur.priority || '',
          labels: Array.isArray(cur.labels) ? cur.labels : [],
          checklist: Array.isArray(cur.checklist) ? cur.checklist : [],
        });
        onUpdated(cur);
      } else {
        showToast(err.message || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  // Debounced auto-save when title/description/assignee/due/priority changes
  useEffect(() => {
    if (!dirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      patch({
        title: draft.title,
        description: draft.description || null,
        assignee_email: draft.assignee_email || null,
        assignee_name: draft.assignee_name || null,
        due_date: draft.due_date || null,
        priority: draft.priority || null,
      });
    }, 600);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.title, draft.description, draft.assignee_email, draft.assignee_name, draft.due_date, draft.priority]);

  const handleField = (field) => (e) => {
    setDraft(d => ({ ...d, [field]: e.target.value }));
    setDirty(true);
  };

  const handleAssigneeEmail = (e) => {
    const email = e.target.value;
    setDraft(d => ({
      ...d,
      assignee_email: email,
      // If name is empty, fall back to email-derived name
      assignee_name: d.assignee_name || (email ? email.split('@')[0] : ''),
    }));
    setDirty(true);
  };

  // Labels & checklist save immediately (not debounced — discrete actions)
  const saveLabels = async (labels) => {
    setDraft(d => ({ ...d, labels }));
    await patch({ labels });
  };

  const saveChecklist = async (checklist) => {
    setDraft(d => ({ ...d, checklist }));
    await patch({ checklist });
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    try {
      await pmDeleteTask(task.id);
      onDeleted(task.id);
      showToast('Task deleted');
    } catch (err) {
      showToast(err.message || 'Failed to delete');
    }
  };

  const currentColumn = columns.find(c => c.id === task.column_id);

  return (
    <div className="pm-modal-overlay" onClick={onClose}>
      <div className="pm-modal large" onClick={e => e.stopPropagation()}>
        <div className="pm-modal-header">
          <input
            className="pm-task-title-input"
            value={draft.title}
            onChange={handleField('title')}
            placeholder="Task title"
          />
          <button className="pm-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="pm-modal-body">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, marginLeft: 6 }}>
            in list <strong style={{ color: 'var(--text)' }}>{currentColumn?.name || '—'}</strong>
            {saving && <span style={{ marginLeft: 10, color: 'var(--gold)' }}>Saving…</span>}
          </div>

          <div className="pm-task-modal-grid">
            <div className="pm-task-modal-main">
              <div className="pm-task-section">
                <h4 className="pm-task-section-title">Description</h4>
                <textarea
                  className="pm-textarea"
                  value={draft.description}
                  onChange={handleField('description')}
                  placeholder="Add a more detailed description…"
                />
              </div>

              <div className="pm-task-section">
                <h4 className="pm-task-section-title">Labels</h4>
                <LabelEditor labels={draft.labels} onChange={saveLabels} />
              </div>

              <div className="pm-task-section">
                <h4 className="pm-task-section-title">Checklist</h4>
                <ChecklistEditor checklist={draft.checklist} onChange={saveChecklist} />
              </div>

              <div className="pm-task-section">
                <h4 className="pm-task-section-title">Comments</h4>
                <CommentsThread taskId={task.id} />
              </div>
            </div>

            <div className="pm-task-modal-sidebar">
              <div>
                <h4>Assignee</h4>
                <input
                  className="pm-input"
                  type="email"
                  value={draft.assignee_email}
                  onChange={handleAssigneeEmail}
                  placeholder="email@apt.com"
                />
                <input
                  className="pm-input"
                  style={{ marginTop: 4 }}
                  value={draft.assignee_name}
                  onChange={handleField('assignee_name')}
                  placeholder="Display name"
                />
              </div>
              <div>
                <h4>Due date</h4>
                <input
                  className="pm-input"
                  type="date"
                  value={draft.due_date || ''}
                  onChange={handleField('due_date')}
                />
              </div>
              <div>
                <h4>Priority</h4>
                <select
                  className="pm-select"
                  value={draft.priority}
                  onChange={handleField('priority')}
                >
                  {PRIORITIES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              {task.completed_at && (
                <div style={{
                  background: '#dcfce7', color: '#166534',
                  padding: '6px 10px', borderRadius: 6,
                  fontSize: 11, fontWeight: 600,
                }}>
                  ✓ Completed {new Date(task.completed_at).toLocaleDateString()}
                </div>
              )}
              <button
                className="pm-btn pm-btn-danger"
                style={{ marginTop: 8 }}
                onClick={handleDelete}
              >
                <Trash2 size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                Delete task
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
