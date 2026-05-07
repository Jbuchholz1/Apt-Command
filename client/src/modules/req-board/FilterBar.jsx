import { useMemo, useState, useRef, useEffect } from 'react';

const STATUSES = [
  'Accepting Candidates', 'Covered', 'Offer Out', 'Placed',
  'Filled', 'Lost', 'Wash', 'Archive',
];

const EMPLOYMENT_TYPES = ['Contract', 'Direct Hire', 'Contract To Hire', 'Project'];
const REMOTE_OPTIONS = ['Yes', 'No', 'Hybrid'];

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const display = selected.length === 0
    ? `All ${label}`
    : selected.length <= 2
      ? selected.join(', ')
      : `${selected.length} selected`;

  return (
    <div className="multi-select" ref={ref}>
      <button className="multi-select-btn" onClick={() => setOpen(!open)}>
        {display} <span className="multi-select-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="multi-select-dropdown">
          {options.map(opt => (
            <label key={opt} className="multi-select-option">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button className="multi-select-clear" onClick={() => onChange([])}>Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function FilterBar({ filters, onChange, jobs, redBoxCount }) {
  const owners = useMemo(() => {
    const set = new Set();
    (jobs || []).forEach(j => { if (j.owner) set.add(j.owner); });
    return [...set].sort();
  }, [jobs]);

  const recruiters = useMemo(() => {
    const set = new Set();
    (jobs || []).forEach(j => { if (j.recruiter) set.add(j.recruiter); });
    return [...set].sort();
  }, [jobs]);

  const clients = useMemo(() => {
    const set = new Set();
    (jobs || []).forEach(j => { if (j.client) set.add(j.client); });
    return [...set].sort();
  }, [jobs]);

  const update = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const activeCount =
    (filters.status?.length || 0) +
    (filters.employmentType?.length || 0) +
    (filters.owner?.length || 0) +
    (filters.recruiter?.length || 0) +
    (filters.client?.length || 0) +
    (filters.remote ? 1 : 0) +
    (filters.calledShot ? 1 : 0) +
    (filters.redBoxes ? 1 : 0);

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label>Status</label>
        <MultiSelect
          label="Statuses"
          options={STATUSES}
          selected={filters.status || []}
          onChange={(val) => update('status', val)}
        />
      </div>

      <div className="filter-group">
        <label>Type</label>
        <MultiSelect
          label="Types"
          options={EMPLOYMENT_TYPES}
          selected={filters.employmentType || []}
          onChange={(val) => update('employmentType', val)}
        />
      </div>

      <div className="filter-group">
        <label>Owner</label>
        <MultiSelect
          label="Owners"
          options={owners}
          selected={filters.owner || []}
          onChange={(val) => update('owner', val)}
        />
      </div>

      <div className="filter-group">
        <label>TR</label>
        <MultiSelect
          label="TRs"
          options={recruiters}
          selected={filters.recruiter || []}
          onChange={(val) => update('recruiter', val)}
        />
      </div>

      <div className="filter-group">
        <label>Client</label>
        <MultiSelect
          label="Clients"
          options={clients}
          selected={filters.client || []}
          onChange={(val) => update('client', val)}
        />
      </div>

      <div className="filter-group">
        <label>Remote</label>
        <select value={filters.remote} onChange={e => update('remote', e.target.value)}>
          <option value="">All</option>
          {REMOTE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="filter-group">
        <label>Called Shots</label>
        <select value={filters.calledShot || ''} onChange={e => update('calledShot', e.target.value)}>
          <option value="">All</option>
          <option value="yes">Called Shots Only</option>
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
          onClick={() => onChange({ status: [], employmentType: [], owner: [], recruiter: [], client: [], remote: '', calledShot: '', redBoxes: '' })}
        >
          Clear filters ({activeCount})
        </button>
      )}
    </div>
  );
}
