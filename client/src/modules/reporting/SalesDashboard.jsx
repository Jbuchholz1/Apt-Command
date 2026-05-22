import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './reporting.css';
import { getSalesDashboard, exportSalesDashboard } from '../../lib/api';
import { useUserRole } from '../../lib/UserRoleContext';
import AccessDenied from '../../components/AccessDenied';
import DateRangePicker from './components/DateRangePicker';
import DashboardFilters from './components/DashboardFilters';
import TeamAlerts from './components/TeamAlerts';
import { Bar, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from './lib/constants';
import { exportNodeToPdf } from './lib/pdfExport';

const JOB_METRIC_ROWS = [
  { key: 'newReqs', label: 'New Reqs', detailKey: 'newReqs' },
  { key: 'openings', label: '# of Openings', detailKey: 'newReqs' },
  { key: 'closedReqs', label: 'Closed Reqs', detailKey: 'closedReqs' },
  { key: 'fills', label: 'Fills', detailKey: 'fills' },
  { key: 'losses', label: 'Losses', detailKey: 'losses' },
  { key: 'washed', label: 'Washed', detailKey: 'washed' },
  { key: 'newPlacements', label: 'New Placements', detailKey: 'newPlacements' },
];

function getDefaultDates() {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  return {
    start: sunday.toISOString().slice(0, 10),
    end: today.toISOString().slice(0, 10),
  };
}

export default function SalesDashboard() {
  const { hasAccess, loading: roleLoading } = useUserRole();
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ recruiters: [], clients: [] });
  const [modal, setModal] = useState(null); // { amName, activityType, records }
  const [modalSort, setModalSort] = useState({ key: null, dir: 'asc' });
  const [exportingPdf, setExportingPdf] = useState(false);
  const exportRef = useRef(null);

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    try {
      setExportingPdf(true);
      const fname = `Sales_Dashboard_${startDate}_${endDate}.pdf`;
      await exportNodeToPdf(exportRef.current, fname, {
        title: 'Sales Dashboard',
        subtitle: formatRange(),
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF: ' + err.message);
    } finally {
      setExportingPdf(false);
    }
  };

  const toggleModalSort = (key) => setModalSort(prev =>
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  );
  const mSortIcon = (key) => modalSort.key !== key ? ' ↕' : modalSort.dir === 'asc' ? ' ↑' : ' ↓';
  const sortedRecords = useMemo(() => {
    if (!modal || !modalSort.key) return modal?.records || [];
    return [...modal.records].sort((a, b) => {
      const av = a[modalSort.key], bv = b[modalSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return modalSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return modalSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [modal, modalSort]);
  const isPlacement = modal?.isJob && modal?.records[0]?.placementId !== undefined;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getSalesDashboard(startDate, endDate);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatRange = () => {
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', opts)}`;
  };

  // Filter options
  const amOptions = useMemo(() => {
    if (!data?.ams) return [];
    return data.ams.map(am => am.name).sort();
  }, [data]);

  // Client options aren't directly available in current data, use empty for now
  const clientOptions = useMemo(() => [], []);

  // Apply AM filter
  const filteredAms = useMemo(() => {
    if (!data?.ams) return [];
    if (filters.recruiters.length === 0) return data.ams;
    return data.ams.filter(am => filters.recruiters.includes(am.name));
  }, [data, filters]);

  // Get activity type keys from first AM
  const activityKeys = useMemo(() => {
    if (!data?.ams?.length) return [];
    return Object.keys(data.ams[0].activityPoints || {});
  }, [data]);

  // Calculate weeks in range for MAR goal
  const weeks = useMemo(() => {
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const diffMs = e - s;
    return Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
  }, [startDate, endDate]);

  const AM_QUARTERLY_MAR = 30 * 13; // Static quarterly goal

  // Pacing: spread goal is quarterly (13 weeks). Show what fraction the selected range represents.
  // Scales above 100% when the range exceeds a quarter (e.g. YTD ≈ 21 weeks → ~161%).
  const QUARTER_WEEKS = 13;
  const pacingFraction = useMemo(() => {
    const s = new Date(startDate + 'T00:00:00').getTime();
    const e = new Date(endDate + 'T23:59:59').getTime();
    const rangeWeeks = (e - s) / (7 * 24 * 60 * 60 * 1000);
    return Math.max(0, rangeWeeks / QUARTER_WEEKS);
  }, [startDate, endDate]);

  const pacingPct = Math.round(pacingFraction * 100);

  // Bonus tracker chart data (New Input vs Goal)
  const bonusData = useMemo(() => {
    return filteredAms.map(am => ({
      name: am.name,
      'Spread Goal': am.spreadGoal,
      'New Input': am.newInput,
      'pacing': Math.round(am.spreadGoal * pacingFraction),
    }));
  }, [filteredAms, pacingFraction]);

  // MAR chart data — static quarterly goal with pacing line
  const marPacingTarget = Math.round(AM_QUARTERLY_MAR * pacingFraction);
  const marData = useMemo(() => {
    return filteredAms.map(am => ({
      name: am.name,
      'Goal': AM_QUARTERLY_MAR,
      'MAR Points': am.mar,
      'pacing': marPacingTarget,
    }));
  }, [filteredAms, marPacingTarget]);

  // Priority breakdown (A/B/C) cell click handler
  const openPriorityDetail = (am, priority, bucket) => {
    const pb = am.priorityBreakdown?.[priority];
    if (!pb) return;
    const records = pb.details?.[bucket] || [];
    if (records.length === 0) return;
    const labelMap = { reqs: 'Closed Reqs', fills: 'Fills', losses: 'Losses', washed: 'Washed' };
    setModal({
      amName: am.name,
      activityType: `Priority ${priority} — ${labelMap[bucket]}`,
      records,
      isJob: true,
    });
  };

  const ams = filteredAms;

  if (roleLoading) return null;
  if (!hasAccess('reporting_sales')) return <AccessDenied />;

  return (
    <div className="reporting-module">
      <div className="reporting-toolbar">
        <div className="toolbar-left">
          <h2 className="toolbar-title">Sales Dashboard</h2>
          <span className="toolbar-date-range">{formatRange()}</span>
        </div>
        <div className="toolbar-right">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />
          <button className="export-btn" onClick={() => exportSalesDashboard(startDate, endDate)}>Export Excel</button>
          <button className="export-btn" onClick={handleExportPdf} disabled={exportingPdf || !data}>
            {exportingPdf ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div ref={exportRef}>
      {data && (
        <DashboardFilters
          filters={filters}
          onChange={setFilters}
          recruiterOptions={amOptions}
          clientOptions={clientOptions}
          recruiterLabel="Account Managers"
        />
      )}

      {error && (
        <div className="error-banner">
          Failed to load data: {error}
          <button onClick={fetchData}>Retry</button>
        </div>
      )}

      {loading && !data && (
        <div className="reporting-loading">
          <div className="skeleton-shimmer skeleton-row" style={{ width: '60%' }}></div>
          <div style={{ display: 'flex', gap: 20, padding: '16px 24px' }}>
            <div className="skeleton-shimmer" style={{ flex: 2, height: 400, borderRadius: 8 }}></div>
            <div className="skeleton-shimmer" style={{ flex: 1, height: 400, borderRadius: 8 }}></div>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Charts row first — above the table */}
          <div className="charts-row">
            <div className="chart-section">
              <h3 className="section-title">New Input Totals vs Goals</h3>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={bonusData} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="Spread Goal" fill={CHART_COLORS.navy} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="New Input" fill={CHART_COLORS.gold} radius={[3, 3, 0, 0]} />
                  <Line
                    dataKey="pacing"
                    name={`Pacing Target (${pacingPct}%)`}
                    type="linear"
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={{ r: 5, fill: '#dc2626', stroke: '#dc2626' }}
                    activeDot={{ r: 7 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-section">
              <h3 className="section-title">MAR Tracking</h3>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={marData} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Goal" fill={CHART_COLORS.navy} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="MAR Points" fill={CHART_COLORS.gold} radius={[3, 3, 0, 0]} />
                  <Line
                    dataKey="pacing"
                    name={`Pacing Target (${pacingPct}%)`}
                    type="linear"
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={{ r: 5, fill: '#dc2626', stroke: '#dc2626' }}
                    activeDot={{ r: 7 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fills / Losses / Washes by Priority (A/B/C) — full width below the two charts */}
          <div style={{ padding: '0 24px 24px' }}>
            <div className="chart-section" style={{ flex: 'none', width: '100%' }}>
              <h3 className="section-title">Fills / Losses / Washes by Priority</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="metrics-table priority-breakdown-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="priority-am-col">Account Manager</th>
                      <th colSpan={4} className="priority-group priority-a">Priority A</th>
                      <th colSpan={4} className="priority-group priority-b">Priority B</th>
                      <th colSpan={4} className="priority-group priority-c">Priority C</th>
                      <th rowSpan={2} className="total-col">Total Closed</th>
                    </tr>
                    <tr>
                      <th className="priority-a-sub">Reqs</th>
                      <th className="priority-a-sub">Fills</th>
                      <th className="priority-a-sub">Lost</th>
                      <th className="priority-a-sub">Wash</th>
                      <th className="priority-b-sub">Reqs</th>
                      <th className="priority-b-sub">Fills</th>
                      <th className="priority-b-sub">Lost</th>
                      <th className="priority-b-sub">Wash</th>
                      <th className="priority-c-sub">Reqs</th>
                      <th className="priority-c-sub">Fills</th>
                      <th className="priority-c-sub">Lost</th>
                      <th className="priority-c-sub">Wash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ams.map(am => {
                      const pb = am.priorityBreakdown || {};
                      const renderCell = (priority, bucket) => {
                        const val = pb[priority]?.[bucket] || 0;
                        const hasDetails = (pb[priority]?.details?.[bucket] || []).length > 0;
                        return (
                          <td
                            className={`metric-val ${hasDetails ? 'clickable-cell' : ''}`}
                            onClick={() => hasDetails && openPriorityDetail(am, priority, bucket)}
                          >
                            {val}
                          </td>
                        );
                      };
                      return (
                        <tr key={am.id}>
                          <td className="row-label">{am.name}</td>
                          {renderCell('A', 'reqs')}
                          {renderCell('A', 'fills')}
                          {renderCell('A', 'losses')}
                          {renderCell('A', 'washed')}
                          {renderCell('B', 'reqs')}
                          {renderCell('B', 'fills')}
                          {renderCell('B', 'losses')}
                          {renderCell('B', 'washed')}
                          {renderCell('C', 'reqs')}
                          {renderCell('C', 'fills')}
                          {renderCell('C', 'losses')}
                          {renderCell('C', 'washed')}
                          <td className="metric-val total-col">{am.jobMetrics.closedReqs}</td>
                        </tr>
                      );
                    })}
                    <tr className="bold-row">
                      <td className="row-label">Total</td>
                      {['A', 'B', 'C'].flatMap(p => ['reqs', 'fills', 'losses', 'washed'].map(b => (
                        <td key={`${p}-${b}`} className="metric-val">
                          {ams.reduce((s, am) => s + (am.priorityBreakdown?.[p]?.[b] || 0), 0)}
                        </td>
                      )))}
                      <td className="metric-val total-col">
                        {ams.reduce((s, am) => s + (am.jobMetrics.closedReqs || 0), 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Metrics Summary table below charts */}
          <div className="metrics-table-wrap" style={{ padding: '0 24px 24px' }}>
            <h3 className="section-title">Metrics Summary</h3>
            <table className="metrics-table sales-metrics">
              <thead>
                <tr>
                  <th>Activity</th>
                  {ams.map(am => <th key={am.id}>{am.name}</th>)}
                  <th className="total-col">Total</th>
                </tr>
              </thead>
              <tbody>
                {JOB_METRIC_ROWS.map(row => (
                  <tr key={row.key} className="job-metric-row">
                    <td className="row-label">{row.label}</td>
                    {ams.map(am => {
                      const details = am.jobDetails?.[row.detailKey] || [];
                      const val = am.jobMetrics[row.key];
                      return (
                        <td key={am.id}
                          className={`metric-val ${details.length > 0 ? 'clickable-cell' : ''}`}
                          onClick={() => details.length > 0 && setModal({ amName: am.name, activityType: row.label, records: details, isJob: true })}
                        >
                          {val}
                        </td>
                      );
                    })}
                    <td className="metric-val total-col">
                      {ams.reduce((sum, am) => sum + (am.jobMetrics[row.key] || 0), 0)}
                    </td>
                  </tr>
                ))}
                <tr className="activity-row-odd">
                  <td className="row-label">Note Activity</td>
                  {ams.map(am => (
                    <td key={am.id} className="metric-val">{am.noteActivity}</td>
                  ))}
                  <td className="metric-val total-col">
                    {ams.reduce((sum, am) => sum + am.noteActivity, 0)}
                  </td>
                </tr>
                {activityKeys.map((key, i) => (
                  <tr key={key} className={i % 2 === 0 ? 'activity-row-even' : 'activity-row-odd'}>
                    <td className="row-label">{key}</td>
                    {ams.map(am => {
                      const pts = am.activityPoints[key] || 0;
                      const details = am.activityDetails?.[key] || [];
                      return (
                        <td key={am.id}
                          className={`metric-val ${details.length > 0 ? 'clickable-cell' : ''}`}
                          onClick={() => details.length > 0 && setModal({ amName: am.name, activityType: key, records: details })}
                        >
                          {pts}
                        </td>
                      );
                    })}
                    <td className="metric-val total-col">
                      {ams.reduce((sum, am) => sum + (am.activityPoints[key] || 0), 0)}
                    </td>
                  </tr>
                ))}
                <tr className="activity-row-odd">
                  <td className="row-label"># of New Meetings</td>
                  {ams.map(am => (
                    <td key={am.id} className="metric-val">{am.activityCount}</td>
                  ))}
                  <td className="metric-val total-col">
                    {ams.reduce((sum, am) => sum + am.activityCount, 0)}
                  </td>
                </tr>
                <tr className="bold-row">
                  <td className="row-label">MAR Total</td>
                  {ams.map(am => (
                    <td key={am.id} className="metric-val">{am.mar}</td>
                  ))}
                  <td className="metric-val total-col">
                    {Math.round(ams.reduce((sum, am) => sum + am.mar, 0) * 100) / 100}
                  </td>
                </tr>
                <tr className="input-row">
                  <td className="row-label">New Input</td>
                  {ams.map(am => (
                    <td key={am.id} className="metric-val">
                      ${Number(am.newInput).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                  <td className="metric-val total-col">
                    ${ams.reduce((sum, am) => sum + am.newInput, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <TeamAlerts team="sales" forceExpanded={exportingPdf} />
        </>
      )}
      </div>

      {/* Activity Detail Modal */}
      {modal && (
        <div className="activity-modal-overlay" onClick={() => { setModal(null); setModalSort({ key: null, dir: 'asc' }); }}>
          <div className="activity-modal" onClick={e => e.stopPropagation()}>
            <div className="activity-modal-header">
              <h3>{modal.amName} — {modal.activityType}</h3>
              <button className="modal-close" onClick={() => { setModal(null); setModalSort({ key: null, dir: 'asc' }); }}>&times;</button>
            </div>
            <div className="activity-modal-body">
              <table className="activity-modal-table">
                <thead>
                  <tr>
                    {modal.isJob ? (
                      isPlacement ? (
                        <>
                          <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('placementId')}>ID{mSortIcon('placementId')}</th>
                          <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('jobTitle')}>Job{mSortIcon('jobTitle')}</th>
                          <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('client')}>Client{mSortIcon('client')}</th>
                          <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('candidate')}>Candidate{mSortIcon('candidate')}</th>
                        </>
                      ) : (
                        <>
                          <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('jobId')}>ID{mSortIcon('jobId')}</th>
                          <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('title')}>Job Title{mSortIcon('title')}</th>
                          <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('client')}>Client{mSortIcon('client')}</th>
                          <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('status')}>Status{mSortIcon('status')}</th>
                          <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('openings')}>Openings{mSortIcon('openings')}</th>
                        </>
                      )
                    ) : (
                      <>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('date')}>Date{mSortIcon('date')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('type')}>Type{mSortIcon('type')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('client')}>Client{mSortIcon('client')}</th>
                        <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('subject')}>Subject{mSortIcon('subject')}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map((r, i) => (
                    <tr key={i}>
                      {modal.isJob ? (
                        r.placementId !== undefined ? (
                          <>
                            <td><a href={r.link} target="_blank" rel="noopener noreferrer" className="bh-detail-link">{r.placementId}</a></td>
                            <td>{r.jobTitle}</td>
                            <td>{r.client || '—'}</td>
                            <td>{r.candidate || '—'}</td>
                          </>
                        ) : (
                          <>
                            <td><a href={r.link} target="_blank" rel="noopener noreferrer" className="bh-detail-link">{r.jobId}</a></td>
                            <td>{r.title}</td>
                            <td>{r.client || '—'}</td>
                            <td>{r.status}</td>
                            <td className="ch-num">{r.openings}</td>
                          </>
                        )
                      ) : (
                        <>
                          <td>{r.date}</td>
                          <td>{r.type}</td>
                          <td>{r.client || '—'}</td>
                          <td className="activity-modal-subject">{r.subject || '—'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="activity-modal-count">{sortedRecords.length} record{sortedRecords.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
