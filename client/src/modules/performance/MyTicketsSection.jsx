import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSupportTickets } from '../../lib/api';

const CATEGORY_COLORS = {
  issue: '#dc2626',
  bug: '#dc2626',       // legacy
  feature: '#7c3aed',
  feedback: '#0891b2',
  it_support: '#ea580c', // legacy
};

const CATEGORY_LABELS = {
  issue: 'Issue',
  bug: 'Issue',
  feature: 'Feature',
  feedback: 'General Question',
  it_support: 'Issue',
};

const STATUS_COLORS = {
  open: '#16a34a',
  in_progress: '#2563eb',
  resolved: '#6b7280',
  closed: '#374151',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function MyTicketsSection({ email }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      // When email is empty, server returns the authenticated user's tickets via mine=true
      // When email is set, server filters by that email (manager/admin only)
      const data = email
        ? await getSupportTickets(false, email)
        : await getSupportTickets(true);
      setTickets(data);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const visible = showClosed
    ? tickets
    : tickets.filter(t => t.status !== 'closed');

  return (
    <div className="detail-table-section">
      <h3 className="section-title">
        My Tickets <span className="detail-count">({visible.length})</span>
        <label className="my-tickets-toggle">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={e => setShowClosed(e.target.checked)}
          />
          <span>Show closed</span>
        </label>
      </h3>

      {loading ? (
        <p className="detail-empty">Loading tickets...</p>
      ) : visible.length === 0 ? (
        <p className="detail-empty">
          No {showClosed ? '' : 'open '}tickets.{' '}
          <Link to="/support/feedback">Submit one from the Support tab.</Link>
        </p>
      ) : (
        <div className="detail-table-wrap">
          <table className="detail-table my-tickets-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(ticket => (
                <tr key={ticket.id}>
                  <td>
                    <Link to="/support/feedback" className="my-tickets-title-link">
                      {ticket.title}
                    </Link>
                  </td>
                  <td>
                    <span
                      className="my-tickets-badge"
                      style={{ background: CATEGORY_COLORS[ticket.category] || '#6b7280' }}
                    >
                      {CATEGORY_LABELS[ticket.category] || ticket.category}
                    </span>
                  </td>
                  <td>
                    <span
                      className="my-tickets-status"
                      style={{ color: STATUS_COLORS[ticket.status] || '#6b7280' }}
                    >
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{formatDate(ticket.created_at)}</td>
                  <td>{ticket.resolved_at ? formatDate(ticket.resolved_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
