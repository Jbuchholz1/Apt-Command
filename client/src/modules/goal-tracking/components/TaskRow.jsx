import { useState } from 'react';
import { Trash2, Check } from 'lucide-react';

function formatDue(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function taskStatus(task) {
  if (task.completed) return 'done';
  if (!task.due_date) return 'normal';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.due_date + 'T00:00:00');
  const daysUntil = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 7) return 'due-soon';
  return 'normal';
}

export default function TaskRow({ task, onToggle, onDelete }) {
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    try { await onToggle?.(task, !task.completed); } finally { setSaving(false); }
  };

  return (
    <div className={`gt-task-row gt-task-${taskStatus(task)}`}>
      <button
        className={`gt-task-check ${task.completed ? 'checked' : ''}`}
        onClick={toggle}
        disabled={saving}
        title={task.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {task.completed && <Check size={12} />}
      </button>
      <div className="gt-task-title">{task.title}</div>
      <div className="gt-task-meta">
        {task.assignee_name && <span className="gt-task-assignee">{task.assignee_name}</span>}
        <span className="gt-task-due">{formatDue(task.due_date)}</span>
      </div>
      <button
        className="gt-task-delete"
        onClick={() => onDelete?.(task)}
        title="Delete task"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
