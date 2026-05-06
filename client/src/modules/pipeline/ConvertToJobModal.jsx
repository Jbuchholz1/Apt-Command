import { useState, useEffect } from 'react';
import { convertOpportunityToJob, getClientContactsForCorp } from '../../lib/api';
import { saveWithToast } from '../../lib/saveWithToast';
import { showToast } from '../../lib/toast';

const EMPLOYMENT_TYPES = ['Contract', 'Direct Hire', 'Contract To Hire', 'Project'];
const REMOTE_OPTIONS = ['No', 'Yes', 'Hybrid'];

function fmtCurrency(val) {
  if (val == null) return '—';
  return `$${Math.round(Number(val)).toLocaleString('en-US')}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit', timeZone: 'America/Chicago',
  });
}

export default function ConvertToJobModal({ opportunity, onClose, onSuccess }) {
  const [form, setForm] = useState({
    employmentType: 'Contract',
    numOpenings: 1,
    remote: 'No',
    payRate: '',
    clientBillRate: '',
    salary: '',
    salaryHigh: '',
    clientContactId: '',
  });
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const corpId = opportunity?.clientCorporationId;

  useEffect(() => {
    if (!corpId) return;
    setContactsLoading(true);
    getClientContactsForCorp(corpId)
      .then(res => setContacts(res?.data || []))
      .catch(err => {
        console.error('Failed to load client contacts:', err);
        setContacts([]);
      })
      .finally(() => setContactsLoading(false));
  }, [corpId]);

  if (!opportunity) return null;

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!form.employmentType) {
      showToast('Employment Type is required');
      return;
    }
    const openings = parseInt(form.numOpenings, 10);
    if (!Number.isFinite(openings) || openings < 1) {
      showToast('# Openings must be at least 1');
      return;
    }

    setSubmitting(true);
    const body = {
      employmentType: form.employmentType,
      numOpenings: openings,
      remote: form.remote,
    };
    if (form.payRate !== '') body.payRate = Number(form.payRate);
    if (form.clientBillRate !== '') body.clientBillRate = Number(form.clientBillRate);
    if (form.salary !== '') body.salary = Number(form.salary);
    if (form.salaryHigh !== '') body.salaryHigh = Number(form.salaryHigh);
    if (form.clientContactId) body.clientContactId = parseInt(form.clientContactId, 10);

    const result = await saveWithToast(
      () => convertOpportunityToJob(opportunity.id, body),
      { failureMessage: 'Could not convert opportunity' },
    );

    setSubmitting(false);
    if (result.ok) {
      const jobId = result.data?.jobOrderId;
      showToast(`Created JobOrder #${jobId}. Opportunity closed as Closed-Won.`);
      if (result.data?.warnings?.length) {
        console.warn('Convert warnings:', result.data.warnings);
      }
      onSuccess?.(jobId, opportunity.id);
    }
  };

  return (
    <div className="convert-modal-overlay" onClick={onClose}>
      <div className="convert-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="convert-modal-title">Convert Opportunity to Job</h3>

        <div className="convert-modal-summary">
          <div><span className="convert-modal-label">Title</span><span>{opportunity.title || '—'}</span></div>
          <div><span className="convert-modal-label">Client</span><span>{opportunity.client || '—'}</span></div>
          <div><span className="convert-modal-label">Owner</span><span>{opportunity.owner || '—'}</span></div>
          <div><span className="convert-modal-label">Deal Value</span><span>{fmtCurrency(opportunity.dealValue)}</span></div>
          <div><span className="convert-modal-label">Close Date</span><span>{fmtDate(opportunity.expectedCloseDate)}</span></div>
        </div>

        <form onSubmit={handleSubmit} className="convert-modal-form">
          <div className="convert-modal-row">
            <label>
              <span>Employment Type <em>*</em></span>
              <select value={form.employmentType} onChange={(e) => update('employmentType', e.target.value)}>
                {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              <span># Openings <em>*</em></span>
              <input type="number" min="1" value={form.numOpenings} onChange={(e) => update('numOpenings', e.target.value)} />
            </label>
            <label>
              <span>Remote</span>
              <select value={form.remote} onChange={(e) => update('remote', e.target.value)}>
                {REMOTE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>

          <div className="convert-modal-row">
            <label>
              <span>Pay Rate</span>
              <input type="number" step="0.01" value={form.payRate} onChange={(e) => update('payRate', e.target.value)} placeholder="hourly" />
            </label>
            <label>
              <span>Bill Rate</span>
              <input type="number" step="0.01" value={form.clientBillRate} onChange={(e) => update('clientBillRate', e.target.value)} placeholder="hourly" />
            </label>
            <label>
              <span>Salary Low</span>
              <input type="number" step="1000" value={form.salary} onChange={(e) => update('salary', e.target.value)} placeholder="annual" />
            </label>
            <label>
              <span>Salary High</span>
              <input type="number" step="1000" value={form.salaryHigh} onChange={(e) => update('salaryHigh', e.target.value)} placeholder="annual" />
            </label>
          </div>

          <div className="convert-modal-row">
            <label style={{ flex: 1 }}>
              <span>Client Contact</span>
              <select value={form.clientContactId} onChange={(e) => update('clientContactId', e.target.value)} disabled={contactsLoading}>
                <option value="">{contactsLoading ? 'Loading…' : '— None —'}</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name || `${c.firstName} ${c.lastName}`.trim() || `Contact #${c.id}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="convert-modal-actions">
            <button type="button" className="convert-modal-cancel" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="convert-modal-primary" disabled={submitting}>
              {submitting ? 'Converting…' : 'Convert to Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
