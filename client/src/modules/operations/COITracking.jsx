import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ExternalLink } from 'lucide-react';
import {
  getCOIRecords,
  createCOIRecord,
  updateCOIRecord,
  deleteCOIRecord,
} from '../../lib/api';
import { showToast } from '../../lib/toast';

const MS_PER_DAY = 86400000;

function rowHighlightClass(expirationDate) {
  if (!expirationDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate + 'T00:00:00');
  if (Number.isNaN(exp.getTime())) return '';
  const days = Math.floor((exp - today) / MS_PER_DAY);
  if (days < 0) return 'ops-row-coi-expired';
  if (days <= 30) return 'ops-row-coi-expiring';
  return '';
}

function isLikelyUrl(val) {
  if (!val) return false;
  return /^https?:\/\//i.test(val.trim());
}

export default function COITracking() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState(null);
  const newRowInputRef = useRef(null);

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

  // Focus the new row's client-name input exactly once after creation.
  useEffect(() => {
    if (justCreatedId && newRowInputRef.current) {
      newRowInputRef.current.focus();
      setJustCreatedId(null);
    }
  }, [justCreatedId]);

  const handleAdd = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const res = await createCOIRecord({
        client_name: '',
        coi_link: '',
        expiration_date: null,
      });
      const created = res.data;
      if (created) {
        setRecords(prev => [created, ...prev]);
        setJustCreatedId(created.id);
      }
    } catch (err) {
      console.error('[COITracking] add error:', err);
      showToast('Failed to add COI record: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleLocalChange = (id, field, value) => {
    setRecords(prev =>
      prev.map(r => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  // Always send the latest input value on blur. The previous oldValue check
  // could not work for text inputs because typing already mutated the closure's
  // record before blur fired.
  const handleFieldCommit = async (id, field, newValue) => {
    try {
      const res = await updateCOIRecord(id, { [field]: newValue });
      if (res.data) {
        setRecords(prev =>
          prev.map(r => (r.id === id ? res.data : r)),
        );
      }
    } catch (err) {
      console.error('[COITracking] update error:', err);
      showToast(`Failed to save ${field.replace(/_/g, ' ')}: ${err.message}`);
      // Re-fetch so the visible state matches what's actually persisted.
      fetchData();
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this COI record?')) return;
    const snapshot = records;
    setRecords(prev => prev.filter(r => r.id !== id));
    try {
      await deleteCOIRecord(id);
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
          <img src="/apt-logo.jpg" alt="APT" className="ops-toolbar-logo" />
          <h1 className="ops-toolbar-title">COI Tracking</h1>
        </div>
        <div className="ops-toolbar-right">
          <button
            className="ops-add-btn"
            onClick={handleAdd}
            disabled={adding}
          >
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
            <span className="ops-section-count">
              {records.length} record{records.length !== 1 ? 's' : ''}
            </span>
          </div>

          {records.length === 0 ? (
            <div className="ops-empty">
              No COI records yet. Click <strong>+ Add COI</strong> to add your first one.
            </div>
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>Client Name</th>
                    <th style={{ minWidth: 260 }}>Link to COI</th>
                    <th style={{ minWidth: 140 }}>Expiration Date</th>
                    <th style={{ width: 60, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const rowCls = rowHighlightClass(r.expiration_date);
                    return (
                      <tr key={r.id} className={rowCls}>
                        <td>
                          <input
                            ref={r.id === justCreatedId ? newRowInputRef : null}
                            type="text"
                            className="ops-text-input"
                            value={r.client_name || ''}
                            onChange={(e) => handleLocalChange(r.id, 'client_name', e.target.value)}
                            onBlur={(e) => handleFieldCommit(r.id, 'client_name', e.target.value)}
                            placeholder="Client name"
                          />
                        </td>
                        <td>
                          <div className="ops-coi-link-cell">
                            <input
                              type="text"
                              className="ops-text-input"
                              value={r.coi_link || ''}
                              onChange={(e) => handleLocalChange(r.id, 'coi_link', e.target.value)}
                              onBlur={(e) => handleFieldCommit(r.id, 'coi_link', e.target.value)}
                              placeholder="https://..."
                            />
                            {isLikelyUrl(r.coi_link) && (
                              <a
                                href={r.coi_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ops-coi-link-open"
                                title="Open link"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="ops-date-cell">
                          <input
                            type="date"
                            className="ops-date-input"
                            value={r.expiration_date || ''}
                            onChange={(e) => {
                              const newVal = e.target.value || null;
                              handleLocalChange(r.id, 'expiration_date', newVal);
                              handleFieldCommit(r.id, 'expiration_date', newVal);
                            }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="ops-icon-btn"
                            onClick={() => handleDelete(r.id)}
                            title="Delete record"
                          >
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
    </div>
  );
}
