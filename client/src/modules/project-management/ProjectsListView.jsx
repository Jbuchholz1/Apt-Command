import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, KanbanSquare, Archive } from 'lucide-react';
import { pmListProjects } from '../../lib/api';
import { showToast } from '../../lib/toast';
import NewProjectModal from './NewProjectModal';

const COLOR_DEFAULT = '#04144F';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProjectsListView() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const res = await pmListProjects({ archived: showArchived });
      setProjects(res?.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { reload(); }, [reload]);

  const handleCreated = (project) => {
    setShowNewModal(false);
    setProjects(prev => [project, ...prev]);
    showToast('Project created');
  };

  return (
    <>
      <div className="pm-toolbar">
        <KanbanSquare size={22} color="var(--navy)" />
        <h1 className="pm-toolbar-title">Project Management</h1>
        <div className="pm-toolbar-spacer" />
        <button
          className={`pm-list-toggle ${showArchived ? 'active' : ''}`}
          onClick={() => setShowArchived(s => !s)}
        >
          <Archive size={12} />
          {showArchived ? 'Showing archived' : 'Show archived'}
        </button>
        <button className="pm-toolbar-btn" onClick={() => setShowNewModal(true)}>
          <Plus size={14} />
          New Project
        </button>
      </div>

      <div className="pm-list">
        <div className="pm-list-header">
          <h2 className="pm-list-title">{showArchived ? 'Archived projects' : 'Active projects'}</h2>
        </div>

        {loading && (
          <div className="pm-loading dark">Loading projects…</div>
        )}

        {!loading && projects.length === 0 && (
          <div className="pm-empty">
            <KanbanSquare size={42} color="var(--text-light)" />
            <h2>{showArchived ? 'No archived projects' : 'No projects yet'}</h2>
            <p>{showArchived
              ? 'Archived projects will appear here.'
              : 'Create your first project to start tracking tasks and deadlines.'}</p>
            {!showArchived && (
              <button className="pm-toolbar-btn" onClick={() => setShowNewModal(true)}>
                <Plus size={14} /> New Project
              </button>
            )}
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="pm-grid">
            {projects.map(p => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className={`pm-project-card ${p.archived_at ? 'archived' : ''}`}
              >
                <div className="pm-project-color-bar" style={{ background: p.color || COLOR_DEFAULT }} />
                <h3 className="pm-project-name">{p.name}</h3>
                {p.description && <p className="pm-project-desc">{p.description}</p>}
                <div className="pm-project-meta">
                  <span>Created {formatDate(p.created_at)}</span>
                  {p.archived_at && <span className="pm-project-archived-badge">Archived</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
