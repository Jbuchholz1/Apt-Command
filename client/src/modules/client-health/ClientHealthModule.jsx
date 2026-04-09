import { useState, useEffect, useCallback, useMemo } from 'react';
import './client-health.css';
import { getClientHealth } from '../../lib/api';

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);

  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const display = selected.length === 0 ? `All ${label}` : `${selected.length} selected`;

  return (
    <div className="ch-multi-select" onMouseLeave={() => setOpen(false)}>
      <label className="ch-filter-label">{label}</label>
      <button className="ch-multi-btn" onClick={() => setOpen(!open)}>
        <span>{display}</span>
        <span className="ch-multi-arrow">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="ch-multi-dropdown">
          {options.map(opt => (
            <label key={opt} className="ch-multi-option">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              <span>{opt}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button className="ch-multi-clear" onClick={() => onChange([])}>Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

const HEALTH_ORDER = { red: 0, yellow: 1, green: 2 };
const HEALTH_LABELS = { green: 'Healthy', yellow: 'At Risk', red: 'Needs Attention' };

export default function ClientHealthModule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ clients: [], owners: [] });
  const [sortKey, setSortKey] = useState('health');
  const [sortDir, setSortDir] = useState('asc');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClientHealth();
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const clientOptions = useMemo(() => {
    if (!data?.clients) return [];
    return [...new Set(data.clients.map(c => c.name))].sort();
  }, [data]);

  const ownerOptions = useMemo(() => {
    if (!data?.clients) return [];
    const owners = new Set();
    data.clients.forEach(c => c.owners.forEach(o => owners.add(o)));
    return [...owners].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.clients) return [];
    return data.clients.filter(c => {
      if (filters.clients.length && !filters.clients.includes(c.name)) return false;
      if (filters.owners.length && !c.owners.some(o => filters.owners.includes(o))) return false;
      return true;
    });
  }, [data, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av, bv;
      if (sortKey === 'health') { av = HEALTH_ORDER[a.health]; bv = HEALTH_ORDER[b.health]; }
      else if (sortKey === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const summary = useMemo(() => {
    const s = { green: 0, yellow: 0, red: 0, total: 0 };
    filtered.forEach(c => { s[c.health]++; s.total++; });
    return s;
  }, [filtered]);

  const sortIcon = (key) => sortKey === key ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : '';

  return (
    <div className="client-health-module">
      <div className="ch-toolbar">
        <h2 className="ch-toolbar-title">Client Health</h2>
        <button className="refresh-btn" onClick={fetchData} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="ch-filters">
        <MultiSelect label="Clients" options={clientOptions} selected={filters.clients}
          onChange={(v) => setFilters(f => ({ ...f, clients: v }))} />
        <MultiSelect label="Owners" options={ownerOptions} selected={filters.owners}
          onChange={(v) => setFilters(f => ({ ...f, owners: v }))} />
        {(filters.clients.length > 0 || filters.owners.length > 0) && (
          <button className="ch-clear-btn" onClick={() => setFilters({ clients: [], owners: [] })}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div className="ch-summary">
        <span className="ch-summary-item ch-green">{summary.green} Healthy</span>
        <span className="ch-summary-item ch-yellow">{summary.yellow} At Risk</span>
        <span className="ch-summary-item ch-red">{summary.red} Needs Attention</span>
        <span className="ch-summary-total">{summary.total} clients</span>
      </div>

      {error && (
        <div className="error-banner">
          Failed to load data: {error}
          <button onClick={fetchData}>Retry</button>
        </div>
      )}

      {loading && !data && (
        <div className="ch-loading">Loading client health data...</div>
      )}

      {data && (
        <div className="ch-table-wrap">
          <table className="ch-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('health')}>Health{sortIcon('health')}</th>
                <th className="sortable" onClick={() => handleSort('name')}>Client{sortIcon('name')}</th>
                <th className="sortable" onClick={() => handleSort('activePlacements')}>Active Placements{sortIcon('activePlacements')}</th>
                <th className="sortable" onClick={() => handleSort('recentActivities')}>Activities (14d){sortIcon('recentActivities')}</th>
                <th className="sortable" onClick={() => handleSort('effectiveScore')}>Score{sortIcon('effectiveScore')}</th>
                <th>Owners</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => (
                <tr key={c.id} className={`ch-row ch-row-${c.health}`}>
                  <td><span className={`ch-dot ch-dot-${c.health}`} title={HEALTH_LABELS[c.health]}></span></td>
                  <td className="ch-client-name">{c.name}</td>
                  <td className="ch-num">{c.activePlacements}</td>
                  <td className="ch-num">{c.recentActivities}</td>
                  <td className="ch-num">{c.effectiveScore}</td>
                  <td className="ch-owners">{c.owners.join(', ')}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan="6" className="ch-empty">No clients match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
