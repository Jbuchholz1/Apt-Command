import { useState, useEffect, useCallback, useMemo } from 'react';
import './client-health.css';
import { getClientHealth, getCompanyKPIs, exportHealthDashboard } from '../../lib/api';
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

const healthTooltip = (c) => (
  `Old scoring: ${(c.health || '').toUpperCase()}\n` +
  `\u2022 Active placements: ${c.activePlacements}\n` +
  `\u2022 Activities (14d, all types): ${c.recentActivities}\n` +
  `\u2022 Score = ${c.activePlacements} + floor(${c.recentActivities}/5) = ${c.effectiveScore}\n` +
  `Thresholds: Green > 3  |  Yellow 1\u20133  |  Red 0`
);

const tierTooltip = (c) => (
  `Tier: ${c.tier || '\u2014'}\n` +
  `\u2022 Active placements: ${c.activePlacements}\n` +
  `\u2022 Direct placements (90d): ${c.directPlacements90d ?? 0}\n` +
  `\u2022 Org placements (90d): ${c.orgPlacements90d ?? 0}\n` +
  `\u2022 Referral placements (90d): ${c.referralPlacements90d ?? 0}\n` +
  `\u2022 Real meetings (90d): ${c.realMeetings90d ?? 0}`
);

const frameworkTooltip = (c) => {
  if (!c.frameworkHealth) return 'Onboarding \u2014 no score yet';
  const parts = [
    `New scoring: ${c.frameworkHealth.toUpperCase()}${c.direction ? ` (${c.direction})` : ''}`,
    `Tier: ${c.tier}`,
  ];
  if (c.tier === 'Hiring Manager') {
    parts.push(`\u2022 Real meetings (90d): ${c.realMeetings90d}  (green \u2265 3)`);
    parts.push(`\u2022 Active placements: ${c.activePlacements}  (green \u2265 2)`);
  } else if (c.tier === 'Higher Up') {
    parts.push(`\u2022 In-person meetings (90d): ${c.inPersonMeetings90d}`);
    parts.push(`\u2022 In-person months (last 3): ${c.inPersonMonthsLast3 ?? 0}  (green \u2265 2)`);
    parts.push(`\u2022 Org placements (90d): ${c.orgPlacements90d}`);
    parts.push(`\u2022 Direct placements (90d): ${c.directPlacements90d ?? 0}`);
  } else if (c.tier === 'Outlier') {
    parts.push(`\u2022 Real meetings (90d): ${c.realMeetings90d}  (green \u2265 2)`);
    parts.push(`\u2022 Referral placements (90d): ${c.referralPlacements90d}  (green \u2265 2)`);
  }
  if (c.direction) {
    parts.push(`\u2022 Current 90d: ${c.current90ActivityCount}  |  Prior 90d: ${c.prior90ActivityCount}`);
  }
  return parts.join('\n');
};

const realMeetingsTooltip = (c) => (
  `Real meetings in last 90 days: ${c.realMeetings90d ?? 0}\n` +
  `Counts only client-facing BD appointment types: In Person Meetings, New Meeting, Req Qual, Referral Meeting, OOA, Dinner, Sol Disc Meeting, Sol Pitch Meeting.\n` +
  `Prior 90d (91\u2013180 days ago): ${c.prior90ActivityCount ?? 0}`
);

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
  const [checkinSort, setCheckinSort] = useState({ key: 'daysSinceStart', dir: 'desc' });
  const [checkinOwnerFilter, setCheckinOwnerFilter] = useState('');
  const [gaugeSort, setGaugeSort] = useState({ key: null, dir: 'asc' });
  const [placementModal, setPlacementModal] = useState(null);
  const [placementSort, setPlacementSort] = useState({ key: 'startDate', dir: 'desc' });
  const [appointmentModal, setAppointmentModal] = useState(null);
  const [appointmentSort, setAppointmentSort] = useState({ key: 'dateBeginMs', dir: 'desc' });
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
          <button className="export-btn" onClick={exportHealthDashboard}>Export Excel</button>
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
        <div className="ch-loading">
          <div style={{ display: 'flex', gap: 16, padding: '20px 24px' }}>
            <div className="skeleton-shimmer skeleton-gauge"></div>
            <div className="skeleton-shimmer skeleton-gauge"></div>
            <div className="skeleton-shimmer skeleton-gauge"></div>
            <div className="skeleton-shimmer skeleton-gauge"></div>
            <div className="skeleton-shimmer skeleton-gauge"></div>
          </div>
          <div className="skeleton-shimmer skeleton-table"></div>
        </div>
      )}

      {data && (
        <div className="ch-table-wrap">
          <table className="ch-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('health')}>Old Scoring{sortIcon('health')}</th>
                <th className="sortable" onClick={() => handleSort('name')}>Client{sortIcon('name')}</th>
                <th className="sortable" onClick={() => handleSort('activePlacements')}>Active Placements{sortIcon('activePlacements')}</th>
                <th className="sortable" onClick={() => handleSort('recentActivities')}>Activities (14d){sortIcon('recentActivities')}</th>
                <th className="sortable" onClick={() => handleSort('effectiveScore')} title="Score = Active Placements + (Activities in last 14 days ÷ 5). Green: > 3 | Yellow: 1–3 | Red: 0">Score{sortIcon('effectiveScore')}</th>
                <th>Tier</th>
                <th>New Scoring</th>
                <th title="Real meetings in last 90 days (filtered by configured appointment types)">Real Mtg. (90d)</th>
                <th>Owners</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => (
                <tr key={c.id} className={`ch-row ch-row-${c.health}`}>
                  <td title={healthTooltip(c)}><span className={`ch-dot ch-dot-${c.health}`}></span></td>
                  <td className="ch-client-name">{c.name}</td>
                  <td className={`ch-num ${c.placementDetails?.length > 0 ? 'clickable-cell' : ''}`}
                    onClick={() => c.placementDetails?.length > 0 && setPlacementModal({ clientName: c.name, details: c.placementDetails })}
                  >{c.activePlacements}</td>
                  <td className={`ch-num ${c.activityDetails?.length > 0 ? 'clickable-cell' : ''}`}
                    onClick={() => c.activityDetails?.length > 0 && setAppointmentModal({ clientName: c.name, title: 'Activities (14d)', details: c.activityDetails })}
                  >{c.recentActivities}</td>
                  <td className="ch-num" title={`Score = ${c.activePlacements} + floor(${c.recentActivities}/5) = ${c.effectiveScore}\nThresholds: Green > 3  |  Yellow 1\u20133  |  Red 0`}>{c.effectiveScore}</td>
                  <td title={tierTooltip(c)}>{c.tier || '\u2014'}</td>
                  <td title={frameworkTooltip(c)}>
                    {c.frameworkHealth ? (
                      <>
                        <span className={`ch-dot ch-dot-${c.frameworkHealth}`}></span>
                        {c.direction === 'cooling' && <span className="ch-direction">{' \u2193'}</span>}
                        {c.direction === 'warming' && <span className="ch-direction">{' \u2191'}</span>}
                      </>
                    ) : '\u2014'}
                  </td>
                  <td className={`ch-num ${c.realMeetingDetails?.length > 0 ? 'clickable-cell' : ''}`}
                    title={realMeetingsTooltip(c)}
                    onClick={() => c.realMeetingDetails?.length > 0 && setAppointmentModal({ clientName: c.name, title: 'Real Meetings (90d)', details: c.realMeetingDetails })}
                  >{c.realMeetings90d ?? 0}</td>
                  <td className="ch-owners">{c.owners.join(', ')}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan="9" className="ch-empty">No clients match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Gauge Detail Modal */}
      {gaugeModal && (() => {
        const isCheckin = gaugeModal.label.includes('Checkin');
        const isTR = gaugeModal.label.includes('TR');
        const ownerKey = isTR ? 'candidateOwner' : 'jobOwner';
        const ownerLabel = isTR ? 'Candidate Owner' : 'Job Owner';

        // Checkin sorting + filtering
        const toggleCheckinSort = (key) => setCheckinSort(prev =>
          prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
        );
        const cSortIcon = (key) => !isCheckin ? '' : checkinSort.key !== key ? ' ↕' : checkinSort.dir === 'asc' ? ' ↑' : ' ↓';

        // Generic gauge sorting (non-checkin views)
        const toggleGaugeSort = (key) => setGaugeSort(prev =>
          prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
        );
        const gSortIcon = (key) => gaugeSort.key !== key ? ' ↕' : gaugeSort.dir === 'asc' ? ' ↑' : ' ↓';

        const ownerOptions = isCheckin ? [...new Set(gaugeModal.details.map(r => r[ownerKey]).filter(Boolean))].sort() : [];

        const sortedNonCheckinDetails = !isCheckin && gaugeSort.key
          ? [...gaugeModal.details].sort((a, b) => {
              const av = a[gaugeSort.key], bv = b[gaugeSort.key];
              if (av == null && bv == null) return 0;
              if (av == null) return 1;
              if (bv == null) return -1;
              if (typeof av === 'number' && typeof bv === 'number') {
                return gaugeSort.dir === 'asc' ? av - bv : bv - av;
              }
              const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
              return gaugeSort.dir === 'asc' ? cmp : -cmp;
            })
          : gaugeModal.details;

        const filteredDetails = isCheckin
          ? gaugeModal.details
              .filter(r => !checkinOwnerFilter || r[ownerKey] === checkinOwnerFilter)
              .sort((a, b) => {
                const av = a[checkinSort.key], bv = b[checkinSort.key];
                if (av == null) return 1;
                if (bv == null) return -1;
                const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
                return checkinSort.dir === 'asc' ? cmp : -cmp;
              })
          : sortedNonCheckinDetails;

        return (
          <div className="gauge-modal-overlay" onClick={() => { setGaugeModal(null); setCheckinOwnerFilter(''); setGaugeSort({ key: null, dir: 'asc' }); }}>
            <div className="gauge-modal" onClick={e => e.stopPropagation()}>
              <div className="gauge-modal-header">
                <h3>{gaugeModal.label}</h3>
                <button className="modal-close" onClick={() => { setGaugeModal(null); setCheckinOwnerFilter(''); setGaugeSort({ key: null, dir: 'asc' }); }}>&times;</button>
              </div>
              <div className="gauge-modal-body">
                {isCheckin && (
                  <div className="checkin-filter-row">
                    <select value={checkinOwnerFilter} onChange={e => setCheckinOwnerFilter(e.target.value)} className="checkin-filter-select">
                      <option value="">All {ownerLabel}s</option>
                      {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {checkinOwnerFilter && <button className="checkin-filter-clear" onClick={() => setCheckinOwnerFilter('')}>Clear</button>}
                  </div>
                )}
                <table className="gauge-modal-table">
                  <thead>
                    <tr>
                      {gaugeModal.label === 'MAR Total' && <>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('name')}>Person{gSortIcon('name')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('role')}>Role{gSortIcon('role')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('mar')}>MAR{gSortIcon('mar')}</th>
                      </>}
                      {gaugeModal.label === 'Input' && <>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('jobTitle')}>Job{gSortIcon('jobTitle')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('client')}>Client{gSortIcon('client')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('empType')}>Type{gSortIcon('empType')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('am')}>AM{gSortIcon('am')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('input')}>Input{gSortIcon('input')}</th>
                      </>}
                      {gaugeModal.label.includes('Fill Ratio') && <>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('title')}>Job{gSortIcon('title')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('priority')}>Priority{gSortIcon('priority')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('openings')}>Openings{gSortIcon('openings')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('fills')}>Fills{gSortIcon('fills')}</th>
                      </>}
                      {gaugeModal.label === 'Backout %' && <>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('candidateId')}>Candidate ID{gSortIcon('candidateId')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('candidateName')}>Candidate{gSortIcon('candidateName')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleGaugeSort('comment')}>Comment{gSortIcon('comment')}</th>
                      </>}
                      {isCheckin && <>
                        <th className="sortable" onClick={() => toggleCheckinSort(ownerKey)}>{ownerLabel}{cSortIcon(ownerKey)}</th>
                        <th className="sortable" onClick={() => toggleCheckinSort('candidateId')}>Candidate #{cSortIcon('candidateId')}</th>
                        <th className="sortable" onClick={() => toggleCheckinSort('placementId')}>Placement #{cSortIcon('placementId')}</th>
                        <th className="sortable" onClick={() => toggleCheckinSort('candidate')}>Candidate{cSortIcon('candidate')}</th>
                        <th className="sortable" onClick={() => toggleCheckinSort('client')}>Client{cSortIcon('client')}</th>
                        <th className="sortable" onClick={() => toggleCheckinSort('daysSinceStart')}>Start Date{cSortIcon('daysSinceStart')}</th>
                        <th className="sortable" onClick={() => toggleCheckinSort('thirtyDay')}>30-Day{cSortIcon('thirtyDay')}</th>
                        <th className="sortable" onClick={() => toggleCheckinSort('ninetyDay')}>90-Day{cSortIcon('ninetyDay')}</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {(isCheckin ? filteredDetails : sortedNonCheckinDetails).map((r, i) => (
                      <tr key={i}>
                        {gaugeModal.label === 'MAR Total' && <><td>{r.name}</td><td>{r.role}</td><td className="ch-num">{r.mar}</td></>}
                        {gaugeModal.label === 'Input' && <><td>{r.jobTitle}</td><td>{r.client}</td><td>{r.empType}</td><td>{r.am}</td><td className="ch-num">${Number(r.input).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></>}
                        {gaugeModal.label.includes('Fill Ratio') && <><td>{r.title}</td><td>{r.priority}</td><td className="ch-num">{r.openings}</td><td className="ch-num">{r.fills}</td></>}
                        {gaugeModal.label === 'Backout %' && <><td>{r.candidateId ? <a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=Candidate&id=${r.candidateId}`} target="_blank" rel="noopener noreferrer" className="ch-bh-link">{r.candidateId}</a> : '—'}</td><td>{r.candidateName || '—'}</td><td>{r.comment || '—'}</td></>}
                        {isCheckin && <>
                          <td>{r[ownerKey] || '—'}</td>
                          <td>{r.candidateId ? <a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=Candidate&id=${r.candidateId}`} target="_blank" rel="noopener noreferrer" className="ch-bh-link">{r.candidateId}</a> : '—'}</td>
                          <td>{r.placementId ? <a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=Placement&id=${r.placementId}`} target="_blank" rel="noopener noreferrer" className="ch-bh-link">{r.placementId}</a> : '—'}</td>
                          <td>{r.candidate}</td>
                          <td>{r.client}</td>
                          <td>{r.startDate}</td>
                          <td className={r.thirtyDay === 'Done' ? 'ch-green' : r.thirtyDay === 'Overdue' ? 'ch-red' : 'ch-muted'}>{r.thirtyDay}</td>
                          <td className={r.ninetyDay === 'Done' ? 'ch-green' : r.ninetyDay === 'Overdue' ? 'ch-red' : 'ch-muted'}>{r.ninetyDay}</td>
                        </>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="gauge-modal-count">{(isCheckin ? filteredDetails : sortedNonCheckinDetails).length} record{(isCheckin ? filteredDetails : sortedNonCheckinDetails).length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Placement Detail Modal */}
      {placementModal && (() => {
        const togglePlacementSort = (key) => setPlacementSort(prev =>
          prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
        );
        const pSortIcon = (key) => placementSort.key !== key ? ' ↕' : placementSort.dir === 'asc' ? ' ↑' : ' ↓';
        const sortedPlacements = [...placementModal.details].sort((a, b) => {
          const av = a[placementSort.key], bv = b[placementSort.key];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === 'number' && typeof bv === 'number') {
            return placementSort.dir === 'asc' ? av - bv : bv - av;
          }
          const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
          return placementSort.dir === 'asc' ? cmp : -cmp;
        });
        return (
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
                    {[
                      { key: 'placementId', label: 'Placement' },
                      { key: 'candidate', label: 'Candidate' },
                      { key: 'manager', label: 'Manager' },
                      { key: 'startDate', label: 'Start Date' },
                      { key: 'endDate', label: 'End Date' },
                      { key: 'spread', label: 'Spread' },
                    ].map(col => (
                      <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => togglePlacementSort(col.key)}>
                        {col.label}{pSortIcon(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPlacements.map((r, i) => (
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
              <p className="gauge-modal-count">{sortedPlacements.length} placement{sortedPlacements.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Appointment Detail Modal (Activities 14d / Real Meetings 90d) */}
      {appointmentModal && (() => {
        const toggleApptSort = (key) => setAppointmentSort(prev =>
          prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
        );
        const aSortIcon = (key) => appointmentSort.key !== key ? ' \u2195' : appointmentSort.dir === 'asc' ? ' \u2191' : ' \u2193';
        const sortedAppts = [...appointmentModal.details].sort((a, b) => {
          const av = a[appointmentSort.key];
          const bv = b[appointmentSort.key];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === 'number' && typeof bv === 'number') {
            return appointmentSort.dir === 'asc' ? av - bv : bv - av;
          }
          const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
          return appointmentSort.dir === 'asc' ? cmp : -cmp;
        });
        return (
          <div className="gauge-modal-overlay" onClick={() => setAppointmentModal(null)}>
            <div className="gauge-modal" onClick={e => e.stopPropagation()}>
              <div className="gauge-modal-header">
                <h3>{`${appointmentModal.clientName} \u2014 ${appointmentModal.title}`}</h3>
                <button className="modal-close" onClick={() => setAppointmentModal(null)}>&times;</button>
              </div>
              <div className="gauge-modal-body">
                <table className="gauge-modal-table">
                  <thead>
                    <tr>
                      {[
                        { key: 'appointmentId', label: 'ID' },
                        { key: 'type', label: 'Type' },
                        { key: 'subject', label: 'Subject' },
                        { key: 'dateBeginMs', label: 'Date' },
                        { key: 'owner', label: 'Owner' },
                        { key: 'contact', label: 'Contact' },
                      ].map(col => (
                        <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleApptSort(col.key)}>
                          {col.label}{aSortIcon(col.key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAppts.map((r, i) => (
                      <tr key={i}>
                        <td><a href={r.link} target="_blank" rel="noopener noreferrer" className="bh-detail-link">{r.appointmentId}</a></td>
                        <td>{r.type || '\u2014'}</td>
                        <td>{r.subject || '\u2014'}</td>
                        <td>{r.dateBegin || '\u2014'}</td>
                        <td>{r.owner || '\u2014'}</td>
                        <td>{r.contact || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="gauge-modal-count">{sortedAppts.length} appointment{sortedAppts.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
