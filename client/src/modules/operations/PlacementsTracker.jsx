import { useState, useEffect, useCallback } from 'react';
import { getOperationsPlacements, updatePlacementChecklist } from '../../lib/api';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const CHECKBOX_FIELDS = [
  { key: 'ob_paperwork_complete', label: 'OB Paperwork' },
  { key: 'new_hire_filed', label: 'New Hire Filed' },
];

const DATE_FIELDS = [
  { key: 'healthcare_effective_date', label: 'HC Effective Date' },
  { key: 'healthcare_payroll_deduction_date', label: 'HC Payroll Ded.' },
];

const CHECKBOX_FIELDS_2 = [
  { key: 'enrolled_in_healthcare', label: 'Enrolled HC' },
  { key: 'added_to_payroll', label: 'Added Payroll' },
  { key: 'four01k_opt_in', label: '401k Opt In' },
  { key: 'four01k_forms_received', label: '401k Forms' },
  { key: 'added_to_census', label: 'Added Census' },
];

const ALL_CHECK_KEYS = [
  ...CHECKBOX_FIELDS.map(f => f.key),
  ...CHECKBOX_FIELDS_2.map(f => f.key),
];

function formatType(type) {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes('contract') && t.includes('hire')) return { label: 'C2H', cls: 'ops-type-c2h' };
  if (t.includes('contract')) return { label: 'Contract', cls: 'ops-type-contract' };
  if (t.includes('direct')) return { label: 'Direct', cls: 'ops-type-direct' };
  if (t.includes('project')) return { label: 'Project', cls: 'ops-type-project' };
  return { label: type, cls: 'ops-type-contract' };
}

function toInputDate(val) {
  if (!val) return '';
  try {
    return new Date(val).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function isRowComplete(p) {
  return ALL_CHECK_KEYS.every(k => p[k]);
}

export default function PlacementsTracker() {
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await getOperationsPlacements();
      setPlacements(res.data || []);
      setError(null);
    } catch (err) {
      console.error('[PlacementsTracker] fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCheckToggle = async (placementId, field, currentValue) => {
    // Optimistic update
    setPlacements(prev =>
      prev.map(p => p.id === placementId ? { ...p, [field]: !currentValue } : p)
    );

    try {
      await updatePlacementChecklist(placementId, { [field]: !currentValue });
    } catch (err) {
      console.error('[PlacementsTracker] toggle error:', err);
      // Revert
      setPlacements(prev =>
        prev.map(p => p.id === placementId ? { ...p, [field]: currentValue } : p)
      );
    }
  };

  const handleDateChange = async (placementId, field, newValue) => {
    const dateVal = newValue || null;

    // Optimistic update
    setPlacements(prev =>
      prev.map(p => p.id === placementId ? { ...p, [field]: dateVal } : p)
    );

    try {
      await updatePlacementChecklist(placementId, { [field]: dateVal });
    } catch (err) {
      console.error('[PlacementsTracker] date error:', err);
      fetchData(); // Re-fetch on error to get correct state
    }
  };

  if (loading) {
    return <div className="ops-loading">Loading placements...</div>;
  }

  if (error) {
    return (
      <div className="ops-error">
        <span>Failed to load placements: {error}</span>
        <button onClick={fetchData}>Retry</button>
      </div>
    );
  }

  if (!placements.length) {
    return <div className="ops-empty">No pending or approved placements found.</div>;
  }

  return (
    <div className="ops-section">
      <div className="ops-section-header">
        <h3 className="ops-section-title">Placements</h3>
        <span className="ops-section-count">{placements.length} placement{placements.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>AM</th>
              <th>TR</th>
              <th>Placement Name</th>
              {CHECKBOX_FIELDS.map(f => (
                <th key={f.key} className="ops-check-col">{f.label}</th>
              ))}
              {DATE_FIELDS.map(f => (
                <th key={f.key}>{f.label}</th>
              ))}
              {CHECKBOX_FIELDS_2.map(f => (
                <th key={f.key} className="ops-check-col">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {placements.map(p => {
              const typeInfo = formatType(p.employmentType);
              const complete = isRowComplete(p);
              return (
                <tr key={p.id} className={complete ? 'ops-row-complete' : ''}>
                  <td>
                    {typeInfo
                      ? <span className={`ops-type-badge ${typeInfo.cls}`}>{typeInfo.label}</span>
                      : '—'}
                  </td>
                  <td>{p.am}</td>
                  <td>{p.tr}</td>
                  <td><strong>{p.candidate || '—'}</strong></td>
                  {CHECKBOX_FIELDS.map(f => (
                    <td key={f.key} className="ops-check-cell">
                      <input
                        type="checkbox"
                        className="ops-checkbox"
                        checked={!!p[f.key]}
                        onChange={() => handleCheckToggle(p.id, f.key, p[f.key])}
                      />
                    </td>
                  ))}
                  {DATE_FIELDS.map(f => (
                    <td key={f.key} className="ops-date-cell">
                      <input
                        type="date"
                        className="ops-date-input"
                        value={toInputDate(p[f.key])}
                        onChange={(e) => handleDateChange(p.id, f.key, e.target.value)}
                      />
                    </td>
                  ))}
                  {CHECKBOX_FIELDS_2.map(f => (
                    <td key={f.key} className="ops-check-cell">
                      <input
                        type="checkbox"
                        className="ops-checkbox"
                        checked={!!p[f.key]}
                        onChange={() => handleCheckToggle(p.id, f.key, p[f.key])}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
