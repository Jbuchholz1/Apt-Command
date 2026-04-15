import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Clock, AlertTriangle, Send } from 'lucide-react';
import { IT_CONTACT, ESCALATION_PATH } from './lib/supportData';
import { submitSupportTicket } from '../../lib/api';
import { showToast } from '../../lib/toast';

export default function ITSupport() {
  const [form, setForm] = useState({ title: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', 'issue');
      formData.append('title', form.title.trim());
      formData.append('description', form.description.trim());

      await submitSupportTicket(formData);
      showToast('IT support ticket submitted!');
      setForm({ title: '', description: '' });
      setSubmitted(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="support-page">
      <div className="support-toolbar">
        <Link to="/support" className="support-back-btn"><ArrowLeft size={16} /> Support</Link>
        <h2 className="support-toolbar-title">IT Support</h2>
      </div>

      <div className="support-page-body">
        {/* Contact Card */}
        <div className="it-contact-card">
          <h3 className="it-card-title">Contact Information</h3>
          <div className="it-contact-rows">
            {IT_CONTACT.email && (
              <div className="it-contact-row">
                <Mail size={16} />
                <a href={`mailto:${IT_CONTACT.email}`}>{IT_CONTACT.email}</a>
              </div>
            )}
            {IT_CONTACT.phone && (
              <div className="it-contact-row">
                <Phone size={16} />
                <a href={`tel:${IT_CONTACT.phone}`}>{IT_CONTACT.phone}</a>
              </div>
            )}
            {IT_CONTACT.hours && (
              <div className="it-contact-row">
                <Clock size={16} />
                <span>{IT_CONTACT.hours}</span>
              </div>
            )}
          </div>
        </div>

        {/* Escalation Path */}
        <div className="escalation-section">
          <h3 className="faq-section-title">Escalation Path</h3>
          <div className="escalation-steps">
            {ESCALATION_PATH.map(step => (
              <div key={step.level} className="escalation-step">
                <div className="escalation-badge">
                  <AlertTriangle size={14} />
                  <span>Tier {step.level}</span>
                </div>
                <div className="escalation-body">
                  <h4 className="escalation-title">{step.title}</h4>
                  <p className="escalation-desc">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Ticket Form */}
        <div className="it-quick-ticket">
          <h3 className="faq-section-title">Submit a Quick Ticket</h3>
          {submitted ? (
            <div className="it-ticket-success">
              <p>Your ticket has been submitted. You can track it on the <Link to="/support/feedback">Bug & Feedback</Link> page.</p>
              <button className="it-another-btn" onClick={() => setSubmitted(false)}>Submit Another</button>
            </div>
          ) : (
            <form className="it-ticket-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">What do you need help with?</label>
                <input
                  type="text"
                  placeholder="Brief summary"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  maxLength={200}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Details</label>
                <textarea
                  placeholder="Describe your issue or question"
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  required
                />
              </div>
              <button type="submit" className="feedback-submit-btn" disabled={submitting}>
                <Send size={14} /> {submitting ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
