import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, CheckSquare, MessageSquare } from 'lucide-react';

function initials(name, email) {
  const src = (name || email || '').trim();
  if (!src) return '?';
  const parts = src.split(/\s+|@/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function formatDue(due) {
  if (!due) return '';
  const d = new Date(due + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dueClass(due, completed) {
  if (completed) return 'completed';
  if (!due) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(due + 'T00:00:00');
  const days = Math.round((dueDate - today) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'overdue';
  if (days <= 2) return 'due-soon';
  return '';
}

export default function TaskCard({ task, onClick, isDragOverlay = false, commentCount = 0 }) {
  const sortable = useSortable({ id: task.id, data: { type: 'task', task } });
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = sortable;

  const style = isDragOverlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  const labels = Array.isArray(task.labels) ? task.labels : [];
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const checklistDone = checklist.filter(c => c.done).length;
  const completed = !!task.completed_at;
  const dClass = dueClass(task.due_date, completed);

  const handleClick = (e) => {
    // Only trigger click if it's not the start of a drag
    if (isDragging) return;
    // Optimistic cards (no real id yet) can't be opened — the detail modal
    // would point at a tmp id that gets replaced when the server responds.
    if (task._optimistic) return;
    e.stopPropagation();
    onClick?.(task);
  };

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      className={`pm-card ${completed ? 'completed' : ''} ${isDragging ? 'dragging' : ''} ${isDragOverlay ? 'pm-card-drag-overlay' : ''}`}
      style={style}
      onClick={handleClick}
      {...(isDragOverlay ? {} : attributes)}
      {...(isDragOverlay ? {} : listeners)}
    >
      {labels.length > 0 && (
        <div className="pm-card-labels">
          {labels.map((l, i) => (
            <span key={l.id || i} className="pm-label" style={{ background: l.color || 'var(--navy)' }}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      <p className="pm-card-title">{task.title}</p>
      {(task.due_date || task.priority || checklist.length > 0 || commentCount > 0 || task.assignee_email) && (
        <div className="pm-card-footer">
          {task.priority && (
            <span className={`pm-priority-dot ${task.priority}`} title={`Priority: ${task.priority}`} />
          )}
          {task.due_date && (
            <span className={`pm-due-pill ${dClass}`}>
              <Calendar size={10} />
              {formatDue(task.due_date)}
            </span>
          )}
          {checklist.length > 0 && (
            <span className={`pm-checklist-pill ${checklistDone === checklist.length ? 'complete' : ''}`}>
              <CheckSquare size={10} />
              {checklistDone}/{checklist.length}
            </span>
          )}
          {commentCount > 0 && (
            <span className="pm-comments-pill">
              <MessageSquare size={10} />
              {commentCount}
            </span>
          )}
          {(task.assignee_email || task.assignee_name) && (
            <span className="pm-assignee-avatar" title={task.assignee_name || task.assignee_email}>
              {initials(task.assignee_name, task.assignee_email)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
