import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertTriangle, Plus } from 'lucide-react';
import { APP_VERSION, CHANGELOG } from '../../lib/version';
import { getSystemHealth, getKnownIssues, createKnownIssue, updateKnownIssue } from '../../lib/api';
import { useUserRole } from '../../lib/UserRoleContext';
import { showToast } from '../../lib/toast';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export default function SystemStatus() {
  const { isManager } = useUserRole();
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [issues, setIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [showAddIssue, setShowAddIssue] = useState(false);
  const [newIssue, setNewIssue] = useState({ title: '', description: '', severity: 'medium' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadHealth();
    loadIssues();
  }, []);

  const loadHealth = async () => {
    setHealthLoading(true);
    try {
      const data = await getSystemHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  const loadIssues = async () => {
    setIssuesLoading(true);
    try {
      const data = await getKnownIssues('active');
      data.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
      setIssues(data);
    } catch {
      setIssues([]);
    } finally {
      setIssuesLoading(false);
    }
  };

  const handleAddIssue = async (e) => {
    e.preventDefault();
    if (!newIssue.title.trim() || !newIssue.description.trim()) return;
    setSubmitting(true);
    try {
      await createKnownIssue(newIssue);
      showToast('Known issue posted');
      setNewIssue({ title: '', description: '', severity: 'medium' });
      setShowAddIssue(false);
      loadIssues();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveIssue = async (id) => {
    try {
      await updateKnownIssue(id, { status: 'resolved' });
      showToast('Issue resolved');
      loadIssues();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const StatusIcon = ({ status }) => {
    if (status === 'healthy') return <CheckCircle size={18} className="health-icon healthy" />;
    if (status === 'down') return <XCircle size={18} className="health-icon down" />;
    return <AlertTriangle size={18} className="health-icon degraded" />;
  };

  return (
    <div className="support-page">
      <div className="support-toolbar">
        <Link to="/support" className="support-back-btn"><ArrowLeft size={16} /> Support</Link>
        <h2 className="support-toolbar-title">System Status</h2>
        <button className="support-refresh-btn" onClick={loadHealth} disabled={healthLoading}>
          <RefreshCw size={14} className={healthLoading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="support-page-body">
        {/* Health Cards */}
        <div className="status-health-section">
          <h3 className="faq-section-title">Service Health</h3>
          {healthLoading && !health ? (
            <p className="support-muted">Checking services...</p>
          ) : health ? (
            <div className="health-cards">
              <div className={`health-card ${health.api?.status || 'down'}`}>
                <StatusIcon status={health.api?.status} />
                <div>
                  <div className="health-card-label">API Server</div>
                  <div className="health-card-status">{health.api?.status === 'healthy' ? 'Operational' : 'Down'}</div>
                  {health.api?.uptimeSeconds != null && (
                    <div className="health-card-detail">Uptime: {formatUptime(health.api.uptimeSeconds)}</div>
                  )}
                </div>
              </div>
              <div className={`health-card ${health.mcp?.status || 'down'}`}>
                <StatusIcon status={health.mcp?.status} />
                <div>
                  <div className="health-card-label">Bullhorn MCP</div>
                  <div className="health-card-status">{health.mcp?.status === 'healthy' ? 'Operational' : health.mcp?.status === 'degraded' ? 'Degraded' : 'Down'}</div>
                  {health.mcp?.responseTimeMs != null && (
                    <div className="health-card-detail">{health.mcp.responseTimeMs}ms response</div>
                  )}
                </div>
              </div>
              <div className={`health-card ${health.database?.status || 'down'}`}>
                <StatusIcon status={health.database?.status} />
                <div>
                  <div className="health-card-label">Database</div>
                  <div className="health-card-status">{health.database?.status === 'healthy' ? 'Operational' : 'Down'}</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="support-muted">Unable to check system health.</p>
          )}
        </div>

        {/* Known Issues */}
        <div className="status-issues-section">
          <h3 className="faq-section-title">
            Known Issues
            {issues.length > 0 && <span className="issues-count-badge">{issues.length}</span>}
            {isManager && (
              <button className="add-issue-btn" onClick={() => setShowAddIssue(!showAddIssue)}>
                <Plus size={14} /> Add
              </button>
            )}
          </h3>

          {showAddIssue && (
            <form className="add-issue-form" onSubmit={handleAddIssue}>
              <input
                type="text"
                placeholder="Issue title"
                value={newIssue.title}
                onChange={e => setNewIssue(prev => ({ ...prev, title: e.target.value }))}
                required
              />
              <textarea
                placeholder="Description"
                value={newIssue.description}
                onChange={e => setNewIssue(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                required
              />
              <div className="add-issue-row">
                <select
                  value={newIssue.severity}
                  onChange={e => setNewIssue(prev => ({ ...prev, severity: e.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <button type="submit" disabled={submitting}>{submitting ? 'Posting...' : 'Post Issue'}</button>
                <button type="button" className="btn-cancel" onClick={() => setShowAddIssue(false)}>Cancel</button>
              </div>
            </form>
          )}

          {issuesLoading ? (
            <p className="support-muted">Loading...</p>
          ) : issues.length === 0 ? (
            <p className="support-muted">No known issues at this time.</p>
          ) : (
            <div className="known-issues-list">
              {issues.map(issue => (
                <div key={issue.id} className="known-issue-card">
                  <span className={`severity-badge sev-${issue.severity}`}>{issue.severity}</span>
                  <div className="known-issue-body">
                    <div className="known-issue-title">{issue.title}</div>
                    <div className="known-issue-desc">{issue.description}</div>
                    <div className="known-issue-meta">
                      Posted {new Date(issue.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  {isManager && (
                    <button className="resolve-btn" onClick={() => handleResolveIssue(issue.id)}>Resolve</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Changelog */}
        <div className="status-changelog-section">
          <h3 className="faq-section-title">
            Changelog <span className="changelog-version-badge">v{APP_VERSION}</span>
          </h3>
          <div className="changelog-list">
            {CHANGELOG.map(entry => (
              <div key={entry.version} className="changelog-entry">
                <div className="changelog-entry-header">
                  <span className="changelog-entry-version">v{entry.version}</span>
                  <span className="changelog-entry-date">{entry.date}</span>
                </div>
                <h4 className="changelog-entry-title">{entry.title}</h4>
                <ul className="changelog-entry-changes">
                  {entry.changes.map((c, i) => (
                    <li key={i}>
                      <span className={`changelog-type-badge type-${c.type}`}>{c.type}</span>
                      {c.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
