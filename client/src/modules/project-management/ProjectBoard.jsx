import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { ChevronLeft, Plus, X, Archive, KanbanSquare, RotateCcw } from 'lucide-react';
import {
  pmGetProject, pmCreateColumn, pmUpdateColumn, pmDeleteColumn,
  pmCreateTask, pmMoveTask, pmArchiveProject, pmRestoreProject,
} from '../../lib/api';
import { showToast } from '../../lib/toast';
import Column from './Column';
import TaskCard from './TaskCard';
import TaskDetailModal from './TaskDetailModal';

export default function ProjectBoard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState('');
  const newColRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const res = await pmGetProject(projectId);
      setProject(res.project);
      setColumns(res.columns || []);
      setTasks(res.tasks || []);
    } catch (err) {
      showToast(err.message || 'Failed to load project');
      if (err.status === 404) navigate('/projects');
    } finally {
      setLoading(false);
    }
  }, [projectId, navigate]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (addingColumn && newColRef.current) newColRef.current.focus();
  }, [addingColumn]);

  // Group tasks by column for fast render
  const tasksByColumn = useMemo(() => {
    const map = {};
    for (const c of columns) map[c.id] = [];
    for (const t of tasks) {
      if (map[t.column_id]) map[t.column_id].push(t);
    }
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => (a.position || 0) - (b.position || 0));
    }
    return map;
  }, [columns, tasks]);

  const activeTask = useMemo(
    () => tasks.find(t => t.id === activeId) || null,
    [tasks, activeId],
  );

  const handleAddTask = async (columnId, title) => {
    // Optimistic insert with a temp id; replace on response
    const tmpId = `tmp-${Math.random().toString(36).slice(2)}`;
    const tasksInCol = tasksByColumn[columnId] || [];
    const lastPos = tasksInCol.length > 0 ? tasksInCol[tasksInCol.length - 1].position : 0;
    const optimistic = {
      id: tmpId,
      project_id: projectId,
      column_id: columnId,
      title,
      labels: [],
      checklist: [],
      position: lastPos + 1,
      _optimistic: true,
    };
    setTasks(prev => [...prev, optimistic]);
    try {
      const res = await pmCreateTask(projectId, { columnId, title });
      setTasks(prev => prev.map(t => t.id === tmpId ? res.data : t));
    } catch (err) {
      setTasks(prev => prev.filter(t => t.id !== tmpId));
      showToast(err.message || 'Failed to add card');
    }
  };

  const handleAddColumn = async (e) => {
    e?.preventDefault?.();
    const v = newColName.trim();
    if (!v) return;
    try {
      const res = await pmCreateColumn(projectId, v);
      setColumns(prev => [...prev, res.data]);
      setNewColName('');
      setAddingColumn(false);
    } catch (err) {
      showToast(err.message || 'Failed to add column');
    }
  };

  const handleRenameColumn = async (columnId, name) => {
    const prevCols = columns;
    setColumns(prev => prev.map(c => c.id === columnId ? { ...c, name } : c));
    try {
      await pmUpdateColumn(columnId, { name });
    } catch (err) {
      setColumns(prevCols);
      showToast(err.message || 'Failed to rename column');
    }
  };

  const handleDeleteColumn = async (columnId) => {
    const prevCols = columns;
    const prevTasks = tasks;
    setColumns(prev => prev.filter(c => c.id !== columnId));
    setTasks(prev => prev.filter(t => t.column_id !== columnId));
    try {
      await pmDeleteColumn(columnId);
    } catch (err) {
      setColumns(prevCols);
      setTasks(prevTasks);
      showToast(err.message || 'Failed to delete column');
    }
  };

  const handleArchiveProject = async () => {
    if (!project) return;
    if (!window.confirm(`Archive project "${project.name}"?`)) return;
    try {
      await pmArchiveProject(project.id);
      showToast('Project archived');
      navigate('/projects');
    } catch (err) {
      showToast(err.message || 'Failed to archive');
    }
  };

  const handleRestoreProject = async () => {
    if (!project) return;
    try {
      const res = await pmRestoreProject(project.id);
      setProject(res.data);
      showToast('Project restored');
    } catch (err) {
      showToast(err.message || 'Failed to restore');
    }
  };

  // ---- Drag & Drop ----

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;
    const activeTask = tasks.find(t => t.id === active.id);
    if (!activeTask) return;

    // Determine destination column id
    let destColumnId = activeTask.column_id;
    let overTask = null;
    if (over.data?.current?.type === 'column') {
      destColumnId = over.data.current.columnId;
    } else if (over.data?.current?.type === 'task') {
      overTask = over.data.current.task;
      destColumnId = overTask.column_id;
    }

    // Local-only reorder so user sees the move while dragging.
    if (activeTask.column_id !== destColumnId) {
      setTasks(prev => prev.map(t => t.id === active.id ? { ...t, column_id: destColumnId } : t));
    } else if (overTask && overTask.id !== active.id) {
      // Same column reorder
      const colTasks = tasks.filter(t => t.column_id === destColumnId).sort((a, b) => a.position - b.position);
      const fromIdx = colTasks.findIndex(t => t.id === active.id);
      const toIdx = colTasks.findIndex(t => t.id === overTask.id);
      if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
        const reordered = arrayMove(colTasks, fromIdx, toIdx);
        // Reassign positions in the local copy with simple integers
        setTasks(prev => {
          const others = prev.filter(t => t.column_id !== destColumnId);
          return [
            ...others,
            ...reordered.map((t, i) => ({ ...t, position: i + 1 })),
          ];
        });
      }
    }
  };

  const handleDragEnd = async (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const movingTask = tasks.find(t => t.id === active.id);
    if (!movingTask) return;

    let destColumnId = movingTask.column_id;
    let beforeTaskId, afterTaskId;

    if (over.data?.current?.type === 'column') {
      destColumnId = over.data.current.columnId;
      // Drop at end of column
    } else if (over.data?.current?.type === 'task') {
      const overTask = over.data.current.task;
      destColumnId = overTask.column_id;
      if (overTask.id !== active.id) {
        // Position the moving card immediately above the over-task
        beforeTaskId = overTask.id;
      }
    }

    // Snapshot for rollback
    const snapshot = tasks;

    try {
      const res = await pmMoveTask(active.id, {
        columnId: destColumnId,
        beforeTaskId,
        afterTaskId,
      });
      // Replace moved task with server-confirmed state (column_id, position)
      setTasks(prev => prev.map(t => t.id === active.id ? { ...t, ...res.data } : t));
    } catch (err) {
      setTasks(snapshot);
      showToast(err.message || 'Failed to move task');
    }
  };

  const handleTaskClick = (task) => setOpenTaskId(task.id);

  const handleTaskUpdated = (updated) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  const handleTaskDeleted = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setOpenTaskId(null);
  };

  if (loading) {
    return (
      <>
        <div className="pm-toolbar">
          <Link to="/projects" className="pm-toolbar-back">
            <ChevronLeft size={14} /> All Projects
          </Link>
        </div>
        <div className="pm-loading dark">Loading board…</div>
      </>
    );
  }

  if (!project) return null;

  return (
    <>
      <div className="pm-toolbar">
        <Link to="/projects" className="pm-toolbar-back">
          <ChevronLeft size={14} /> All Projects
        </Link>
        <KanbanSquare size={20} color="var(--navy)" />
        <h1 className="pm-toolbar-title">{project.name}</h1>
        <div className="pm-toolbar-spacer" />
        {project.archived_at ? (
          <button className="pm-toolbar-btn pm-toolbar-btn-secondary" onClick={handleRestoreProject}>
            <RotateCcw size={14} /> Restore
          </button>
        ) : (
          <button className="pm-toolbar-btn pm-toolbar-btn-secondary" onClick={handleArchiveProject}>
            <Archive size={14} /> Archive
          </button>
        )}
      </div>

      <div
        className="pm-board"
        style={{
          background: project.color
            ? `linear-gradient(135deg, ${project.color}f0, ${project.color}cc)`
            : undefined,
        }}
      >
        <div className="pm-board-header">
          <h2 className="pm-board-header-title">{project.name}</h2>
          {project.description && (
            <span className="pm-board-header-desc">— {project.description}</span>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="pm-board-scroll">
            <div className="pm-board-columns">
              {columns.map(col => (
                <Column
                  key={col.id}
                  column={col}
                  tasks={tasksByColumn[col.id] || []}
                  onAddTask={handleAddTask}
                  onRenameColumn={handleRenameColumn}
                  onDeleteColumn={handleDeleteColumn}
                  onTaskClick={handleTaskClick}
                />
              ))}
              {addingColumn ? (
                <form className="pm-add-column-form" onSubmit={handleAddColumn}>
                  <input
                    ref={newColRef}
                    value={newColName}
                    onChange={e => setNewColName(e.target.value)}
                    placeholder="List title…"
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setAddingColumn(false); setNewColName(''); }
                    }}
                  />
                  <div className="actions">
                    <button type="submit" className="pm-btn" disabled={!newColName.trim()}>Add list</button>
                    <button
                      type="button"
                      className="pm-btn pm-btn-ghost"
                      onClick={() => { setAddingColumn(false); setNewColName(''); }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </form>
              ) : (
                <button className="pm-add-column-btn" onClick={() => setAddingColumn(true)}>
                  <Plus size={14} /> Add another list
                </button>
              )}
            </div>
          </div>

          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {openTaskId && (
        <TaskDetailModal
          taskId={openTaskId}
          task={tasks.find(t => t.id === openTaskId)}
          columns={columns}
          onClose={() => setOpenTaskId(null)}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
        />
      )}
    </>
  );
}
