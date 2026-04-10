import { useState, useRef, useEffect } from 'react';

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const display = selected.length === 0 ? `All ${label}` : `${selected.length} selected`;

  return (
    <div className="dash-multi-select" ref={ref}>
      <label className="dash-filter-label">{label}</label>
      <button className="dash-multi-btn" onClick={() => setOpen(!open)}>
        <span>{display}</span>
        <span className="dash-multi-arrow">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="dash-multi-dropdown">
          {options.map(opt => (
            <label key={opt} className="dash-multi-option">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              <span>{opt}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button className="dash-multi-clear" onClick={() => onChange([])}>Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardFilters({ filters, onChange, recruiterOptions, clientOptions, recruiterLabel }) {
  return (
    <div className="dashboard-filters">
      <MultiSelect
        label={recruiterLabel || "Recruiters"}
        options={recruiterOptions}
        selected={filters.recruiters}
        onChange={(val) => onChange({ ...filters, recruiters: val })}
      />
      <MultiSelect
        label="Clients"
        options={clientOptions}
        selected={filters.clients}
        onChange={(val) => onChange({ ...filters, clients: val })}
      />
      {(filters.recruiters.length > 0 || filters.clients.length > 0) && (
        <button className="dash-filter-clear" onClick={() => onChange({ recruiters: [], clients: [] })}>
          Clear Filters
        </button>
      )}
    </div>
  );
}
