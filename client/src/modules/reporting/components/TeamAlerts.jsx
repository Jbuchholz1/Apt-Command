import { useState, useEffect } from 'react';
import { getTeamAlerts } from '../../../lib/api';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

const BH_BASE = 'https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm';

export default function TeamAlerts({ team }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    setLoading(true);
    getTeamAlerts(team)
      .then((res) => setAlerts(res?.alerts || []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [team]);

  const toggleUser = (name) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  if (loading) {
    return (
      <div className="team-alerts-section">
        <h3 className="section-title">Team Alerts</h3>
        <div className="team-alerts-loading">Loading alerts...</div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="team-alerts-section">
        <h3 className="section-title">Team Alerts</h3>
        <div className="team-alerts-empty">No overdue alerts. All clear!</div>
      </div>
    );
  }

  const totalAlerts = alerts.reduce((s, a) => s + a.total, 0);

  return (
    <div className="team-alerts-section">
      <h3 className="section-title">
        Team Alerts
        <span className="team-alerts-badge">{totalAlerts}</span>
      </h3>
      <div className="team-alerts-list">
        {alerts.map((user) => {
          const isOpen = expanded[user.name];
          return (
            <div key={user.name} className="team-alert-card">
              <button className="team-alert-header" onClick={() => toggleUser(user.name)}>
                <div className="team-alert-header-left">
                  <AlertTriangle size={14} className="team-alert-icon" />
                  <span className="team-alert-name">{user.name}</span>
                  <span className="team-alert-count">{user.total} alert{user.total !== 1 ? 's' : ''}</span>
                </div>
                <div className="team-alert-tags">
                  {user.overdueFollowUps.length > 0 && (
                    <span className="team-alert-tag tag-followup">{user.overdueFollowUps.length} Follow Up{user.overdueFollowUps.length !== 1 ? 's' : ''}</span>
                  )}
                  {user.missedDeadlines.length > 0 && (
                    <span className="team-alert-tag tag-deadline">{user.missedDeadlines.length} Deadline{user.missedDeadlines.length !== 1 ? 's' : ''}</span>
                  )}
                  {user.overdueCheckins.length > 0 && (
                    <span className="team-alert-tag tag-checkin">{user.overdueCheckins.length} Check-In{user.overdueCheckins.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {isOpen && (
                <div className="team-alert-detail">
                  {user.overdueFollowUps.length > 0 && (
                    <div className="team-alert-group">
                      <div className="team-alert-group-title">Overdue Follow Ups</div>
                      {user.overdueFollowUps.map((a, i) => (
                        <div key={i} className="team-alert-row">
                          <a href={`${BH_BASE}?Entity=JobOrder&id=${a.jobId}`} target="_blank" rel="noopener noreferrer" className="team-alert-link">{a.jobId}</a>
                          <span className="team-alert-job">{a.title}</span>
                          <span className="team-alert-client">{a.client}</span>
                          <span className="team-alert-value">{a.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {user.missedDeadlines.length > 0 && (
                    <div className="team-alert-group">
                      <div className="team-alert-group-title">Missed Deadlines</div>
                      {user.missedDeadlines.map((a, i) => (
                        <div key={i} className="team-alert-row">
                          <a href={`${BH_BASE}?Entity=JobOrder&id=${a.jobId}`} target="_blank" rel="noopener noreferrer" className="team-alert-link">{a.jobId}</a>
                          <span className="team-alert-job">{a.title}</span>
                          <span className="team-alert-client">{a.client}</span>
                          <span className="team-alert-value">{a.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {user.overdueCheckins.length > 0 && (
                    <div className="team-alert-group">
                      <div className="team-alert-group-title">Overdue Check-Ins</div>
                      {user.overdueCheckins.map((a, i) => (
                        <div key={i} className="team-alert-row">
                          {a.candidateId && (
                            <a href={`${BH_BASE}?Entity=Candidate&id=${a.candidateId}`} target="_blank" rel="noopener noreferrer" className="team-alert-link">{a.candidateId}</a>
                          )}
                          <span className="team-alert-job">{a.candidate}</span>
                          <span className="team-alert-client">{a.client}</span>
                          <span className="team-alert-value">{a.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
