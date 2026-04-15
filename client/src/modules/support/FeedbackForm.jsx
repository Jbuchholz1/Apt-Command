import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send, Image, X, Calendar, CheckCircle, Clock } from 'lucide-react';
import { getSupportTickets, submitSupportTicket, updateTicketStatus } from '../../lib/api';
import { useUserRole } from '../../lib/UserRoleContext';
import { showToast } from '../../lib/toast';

const CATEGORY_OPTIONS = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'feedback', label: 'General Feedback' },
];

const ALL_CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'feedback', label: 'General Feedback' },
  { value: 'it_support', label: 'IT Support' },
];

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'];

const STATUS_COLORS = {
  open: '#16a34a',
  in_progress: '#2563eb',
  resolved: '#6b7280',
  closed: '#374151',
};

const CATEGORY_COLORS = {
  bug: '#dc2626',
  feature: '#7c3aed',
  feedback: '#0891b2',
  it_support: '#ea580c',
};

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function FeedbackForm() {
  const { isAdmin } = useUserRole();
  const [view, setView] = useState('submit'); // 'submit' | 'my' | 'all'
  const [form, setForm] = useState({ category: 'bug', title: '', description: '' });
  const [screenshot, setScreenshot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    if (view === 'my' || view === 'all') loadTickets();
  }, [view]);

  const loadTickets = async () => {
    setTicketsLoading(true);
    try {
      const data = await getSupportTickets(view === 'my');
      setTickets(data);
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  };

  const filteredTickets = categoryFilter
    ? tickets.filter(t => t.category === categoryFilter)
    : tickets;

  const closeTimeKPIs = useMemo(() => {
    const categories = ['bug', 'feature', 'feedback', 'it_support'];
    return categories.map(cat => {
      const closed = tickets.filter(t =>
        t.category === cat && t.resolved_at && t.created_at
      );
      if (closed.length === 0) return { category: cat, avg: null, count: 0 };
      const totalMs = closed.reduce((sum, t) => {
        return sum + (new Date(t.resolved_at) - new Date(t.created_at));
      }, 0);
      return { category: cat, avg: totalMs / closed.length, count: closed.length };
    });
  }, [tickets]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', form.category);
      formData.append('title', form.title.trim());
      formData.append('description', form.description.trim());
      if (screenshot) formData.append('screenshot', screenshot);

      await submitSupportTicket(formData);
      showToast('Ticket submitted!');
      setForm({ category: 'bug', title: '', description: '' });
      setScreenshot(null);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (ticketId, newStatus) => {
    try {
      await updateTicketStatus(ticketId, { status: newStatus });
      showToast('Status updated');
      loadTickets();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Screenshot must be under 5MB', 'error');
      return;
    }
    setScreenshot(file);
  };

  return (
    <div className="support-page">
      <div className="support-toolbar">
        <Link to="/support" className="support-back-btn"><ArrowLeft size={16} /> Support</Link>
        <h2 className="support-toolbar-title">Bug & Feedback</h2>
      </div>

      <div className="support-page-body">
        {/* View Tabs */}
        <div className="feedback-tabs">
          <button className={`feedback-tab ${view === 'submit' ? 'active' : ''}`} onClick={() => setView('submit')}>
            Submit New
          </button>
          <button className={`feedback-tab ${view === 'my' ? 'active' : ''}`} onClick={() => setView('my')}>
            My Tickets
          </button>
          {isAdmin && (
            <button className={`feedback-tab ${view === 'all' ? 'active' : ''}`} onClick={() => setView('all')}>
              All Tickets
            </button>
          )}
        </div>

        {/* Submit Form */}
        {view === 'submit' && (
          <form className="feedback-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Title</label>
              <input
                type="text"
                placeholder="Brief summary of the issue or request"
                value={form.title}
                onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                maxLength={200}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                placeholder="Describe the issue or request in detail. Include steps to reproduce if it's a bug."
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                rows={5}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Screenshot (optional)</label>
              <div className="screenshot-input">
                {screenshot ? (
                  <div className="screenshot-preview">
                    <Image size={14} />
                    <span>{screenshot.name}</span>
                    <button type="button" className="screenshot-remove" onClick={() => setScreenshot(null)}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="screenshot-btn">
                    <Image size={14} /> Attach Screenshot
                    <input type="file" accept="image/*" onChange={handleFileChange} hidden />
                  </label>
                )}
              </div>
            </div>

            <button type="submit" className="feedback-submit-btn" disabled={submitting}>
              <Send size={14} /> {submitting ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </form>
        )}

        {/* Ticket List */}
        {(view === 'my' || view === 'all') && (
          <div className="ticket-list-section">
            {/* KPI Cards + Category Filter (All Tickets tab only) */}
            {view === 'all' && (
              <>
                <div className="ticket-kpi-row">
                  {closeTimeKPIs.map(kpi => (
                    <div key={kpi.category} className="ticket-kpi-card">
                      <Clock size={16} className="ticket-kpi-icon" />
                      <div className="ticket-kpi-body">
                        <div className="ticket-kpi-label">
                          <span className="ticket-kpi-cat-dot" style={{ background: CATEGORY_COLORS[kpi.category] }} />
                          {kpi.category === 'it_support' ? 'IT Support' : kpi.category.charAt(0).toUpperCase() + kpi.category.slice(1)}
                        </div>
                        <div className="ticket-kpi-value">
                          {kpi.avg != null ? formatDuration(kpi.avg) : '—'}
                        </div>
                        <div className="ticket-kpi-sub">
                          {kpi.count > 0 ? `${kpi.count} resolved` : 'No data'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="ticket-filter-bar">
                  <select
                    className="ticket-filter-select"
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                  >
                    {ALL_CATEGORIES.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <span className="ticket-count">{filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}</span>
                </div>
              </>
            )}

            {ticketsLoading ? (
              <p className="support-muted">Loading tickets...</p>
            ) : filteredTickets.length === 0 ? (
              <p className="support-muted">{view === 'my' ? "You haven't submitted any tickets yet." : 'No tickets found.'}</p>
            ) : (
              <div className="ticket-list">
                {filteredTickets.map(ticket => (
                  <div key={ticket.id} className="ticket-card">
                    <div className="ticket-card-top">
                      <span className="ticket-category-badge" style={{ background: CATEGORY_COLORS[ticket.category] || '#6b7280' }}>
                        {ticket.category.replace('_', ' ')}
                      </span>
                      {view === 'all' && isAdmin ? (
                        <select
                          className="ticket-status-select"
                          value={ticket.status}
                          onChange={e => handleStatusChange(ticket.id, e.target.value)}
                          style={{ color: STATUS_COLORS[ticket.status] }}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="ticket-status-badge" style={{ color: STATUS_COLORS[ticket.status] }}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <div className="ticket-card-title">{ticket.title}</div>
                    <div className="ticket-card-desc">{ticket.description}</div>
                    {ticket.screenshot_url && (
                      <a href={ticket.screenshot_url} target="_blank" rel="noopener noreferrer" className="ticket-screenshot-link">
                        <Image size={12} /> View Screenshot
                      </a>
                    )}
                    <div className="ticket-dates">
                      <span className="ticket-date">
                        <Calendar size={12} />
                        Opened: {formatDate(ticket.created_at)}
                      </span>
                      {ticket.resolved_at && (
                        <span className="ticket-date resolved">
                          <CheckCircle size={12} />
                          Resolved: {formatDate(ticket.resolved_at)}
                        </span>
                      )}
                    </div>
                    <div className="ticket-card-meta">
                      {view === 'all' && <span>By: {ticket.submitted_by_name || ticket.submitted_by}</span>}
                    </div>
                    {ticket.admin_notes && (
                      <div className="ticket-admin-notes">
                        <strong>Admin notes:</strong> {ticket.admin_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}
