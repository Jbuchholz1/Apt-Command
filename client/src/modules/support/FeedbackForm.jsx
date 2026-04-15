import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send, Image, X } from 'lucide-react';
import { getSupportTickets, submitSupportTicket, updateTicketStatus } from '../../lib/api';
import { useUserRole } from '../../lib/UserRoleContext';
import { showToast } from '../../lib/toast';

const CATEGORY_OPTIONS = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'feedback', label: 'General Feedback' },
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

export default function FeedbackForm() {
  const { isAdmin } = useUserRole();
  const [view, setView] = useState('submit'); // 'submit' | 'my' | 'all'
  const [form, setForm] = useState({ category: 'bug', title: '', description: '' });
  const [screenshot, setScreenshot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

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
            {ticketsLoading ? (
              <p className="support-muted">Loading tickets...</p>
            ) : tickets.length === 0 ? (
              <p className="support-muted">{view === 'my' ? "You haven't submitted any tickets yet." : 'No tickets found.'}</p>
            ) : (
              <div className="ticket-list">
                {tickets.map(ticket => (
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
                    <div className="ticket-card-meta">
                      {view === 'all' && <span>By: {ticket.submitted_by_name || ticket.submitted_by}</span>}
                      <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
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
