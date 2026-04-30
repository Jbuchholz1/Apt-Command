import { useState, useRef, useEffect } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { MoreHorizontal, Plus, X } from 'lucide-react';
import TaskCard from './TaskCard';

export default function Column({
  column,
  tasks,
  onAddTask,
  onRenameColumn,
  onDeleteColumn,
  onTaskClick,
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(column.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const renameInputRef = useRef(null);
  const newTitleRef = useRef(null);

  const { setNodeRef, isOver } = useDroppable({
    id: `col-${column.id}`,
    data: { type: 'column', columnId: column.id },
  });

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (adding && newTitleRef.current) newTitleRef.current.focus();
  }, [adding]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const submitRename = () => {
    const v = renameValue.trim();
    if (v && v !== column.name) {
      onRenameColumn(column.id, v);
    }
    setRenaming(false);
  };

  const submitNewTask = (e) => {
    e?.preventDefault?.();
    const v = newTitle.trim();
    if (!v) return;
    onAddTask(column.id, v);
    setNewTitle('');
    // keep "adding" open so the user can quickly add multiple cards
    newTitleRef.current?.focus();
  };

  const handleDelete = () => {
    setMenuOpen(false);
    if (window.confirm(`Delete column "${column.name}" and all its tasks?`)) {
      onDeleteColumn(column.id);
    }
  };

  return (
    <div className="pm-column" ref={setNodeRef} style={isOver ? { background: 'rgba(211,191,48,0.18)' } : undefined}>
      <div className="pm-column-header">
        {renaming ? (
          <input
            ref={renameInputRef}
            className="pm-column-title-input"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') { setRenameValue(column.name); setRenaming(false); }
            }}
          />
        ) : (
          <h3 className="pm-column-title" onClick={() => setRenaming(true)} title="Click to rename">
            {column.name}
          </h3>
        )}
        <span className="pm-column-count">{tasks.length}</span>
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            className="pm-column-menu-btn"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Column menu"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div className="pm-column-menu" style={{ right: 0, top: '100%' }}>
              <button onClick={() => { setMenuOpen(false); setRenaming(true); }}>Rename</button>
              <button onClick={() => { setMenuOpen(false); setAdding(true); }}>Add a card</button>
              <button className="danger" onClick={handleDelete}>Delete column</button>
            </div>
          )}
        </div>
      </div>

      <div className="pm-column-body">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={onTaskClick} commentCount={task._commentCount || 0} />
          ))}
        </SortableContext>
      </div>

      <div className="pm-column-add">
        {adding ? (
          <form className="pm-add-card-form" onSubmit={submitNewTask}>
            <textarea
              ref={newTitleRef}
              className="pm-add-card-input"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Enter a title for this card…"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitNewTask();
                }
                if (e.key === 'Escape') { setAdding(false); setNewTitle(''); }
              }}
            />
            <div className="pm-add-card-actions">
              <button type="submit" className="primary" disabled={!newTitle.trim()}>Add card</button>
              <button type="button" className="secondary" onClick={() => { setAdding(false); setNewTitle(''); }}>
                <X size={14} />
              </button>
            </div>
          </form>
        ) : (
          <button className="pm-add-card-btn" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add a card
          </button>
        )}
      </div>
    </div>
  );
}
