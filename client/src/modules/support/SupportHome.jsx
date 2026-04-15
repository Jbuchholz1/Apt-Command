import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, MessageSquare, FileText, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { getSystemHealth } from '../../lib/api';

const sections = [
  {
    id: 'help',
    title: 'Help & Docs',
    description: 'FAQs, how-to guides, and training resources for every module.',
    Icon: BookOpen,
    path: '/support/help',
  },
  {
    id: 'feedback',
    title: 'Support & Requests',
    description: 'Report an issue, request a feature, or share feedback with the team.',
    Icon: MessageSquare,
    path: '/support/feedback',
  },
  {
    id: 'status',
    title: 'Change Log',
    description: 'Version history, known issues, and release notes.',
    Icon: FileText,
    path: '/support/status',
  },
];

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const StatusIcon = ({ status }) => {
  if (status === 'healthy') return <CheckCircle size={18} className="health-icon healthy" />;
  if (status === 'down') return <XCircle size={18} className="health-icon down" />;
  return <AlertTriangle size={18} className="health-icon degraded" />;
};

export default function SupportHome() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHealth(); }, []);

  const loadHealth = async () => {
    setLoading(true);
    try {
      const data = await getSystemHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="support-home">
      {/* Service Health Cards */}
      <div className="support-home-health">
        <div className="support-home-health-header">
          <h3 className="faq-section-title">Service Health</h3>
          <button className="support-refresh-btn-sm" onClick={loadHealth} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
          </button>
        </div>
        {loading && !health ? (
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

      <h2 className="support-home-title">Support Center</h2>
      <p className="support-home-subtitle">What do you need help with?</p>
      <div className="support-card-grid">
        {sections.map(s => {
          const { Icon } = s;
          return (
            <Link key={s.id} to={s.path} className="support-card">
              <Icon size={28} className="support-card-icon" />
              <h3 className="support-card-title">{s.title}</h3>
              <p className="support-card-desc">{s.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
