import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ExternalLink, Pencil } from 'lucide-react';
import {
  getCOIRecords,
  createCOIRecord,
  updateCOIRecord,
  deleteCOIRecord,
} from '../../lib/api';
import { showToast } from '../../lib/toast';

function fmtDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1].slice(-2)}`;
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

function expiryStatus(iso) {
  const d = daysUntil(iso);
  if (d == null) return null;
  if (d < 0) return 'expired';
  if (d <= 30) return 'expiring';
  return null;
}

function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
}

function emptyForm() {
  return {
    client_name: '',
    coi_link: '',
    expiration_date: '',
  };
}

export default function COITracking() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await getCOIRecords();
      setRecords(res.data || []);
      setError(null);
    } catch (err) {
      console.error('[COITracking] fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(r) {
    setEditing(r);
    setForm({
      client_name: r.client_name || '',
      coi_link: r.coi_link || '',
      expiration_date: r.expiration_date || '',
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
    if (!form.client_name.trim()) {
      setFormError('Client name is required');
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload = {
      client_name: form.client_name.trim(),
      coi_link: form.coi_link.trim() || null,
      expiration_date: form.expiration_date || null,
    };

    try {
      if (editing) {
        const res = await updateCOIRecord(editing.id, payload);
        const row = res?.data;
        if (row) {
          setRecords(list => list.map(r => (r.id === row.id ? row : r)));
        }
      } else {
        const res = await createCOIRecord(payload);
        const row = res?.data;
        if (row) {
          setRecords(list => [row, ...list]);
        }
      }
      setModalOpen(false);
    } catch (err) {
      console.error('[COITracking] save error:', err);
      setFormError(err.message || 'Failed to save COI record');
    } finally {
      setSaving(false);
    }
  }

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete COI record for "${r.client_name || 'this client'}"? This cannot be undone.`)) return;
    const snapshot = records;
    setRecords(prev => prev.filter(x => x.id !== r.id));
    try {
      await deleteCOIRecord(r.id);
    } catch (err) {
      console.error('[COITracking] delete error:', err);
      showToast('Failed to delete: ' + err.message);
      setRecords(snapshot);
    }
  };

  return (
    <div className="operations-module">
      <div className="ops-toolbar">
        <div className="ops-toolbar-left">
          <Link to="/operations" className="ops-back-btn"><ArrowLeft size={14} /> Operations</Link>
          <img src="/apt-logo.jpg" alt="Apt" className="ops-toolbar-logo" />
          <h1 className="ops-toolbar-title">COI Tracking</h1>
        </div>
        <div className="ops-toolbar-right">
          <button className="ops-add-btn" onClick={openAdd}>
            <Plus size={14} /> Add COI
          </button>
        </div>
      </div>

      {loading ? (
        <div className="ops-loading">Loading COI records...</div>
      ) : error ? (
        <div className="ops-error">
          <span>Failed to load COI records: {error}</span>
          <button onClick={fetchData}>Retry</button>
        </div>
      ) : (
        <div className="ops-section">
          <div className="ops-section-header">
            <h3 className="ops-section-title">COI Records</h3>
            <span className="ops-section-count">{records.length}</span>
          </div>

          {records.length === 0 ? (
            <div className="ops-empty">
              No COI records yet. Click <strong>+ Add COI</strong> to add your first one.
            </div>
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table ops-contract-table">
                <thead>
                  <tr>
                    <th>Client Name</th>
                    <th>Link to COI</th>
                    <th>Expiration Date</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => {
                    const status = expiryStatus(r.expiration_date);
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="ops-contract-vendor">
                            <span>{r.client_name || '—'}</span>
                            {status === 'expiring' && <span className="ops-badge-warn">Expiring Soon</span>}
                            {status === 'expired' && <span className="ops-badge-danger">Expired</span>}
                          </div>
                        </td>
                        <td className="ops-contract-link-cell">
                          {r.coi_link ? (
                            isHttpUrl(r.coi_link) ? (
                              <a href={r.coi_link} target="_blank" rel="noopener noreferrer" className="ops-bh-link">
                                <ExternalLink size={12} style={{ verticalAlign: -1, marginRight: 3 }} />
                                Open
                              </a>
                            ) : (
                              <span title={r.coi_link}>{r.coi_link}</span>
                            )
                          ) : ''}
                        </td>
                        <td>{fmtDate(r.expiration_date)}</td>
                        <td className="ops-table-actions">
                          <button className="ops-icon-btn" onClick={() => openEdit(r)} title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button className="ops-icon-btn ops-icon-btn-danger" onClick={() => handleDelete(r)} title="Delete">
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
      )}

      {modalOpen && (
        <div className="ops-contract-modal-overlay" onClick={closeModal}>
          <div className="ops-contract-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="ops-contract-modal-title">
              {editing ? 'Edit COI Record' : 'Add COI Record'}
            </h3>
            <form onSubmit={handleSave} className="ops-contract-modal-form">
              <label className="ops-contract-field ops-contract-field-full">
                <span>Client Name *</span>
                <input
                  type="text"
                  value={form.client_name}
                  onChange={e => setField('client_name', e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label className="ops-contract-field ops-contract-field-full">
                <span>Expiration Date</span>
                <input
                  type="date"
                  value={form.expiration_date}
                  onChange={e => setField('expiration_date', e.target.value)}
                />
              </label>

              <label className="ops-contract-field ops-contract-field-full">
                <span>COI Link</span>
                <input
                  type="text"
                  placeholder="https://..."
                  value={form.coi_link}
                  onChange={e => setField('coi_link', e.target.value)}
                />
              </label>

              {formError && <div className="ops-contract-modal-error">{formError}</div>}

              <div className="ops-contract-modal-actions">
                <button type="button" className="ops-contract-modal-cancel" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="ops-contract-modal-save" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create COI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
