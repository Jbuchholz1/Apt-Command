import { useState, useEffect, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getSupportTickets } from '../../lib/api';
import { useUserRole } from '../../lib/UserRoleContext';
import TicketThread from '../support/TicketThread';

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

function formatTicketNumber(n) {
  if (n == null) return '—';
  return `Apt${String(n).padStart(6, '0')}`;
}

export default function MyTicketsSection({ email }) {
  const { isAdmin, email: currentEmail } = useUserRole();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const loadTickets = async () => {
    setLoading(true);
    try {
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

  const toggleExpand = (id) => setExpandedId(prev => (prev === id ? null : id));

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
                <th style={{ width: 28 }}></th>
                <th>Ticket #</th>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Assigned To</th>
                <th>Opened</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(ticket => {
                const isExpanded = expandedId === ticket.id;
                const isSubmitter = ticket.submitted_by === currentEmail;
                const canComment = isAdmin || isSubmitter;
                return (
                  <Fragment key={ticket.id}>
                    <tr
                      className={`my-tickets-row ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => toggleExpand(ticket.id)}
                    >
                      <td className="my-tickets-chevron">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="my-tickets-number">{formatTicketNumber(ticket.ticket_number)}</td>
                      <td>
                        <span className="my-tickets-title-link">{ticket.title}</span>
                      </td>
                      <td>
                        <div className="my-tickets-category-cell">
                          <span
                            className="my-tickets-badge"
                            style={{ background: CATEGORY_COLORS[ticket.category] || '#6b7280' }}
                          >
                            {CATEGORY_LABELS[ticket.category] || ticket.category}
                          </span>
                          {ticket.tool && (
                            <span className="my-tickets-tool">{ticket.tool}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className="my-tickets-status"
                          style={{ color: STATUS_COLORS[ticket.status] || '#6b7280' }}
                        >
                          {ticket.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="my-tickets-assigned">
                        {ticket.assigned_to_name || ticket.assigned_to || '—'}
                      </td>
                      <td>{formatDate(ticket.created_at)}</td>
                      <td>{ticket.resolved_at ? formatDate(ticket.resolved_at) : '—'}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="my-tickets-thread-row">
                        <td colSpan={8}>
                          <div className="my-tickets-thread-wrap">
                            <div className="my-tickets-thread-desc">{ticket.description}</div>
                            <TicketThread
                              ticketId={ticket.id}
                              canComment={canComment}
                              currentEmail={currentEmail}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
