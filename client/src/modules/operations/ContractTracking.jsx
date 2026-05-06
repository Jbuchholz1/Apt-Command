import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import {
  getContracts,
  createContract,
  updateContract,
  deleteContract,
  exportContracts,
} from '../../lib/api';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function fmtDate(iso) {
  if (!iso) return '';
  // Postgres `date` columns come back as 'YYYY-MM-DD'. Parse without timezone shifts.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1].slice(-2)}`;
}

function fmtMoney(val) {
  if (val == null || val === '') return '';
  const n = Number(val);
  if (Number.isNaN(n)) return '';
  return currency.format(n);
}

function daysUntil(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000);
}

function isExpiringSoon(c) {
  if (c.cancelled) return false;
  const d = daysUntil(c.contract_end_date);
  return d != null && d >= 0 && d <= 90;
}

function emptyForm() {
  return {
    vendor_name: '',
    contract_start_date: '',
    contract_end_date: '',
    monthly_cost: '',
    yearly_cost: '',
    notice_period_days: '',
    auto_renewing: false,
    cancelled: false,
    contract_link: '',
  };
}

function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
}

export default function ContractTracking() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getContracts();
      setContracts(res?.data || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[ContractTracking] load error:', err);
      setError(err.message || 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setTimeout(() => setRefreshing(false), 400);
  }, [load]);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      await exportContracts();
    } catch (err) {
      console.error('[ContractTracking] export error:', err);
    } finally {
      setExporting(false);
    }
  }, []);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(c) {
    setEditing(c);
    setForm({
      vendor_name: c.vendor_name || '',
      contract_start_date: c.contract_start_date || '',
      contract_end_date: c.contract_end_date || '',
      monthly_cost: c.monthly_cost != null ? String(c.monthly_cost) : '',
      yearly_cost: c.yearly_cost != null ? String(c.yearly_cost) : '',
      notice_period_days: c.notice_period_days != null ? String(c.notice_period_days) : '',
      auto_renewing: !!c.auto_renewing,
      cancelled: !!c.cancelled,
      contract_link: c.contract_link || '',
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
  }

  function setField(name, value) {
    setForm(f => ({ ...f, [name]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.vendor_name.trim()) {
      setFormError('Vendor name is required');
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload = {
      vendor_name: form.vendor_name.trim(),
      contract_start_date: form.contract_start_date || null,
      contract_end_date: form.contract_end_date || null,
      monthly_cost: form.monthly_cost === '' ? null : Number(form.monthly_cost),
      yearly_cost: form.yearly_cost === '' ? null : Number(form.yearly_cost),
      notice_period_days: form.notice_period_days === '' ? null : parseInt(form.notice_period_days, 10),
      auto_renewing: !!form.auto_renewing,
      cancelled: !!form.cancelled,
      contract_link: form.contract_link.trim() || null,
    };

    try {
      if (editing) {
        const res = await updateContract(editing.id, payload);
        const row = res?.data;
        if (row) {
          setContracts(list => list.map(c => (c.id === row.id ? row : c)));
        }
      } else {
        const res = await createContract(payload);
        const row = res?.data;
        if (row) {
          setContracts(list => [row, ...list]);
        }
      }
      setModalOpen(false);
    } catch (err) {
      console.error('[ContractTracking] save error:', err);
      setFormError(err.message || 'Failed to save contract');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c) {
    if (!window.confirm(`Delete contract for "${c.vendor_name}"? This cannot be undone.`)) return;
    const prev = contracts;
    setContracts(list => list.filter(x => x.id !== c.id));
    try {
      await deleteContract(c.id);
    } catch (err) {
      console.error('[ContractTracking] delete error:', err);
      setContracts(prev);
      window.alert(`Failed to delete: ${err.message || 'unknown error'}`);
    }
  }

  return (
    <div className="operations-module">
      <div className="ops-toolbar">
        <div className="ops-toolbar-left">
          <Link to="/operations" className="ops-back-btn"><ArrowLeft size={14} /> Operations</Link>
          <img src="/apt-logo.jpg" alt="APT" className="ops-toolbar-logo" />
          <h1 className="ops-toolbar-title">Contract Tracking</h1>
        </div>
        <div className="ops-toolbar-right">
          {lastRefresh && (
            <span className="ops-last-refresh">
              Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button className="ops-export-btn" onClick={handleExport} disabled={exporting || loading}>
            <Download size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
          <button className="ops-refresh-btn" onClick={handleRefresh} disabled={refreshing || loading}>
            <RefreshCw size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="ops-add-btn" onClick={openAdd}>
            <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
            Add Contract
          </button>
        </div>
      </div>

      <div className="ops-section">
        <div className="ops-section-header">
          <h2 className="ops-section-title">Vendor Contracts</h2>
          <span className="ops-section-count">{contracts.length}</span>
        </div>

        {loading ? (
          <div className="ops-loading">Loading contracts…</div>
        ) : error ? (
          <div className="ops-error">
            <span>Error: {error}</span>
            <button onClick={load}>Retry</button>
          </div>
        ) : contracts.length === 0 ? (
          <div className="ops-empty">
            No contracts yet. Click <strong>+ Add Contract</strong> to create one.
          </div>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table ops-contract-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Monthly</th>
                  <th>Yearly</th>
                  <th>Notice (days)</th>
                  <th>Auto-Renew</th>
                  <th>Cancelled</th>
                  <th>Link</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {contracts.map(c => {
                  const expiring = isExpiringSoon(c);
                  return (
                    <tr key={c.id} className={c.cancelled ? 'ops-row-cancelled' : ''}>
                      <td>
                        <div className="ops-contract-vendor">
                          <span>{c.vendor_name}</span>
                          {expiring && <span className="ops-badge-warn">Expiring Soon</span>}
                        </div>
                      </td>
                      <td>{fmtDate(c.contract_start_date)}</td>
                      <td>{fmtDate(c.contract_end_date)}</td>
                      <td>{fmtMoney(c.monthly_cost)}</td>
                      <td>{fmtMoney(c.yearly_cost)}</td>
                      <td>{c.notice_period_days ?? ''}</td>
                      <td>{c.auto_renewing ? 'Yes' : 'No'}</td>
                      <td>{c.cancelled ? 'Yes' : 'No'}</td>
                      <td className="ops-contract-link-cell">
                        {c.contract_link ? (
                          isHttpUrl(c.contract_link) ? (
                            <a href={c.contract_link} target="_blank" rel="noopener noreferrer" className="ops-bh-link">
                              <ExternalLink size={12} style={{ verticalAlign: -1, marginRight: 3 }} />
                              Open
                            </a>
                          ) : (
                            <span title={c.contract_link}>{c.contract_link}</span>
                          )
                        ) : ''}
                      </td>
                      <td className="ops-table-actions">
                        <button className="ops-icon-btn" onClick={() => openEdit(c)} title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button className="ops-icon-btn ops-icon-btn-danger" onClick={() => handleDelete(c)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="ops-contract-modal-overlay" onClick={closeModal}>
          <div className="ops-contract-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="ops-contract-modal-title">
              {editing ? 'Edit Contract' : 'Add Contract'}
            </h3>
            <form onSubmit={handleSave} className="ops-contract-modal-form">
              <label className="ops-contract-field ops-contract-field-full">
                <span>Vendor Name *</span>
                <input
                  type="text"
                  value={form.vendor_name}
                  onChange={e => setField('vendor_name', e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label className="ops-contract-field">
                <span>Contract Start</span>
                <input
                  type="date"
                  value={form.contract_start_date}
                  onChange={e => setField('contract_start_date', e.target.value)}
                />
              </label>

              <label className="ops-contract-field">
                <span>Contract End</span>
                <input
                  type="date"
                  value={form.contract_end_date}
                  onChange={e => setField('contract_end_date', e.target.value)}
                />
              </label>

              <label className="ops-contract-field">
                <span>Monthly Cost ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.monthly_cost}
                  onChange={e => setField('monthly_cost', e.target.value)}
                />
              </label>

              <label className="ops-contract-field">
                <span>Yearly Cost ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.yearly_cost}
                  onChange={e => setField('yearly_cost', e.target.value)}
                />
              </label>

              <label className="ops-contract-field">
                <span>Notice Period (days)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.notice_period_days}
                  onChange={e => setField('notice_period_days', e.target.value)}
                />
              </label>

              <label className="ops-contract-field ops-contract-field-checkbox">
                <input
                  type="checkbox"
                  checked={form.auto_renewing}
                  onChange={e => setField('auto_renewing', e.target.checked)}
                />
                <span>Auto-Renewing</span>
              </label>

              <label className="ops-contract-field ops-contract-field-checkbox">
                <input
                  type="checkbox"
                  checked={form.cancelled}
                  onChange={e => setField('cancelled', e.target.checked)}
                />
                <span>Cancelled</span>
              </label>

              <label className="ops-contract-field ops-contract-field-full">
                <span>Contract Link</span>
                <input
                  type="text"
                  placeholder="https://..."
                  value={form.contract_link}
                  onChange={e => setField('contract_link', e.target.value)}
                />
              </label>

              {formError && <div className="ops-contract-modal-error">{formError}</div>}

              <div className="ops-contract-modal-actions">
                <button type="button" className="ops-contract-modal-cancel" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="ops-contract-modal-save" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
