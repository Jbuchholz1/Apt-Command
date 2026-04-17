import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send, Image, X, Calendar, CheckCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { getSupportTickets, submitSupportTicket, updateTicketStatus, updateTicketAssignee, getAdminUsers } from '../../lib/api';
import { useUserRole } from '../../lib/UserRoleContext';
import { showToast } from '../../lib/toast';
import TicketThread from './TicketThread';

function formatTicketNumber(n) {
  if (n == null) return '';
  return `Apt${String(n).padStart(6, '0')}`;
}

const CATEGORY_OPTIONS = [
  { value: 'issue', label: 'Issue' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'feedback', label: 'General Question' },
];

const TOOL_OPTIONS = [
  'Alex', 'FullyRamped', 'CloudCall', 'BullHorn', 'Apt Command',
  'ZoomInfo', 'Align', 'Sharepoint', 'Outlook', 'Other — Please List in Description',
];

const ALL_CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'issue', label: 'Issue' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'feedback', label: 'General Question' },
];

const CATEGORY_DISPLAY = {
  issue: 'Issue',
  feature: 'Feature',
  feedback: 'General Questions',
};

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'];

const STATUS_COLORS = {
  open: '#16a34a',
  in_progress: '#2563eb',
  resolved: '#6b7280',
  closed: '#374151',
};

const CATEGORY_COLORS = {
  issue: '#dc2626',
  bug: '#dc2626',       // legacy — existing tickets in DB
  feature: '#7c3aed',
  feedback: '#0891b2',
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
  const { isAdmin, email: currentEmail } = useUserRole();
  const [view, setView] = useState('submit'); // 'submit' | 'my' | 'queue' | 'all'
  const [form, setForm] = useState({ category: 'issue', tool: '', title: '', description: '' });
  const [screenshot, setScreenshot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState(''); // '' = all, '__unassigned__' = unassigned, else email
  const [expandedId, setExpandedId] = useState(null);
  const [admins, setAdmins] = useState([]);

  const toggleExpand = (id) => setExpandedId(prev => (prev === id ? null : id));

  useEffect(() => {
    if (view === 'my' || view === 'all' || view === 'queue') loadTickets();
  }, [view]);

  useEffect(() => {
    if (isAdmin) {
      getAdminUsers()
        .then(res => {
          const all = Array.isArray(res) ? res : (res?.users || []);
          setAdmins(all.filter(u => u.role === 'admin' && u.is_active !== false));
        })
        .catch(() => setAdmins([]));
    }
  }, [isAdmin]);

  const loadTickets = async () => {
    setTicketsLoading(true);
    try {
      // Queue view: admin fetches all, then filters to assigned_to self
      // My view: fetches own tickets
      // All view: fetches all (admin only)
      const mine = view === 'my';
      const data = await getSupportTickets(mine);
      setTickets(data);
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  };

  // Apply assignee scoping first — this feeds KPIs so they can be tracked per-person
  const assigneeScopedTickets = useMemo(() => {
    if (view === 'queue') {
      return tickets.filter(t => t.assigned_to === currentEmail);
    }
    if (assigneeFilter === '__unassigned__') {
      return tickets.filter(t => !t.assigned_to);
    }
    if (assigneeFilter) {
      return tickets.filter(t => t.assigned_to === assigneeFilter);
    }
    return tickets;
  }, [tickets, view, currentEmail, assigneeFilter]);

  // Apply category filter on top for the visible ticket list
  const filteredTickets = categoryFilter
    ? assigneeScopedTickets.filter(t => t.category === categoryFilter)
    : assigneeScopedTickets;

  const closeTimeKPIs = useMemo(() => {
    const categories = ['issue', 'feature', 'feedback'];
    return categories.map(cat => {
      // Include legacy 'bug' tickets under 'issue'
      const matchCats = cat === 'issue' ? ['issue', 'bug', 'it_support'] : [cat];
      const closed = assigneeScopedTickets.filter(t =>
        matchCats.includes(t.category) && t.resolved_at && t.created_at
      );
      if (closed.length === 0) return { category: cat, avg: null, count: 0 };
      const totalMs = closed.reduce((sum, t) => {
        return sum + (new Date(t.resolved_at) - new Date(t.created_at));
      }, 0);
      return { category: cat, avg: totalMs / closed.length, count: closed.length };
    });
  }, [assigneeScopedTickets]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    if (form.category === 'issue' && !form.tool) {
      showToast('Please select a tool for this issue', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', form.category);
      if (form.category === 'issue' && form.tool) {
        formData.append('tool', form.tool);
      }
      formData.append('title', form.title.trim());
      formData.append('description', form.description.trim());
      if (screenshot) formData.append('screenshot', screenshot);

      await submitSupportTicket(formData);
      showToast('Ticket submitted!');
      setForm({ category: 'issue', tool: '', title: '', description: '' });
      setScreenshot(null);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (ticketId, newStatus) => {
    try {
      const updated = await updateTicketStatus(ticketId, { status: newStatus });
      // Update local state instead of re-fetching the full list
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...updated } : t));
      showToast('Status updated');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAssigneeChange = async (ticketId, assigneeEmail) => {
    try {
      const admin = admins.find(a => a.email === assigneeEmail);
      const updated = await updateTicketAssignee(ticketId, {
        assigned_to: assigneeEmail || null,
        assigned_to_name: admin?.full_name || null,
      });
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...updated } : t));
      showToast(assigneeEmail ? `Assigned to ${admin?.full_name || assigneeEmail}` : 'Unassigned');
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
        <h2 className="support-toolbar-title">Support & Requests</h2>
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
            <button className={`feedback-tab ${view === 'queue' ? 'active' : ''}`} onClick={() => setView('queue')}>
              My Queue
            </button>
          )}
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
                onChange={e => setForm(prev => ({
                  ...prev,
                  category: e.target.value,
                  // Clear tool if switching away from Issue
                  tool: e.target.value === 'issue' ? prev.tool : '',
                }))}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {form.category === 'issue' && (
              <div className="form-group">
                <label className="form-label">Tool</label>
                <select
                  value={form.tool}
                  onChange={e => setForm(prev => ({ ...prev, tool: e.target.value }))}
                  required
                >
                  <option value="">-- Select Tool --</option>
                  {TOOL_OPTIONS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

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
        {(view === 'my' || view === 'all' || view === 'queue') && (
          <div className="ticket-list-section">
            {/* KPI Cards (All Tickets tab only) */}
            {view === 'all' && (
              <>
                {assigneeFilter && (
                  <div className="ticket-kpi-scope">
                    Showing metrics for{' '}
                    <strong>
                      {assigneeFilter === '__unassigned__'
                        ? 'Unassigned tickets'
                        : (admins.find(a => a.email === assigneeFilter)?.full_name || assigneeFilter)}
                    </strong>
                  </div>
                )}
                <div className="ticket-kpi-row">
                  {closeTimeKPIs.map(kpi => (
                    <div key={kpi.category} className="ticket-kpi-card">
                      <Clock size={16} className="ticket-kpi-icon" />
                      <div className="ticket-kpi-body">
                        <div className="ticket-kpi-label">
                          <span className="ticket-kpi-cat-dot" style={{ background: CATEGORY_COLORS[kpi.category] }} />
                          {CATEGORY_DISPLAY[kpi.category] || kpi.category}
                        </div>
                        <div className="ticket-kpi-value">
                          {kpi.avg != null ? formatDuration(kpi.avg) : '—'}
                        </div>
                        <div className="ticket-kpi-sub">
                          Avg Time to Close {kpi.count > 0 ? `(${kpi.count} resolved)` : '— No data'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* Filters (All Tickets + Queue tabs) */}
            {(view === 'all' || view === 'queue') && (
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
                {view === 'all' && (
                  <select
                    className="ticket-filter-select"
                    value={assigneeFilter}
                    onChange={e => setAssigneeFilter(e.target.value)}
                  >
                    <option value="">All Assignees</option>
                    <option value="__unassigned__">Unassigned</option>
                    {admins.map(admin => (
                      <option key={admin.email} value={admin.email}>
                        {admin.full_name || admin.email}
                      </option>
                    ))}
                  </select>
                )}
                <span className="ticket-count">{filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}</span>
              </div>
            )}

            {ticketsLoading ? (
              <p className="support-muted">Loading tickets...</p>
            ) : filteredTickets.length === 0 ? (
              <p className="support-muted">
                {view === 'my' && "You haven't submitted any tickets yet."}
                {view === 'queue' && 'No tickets assigned to you.'}
                {view === 'all' && 'No tickets found.'}
              </p>
            ) : (
              <div className="ticket-list">
                {filteredTickets.map(ticket => {
                  const isExpanded = expandedId === ticket.id;
                  const isSubmitter = ticket.submitted_by === currentEmail;
                  const canComment = isAdmin || isSubmitter;
                  return (
                    <div key={ticket.id} className={`ticket-card ${isExpanded ? 'expanded' : ''}`}>
                      <div
                        className="ticket-card-header"
                        onClick={() => toggleExpand(ticket.id)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="ticket-card-top">
                          <div className="ticket-card-top-left">
                            <span className="ticket-expand-chevron">
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                            {ticket.ticket_number != null && (
                              <span className="ticket-number">{formatTicketNumber(ticket.ticket_number)}</span>
                            )}
                            <span className="ticket-category-badge" style={{ background: CATEGORY_COLORS[ticket.category] || '#6b7280' }}>
                              {ticket.category.replace('_', ' ')}
                            </span>
                            {ticket.tool && (
                              <span className="ticket-tool-label" title={ticket.tool}>· {ticket.tool}</span>
                            )}
                          </div>
                          <div className="ticket-card-top-right">
                            {ticket.assigned_to && (
                              <span className="ticket-assigned-badge" title={ticket.assigned_to}>
                                {ticket.assigned_to_name || ticket.assigned_to}
                              </span>
                            )}
                            {(view === 'all' || view === 'queue') && isAdmin ? (
                              <select
                                className="ticket-status-select"
                                value={ticket.status}
                                onChange={e => handleStatusChange(ticket.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
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
                        </div>
                        <div className="ticket-card-title">{ticket.title}</div>
                        {!isExpanded && (
                          <div className="ticket-card-desc">{ticket.description}</div>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="ticket-card-expanded">
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
                          {(view === 'all' || view === 'queue') && (
                            <div className="ticket-card-meta">
                              <span>By: {ticket.submitted_by_name || ticket.submitted_by}</span>
                            </div>
                          )}

                          {isAdmin && (
                            <div className="ticket-assignee-row">
                              <label className="ticket-assignee-label">Assigned to:</label>
                              <select
                                className="ticket-assignee-select"
                                value={ticket.assigned_to || ''}
                                onChange={e => handleAssigneeChange(ticket.id, e.target.value)}
                              >
                                <option value="">Unassigned</option>
                                {admins.map(admin => (
                                  <option key={admin.email} value={admin.email}>
                                    {admin.full_name || admin.email}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {!isAdmin && ticket.assigned_to && (
                            <div className="ticket-card-meta">
                              <span>Assigned to: {ticket.assigned_to_name || ticket.assigned_to}</span>
                            </div>
                          )}

                          <TicketThread
                            ticketId={ticket.id}
                            canComment={canComment}
                            currentEmail={currentEmail}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
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
