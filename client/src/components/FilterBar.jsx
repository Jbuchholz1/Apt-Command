import { useMemo } from 'react';

const STATUSES = [
  'Accepting Candidates', 'Covered', 'Offer Out', 'Placed',
  'Filled', 'Lost', 'Wash', 'Archive',
];

const EMPLOYMENT_TYPES = ['Contract', 'Direct Hire', 'Contract To Hire', 'Project'];
const REMOTE_OPTIONS = ['Yes', 'No', 'Hybrid'];

export default function FilterBar({ filters, onChange, jobs, redBoxCount }) {
  // Build unique owner list from current jobs
  const owners = useMemo(() => {
    const set = new Set();
    (jobs || []).forEach(j => { if (j.owner) set.add(j.owner); });
    return [...set].sort();
  }, [jobs]);

  const update = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const activeCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label>Status</label>
        <select value={filters.status} onChange={e => update('status', e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="filter-group">
        <label>Type</label>
        <select value={filters.employmentType} onChange={e => update('employmentType', e.target.value)}>
          <option value="">All Types</option>
          {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="filter-group">
        <label>Owner</label>
        <select value={filters.owner} onChange={e => update('owner', e.target.value)}>
          <option value="">All Owners</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div className="filter-group">
        <label>Remote</label>
        <select value={filters.remote} onChange={e => update('remote', e.target.value)}>
          <option value="">All</option>
          {REMOTE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="filter-group">
        <label>Alerts</label>
        <select value={filters.redBoxes || ''} onChange={e => update('redBoxes', e.target.value)}>
          <option value="">All</option>
          <option value="red">Red Boxes{redBoxCount != null ? ` (${redBoxCount})` : ''}</option>
        </select>
      </div>

      {activeCount > 0 && (
        <button
          className="filter-clear"
          onClick={() => onChange({ status: '', employmentType: '', owner: '', remote: '', redBoxes: '' })}
        >
          Clear filters ({activeCount})
        </button>
      )}
    </div>
  );
}
