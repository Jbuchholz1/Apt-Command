import { useState, useEffect, useCallback, useMemo } from 'react';
import './client-health.css';
import { getClientHealth, getCompanyKPIs } from '../../lib/api';
import GaugeCard from './GaugeCard';
import DateRangePicker from '../reporting/components/DateRangePicker';
import ModuleSplash from '../../components/ModuleSplash';

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

function getDefaultDates() {
  const now = new Date();
  const qMonth = Math.floor(now.getMonth() / 3) * 3;
  const qStart = new Date(now.getFullYear(), qMonth, 1);
  return {
    start: qStart.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

export default function ClientHealthModule() {
  const [showSplash, setShowSplash] = useState(true);
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [data, setData] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [gaugeModal, setGaugeModal] = useState(null);
  const [placementModal, setPlacementModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ clients: [], owners: [] });
  const [healthFilter, setHealthFilter] = useState(null);
  const [sortKey, setSortKey] = useState('health');
  const [sortDir, setSortDir] = useState('desc');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, kpiRes] = await Promise.all([
        getClientHealth(startDate, endDate),
        getCompanyKPIs(startDate, endDate),
      ]);
      setData(res);
      setKpis(kpiRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Refetch KPIs when health filter changes to scope to those clients
  useEffect(() => {
    if (!data?.clients) return;
    const filteredClients = healthFilter
      ? data.clients.filter(c => c.health === healthFilter)
      : data.clients;
    // Apply client/owner filters too
    const scopedClients = filteredClients.filter(c => {
      if (filters.clients.length && !filters.clients.includes(c.name)) return false;
      if (filters.owners.length && !c.owners.some(o => filters.owners.includes(o))) return false;
      return true;
    });
    const ids = scopedClients.map(c => c.id);
    const needsFilter = healthFilter || filters.clients.length > 0 || filters.owners.length > 0;
    getCompanyKPIs(startDate, endDate, needsFilter ? ids : null)
      .then(setKpis)
      .catch(() => {});
  }, [healthFilter, filters, data, startDate, endDate]);

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
      if (healthFilter && c.health !== healthFilter) return false;
      return true;
    });
  }, [data, filters, healthFilter]);

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

  // Summary counts from client+owner filtered (but NOT health filtered)
  const baseFiltered = useMemo(() => {
    if (!data?.clients) return [];
    return data.clients.filter(c => {
      if (filters.clients.length && !filters.clients.includes(c.name)) return false;
      if (filters.owners.length && !c.owners.some(o => filters.owners.includes(o))) return false;
      return true;
    });
  }, [data, filters]);

  const summary = useMemo(() => {
    const s = { green: 0, yellow: 0, red: 0, total: 0 };
    baseFiltered.forEach(c => { s[c.health]++; s.total++; });
    return s;
  }, [baseFiltered]);

  const toggleHealthFilter = (health) => {
    setHealthFilter(prev => prev === health ? null : health);
  };

  const sortIcon = (key) => sortKey === key ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : '';

  if (showSplash) {
    return <ModuleSplash
      text="Am I doing everything I need to do to keep my business moving forward and the people around me happy?"
      hashtag="#HereToPartnerHereToServe"
      onComplete={() => setShowSplash(false)}
    />;
  }

  return (
    <div className="client-health-module">
      <div className="ch-toolbar">
        <h2 className="ch-toolbar-title">APT Health</h2>
        <div className="ch-toolbar-right">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />
          <button className="refresh-btn" onClick={fetchData} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* KPI Gauges */}
      {kpis && (
        <div className="kpi-gauges">
          {kpis.gauges.map((g, i) => (
            <GaugeCard key={i} {...g} onClick={(label, details) => setGaugeModal({ label, details })} />
          ))}
          <div className="kpi-quarter">{kpis.quarter}</div>
        </div>
      )}

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
        <button className={`ch-summary-item ch-green ${healthFilter === 'green' ? 'active' : ''}`} onClick={() => toggleHealthFilter('green')}>{summary.green} Healthy</button>
        <button className={`ch-summary-item ch-yellow ${healthFilter === 'yellow' ? 'active' : ''}`} onClick={() => toggleHealthFilter('yellow')}>{summary.yellow} At Risk</button>
        <button className={`ch-summary-item ch-red ${healthFilter === 'red' ? 'active' : ''}`} onClick={() => toggleHealthFilter('red')}>{summary.red} Needs Attention</button>
        {healthFilter && <button className="ch-clear-health" onClick={() => setHealthFilter(null)}>Show All</button>}
        <span className="ch-summary-total">{filtered.length}{healthFilter ? ` of ${summary.total}` : ''} clients</span>
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
                  <td className={`ch-num ${c.placementDetails?.length > 0 ? 'clickable-cell' : ''}`}
                    onClick={() => c.placementDetails?.length > 0 && setPlacementModal({ clientName: c.name, details: c.placementDetails })}
                  >{c.activePlacements}</td>
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

      {/* Gauge Detail Modal */}
      {gaugeModal && (
        <div className="gauge-modal-overlay" onClick={() => setGaugeModal(null)}>
          <div className="gauge-modal" onClick={e => e.stopPropagation()}>
            <div className="gauge-modal-header">
              <h3>{gaugeModal.label}</h3>
              <button className="modal-close" onClick={() => setGaugeModal(null)}>&times;</button>
            </div>
            <div className="gauge-modal-body">
              <table className="gauge-modal-table">
                <thead>
                  <tr>
                    {gaugeModal.label === 'MAR Total' && <><th>Person</th><th>Role</th><th>MAR</th></>}
                    {gaugeModal.label === 'Input' && <><th>Job</th><th>Client</th><th>Type</th><th>AM</th><th>Input</th></>}
                    {gaugeModal.label.includes('Fill Ratio') && <><th>Job</th><th>Priority</th><th>Openings</th><th>Fills</th></>}
                    {gaugeModal.label === 'Backout %' && <><th>Placement</th><th>Job</th><th>Client</th><th>Candidate</th></>}
                  </tr>
                </thead>
                <tbody>
                  {gaugeModal.details.map((r, i) => (
                    <tr key={i}>
                      {gaugeModal.label === 'MAR Total' && <><td>{r.name}</td><td>{r.role}</td><td className="ch-num">{r.mar}</td></>}
                      {gaugeModal.label === 'Input' && <><td>{r.jobTitle}</td><td>{r.client}</td><td>{r.empType}</td><td>{r.am}</td><td className="ch-num">${Number(r.input).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></>}
                      {gaugeModal.label.includes('Fill Ratio') && <><td>{r.title}</td><td>{r.priority}</td><td className="ch-num">{r.openings}</td><td className="ch-num">{r.fills}</td></>}
                      {gaugeModal.label === 'Backout %' && <><td>{r.placementId}</td><td>{r.jobTitle}</td><td>{r.client}</td><td>{r.candidate}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="gauge-modal-count">{gaugeModal.details.length} record{gaugeModal.details.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}

      {/* Placement Detail Modal */}
      {placementModal && (
        <div className="gauge-modal-overlay" onClick={() => setPlacementModal(null)}>
          <div className="gauge-modal" onClick={e => e.stopPropagation()}>
            <div className="gauge-modal-header">
              <h3>{placementModal.clientName} — Active Placements</h3>
              <button className="modal-close" onClick={() => setPlacementModal(null)}>&times;</button>
            </div>
            <div className="gauge-modal-body">
              <table className="gauge-modal-table">
                <thead>
                  <tr>
                    <th>Placement</th>
                    <th>Candidate</th>
                    <th>Manager</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {placementModal.details.map((r, i) => (
                    <tr key={i}>
                      <td><a href={r.link} target="_blank" rel="noopener noreferrer" className="bh-detail-link">{r.placementId}</a></td>
                      <td>{r.candidate}</td>
                      <td>{r.manager}</td>
                      <td>{r.startDate}</td>
                      <td>{r.endDate || '—'}</td>
                      <td className="ch-num">${Number(r.spread).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="gauge-modal-count">{placementModal.details.length} placement{placementModal.details.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
