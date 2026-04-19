import { useState } from 'react';
import { Plus } from 'lucide-react';
import TaskRow from './TaskRow';
import { addGoalTask, updateGoalTask, deleteGoalTask } from '../../../lib/api';

export default function TaskList({ goalId, tasks, onChange }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const submitNew = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await addGoalTask(goalId, {
        title: title.trim(),
        assignee_name: assigneeName.trim() || null,
        assignee_email: assigneeEmail.trim() || null,
        due_date: dueDate || null,
      });
      setTitle(''); setAssigneeName(''); setAssigneeEmail(''); setDueDate('');
      setAdding(false);
      onChange?.();
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (task, completed) => {
    await updateGoalTask(goalId, task.id, { completed });
    onChange?.();
  };

  const remove = async (task) => {
    await deleteGoalTask(goalId, task.id);
    onChange?.();
  };

  return (
    <div className="gt-task-list">
      <div className="gt-task-list-header">
        <span>Related Tasks</span>
        {!adding && (
          <button className="gt-btn-ghost" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add Task
          </button>
        )}
      </div>

      {adding && (
        <div className="gt-task-add">
          <input
            className="gt-input"
            placeholder="Task title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
          <div className="gt-task-add-grid">
            <input
              className="gt-input"
              placeholder="Assignee name"
              value={assigneeName}
              onChange={e => setAssigneeName(e.target.value)}
            />
            <input
              className="gt-input"
              placeholder="Assignee email"
              type="email"
              value={assigneeEmail}
              onChange={e => setAssigneeEmail(e.target.value)}
            />
            <input
              className="gt-input"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>
          <div className="gt-task-add-actions">
            <button className="gt-btn-secondary" onClick={() => { setAdding(false); setTitle(''); }}>Cancel</button>
            <button className="gt-btn-primary" onClick={submitNew} disabled={!title.trim() || saving}>
              {saving ? 'Saving…' : 'Add Task'}
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !adding && (
        <div className="gt-empty">No tasks yet.</div>
      )}

      <div className="gt-task-rows">
        {tasks.map(t => (
          <TaskRow key={t.id} task={t} onToggle={toggle} onDelete={remove} />
        ))}
      </div>
    </div>
  );
}
