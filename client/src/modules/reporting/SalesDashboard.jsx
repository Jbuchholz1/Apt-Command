import { useState, useEffect, useCallback, useMemo } from 'react';
import './reporting.css';
import { getSalesDashboard } from '../../lib/api';
import DateRangePicker from './components/DateRangePicker';
import DashboardFilters from './components/DashboardFilters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const JOB_METRIC_ROWS = [
  { key: 'newReqs', label: 'New Reqs' },
  { key: 'openings', label: '# of Openings' },
  { key: 'closedReqs', label: 'Closed Reqs' },
  { key: 'fills', label: 'Fills' },
  { key: 'losses', label: 'Losses' },
  { key: 'washed', label: 'Washed' },
  { key: 'newPlacements', label: 'New Placements' },
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
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ recruiters: [], clients: [] });
  const [modal, setModal] = useState(null); // { amName, activityType, records }

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

  // Bonus tracker chart data
  const bonusData = useMemo(() => {
    return filteredAms.map(am => ({
      name: am.name.split(' ')[0],
      fullName: am.name,
      'Goal': am.spreadGoal,
      'New Input': am.newInput,
    }));
  }, [filteredAms]);

  const ams = filteredAms;

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
        </div>
      </div>

      {data && (
        <DashboardFilters
          filters={filters}
          onChange={setFilters}
          recruiterOptions={amOptions}
          clientOptions={clientOptions}
        />
      )}

      {error && (
        <div className="error-banner">
          Failed to load data: {error}
          <button onClick={fetchData}>Retry</button>
        </div>
      )}

      {loading && !data && (
        <div className="reporting-loading">Loading sales dashboard...</div>
      )}

      {data && (
        <>
          <div className="sales-layout">
            <div className="metrics-table-wrap">
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
                  {/* Job metrics */}
                  {JOB_METRIC_ROWS.map(row => (
                    <tr key={row.key} className="job-metric-row">
                      <td className="row-label">{row.label}</td>
                      {ams.map(am => (
                        <td key={am.id} className="metric-val">{am.jobMetrics[row.key]}</td>
                      ))}
                      <td className="metric-val total-col">
                        {ams.reduce((sum, am) => sum + (am.jobMetrics[row.key] || 0), 0)}
                      </td>
                    </tr>
                  ))}
                  {/* Note Activity */}
                  <tr className="activity-row-odd">
                    <td className="row-label">Note Activity</td>
                    {ams.map(am => (
                      <td key={am.id} className="metric-val">{am.noteActivity}</td>
                    ))}
                    <td className="metric-val total-col">
                      {ams.reduce((sum, am) => sum + am.noteActivity, 0)}
                    </td>
                  </tr>
                  {/* Activity types (alternating colors, clickable) */}
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
                  {/* All Activity (above MAR) */}
                  <tr className="activity-row-odd">
                    <td className="row-label">All Activity</td>
                    {ams.map(am => (
                      <td key={am.id} className="metric-val">{am.activityCount}</td>
                    ))}
                    <td className="metric-val total-col">
                      {ams.reduce((sum, am) => sum + am.activityCount, 0)}
                    </td>
                  </tr>
                  {/* MAR Total */}
                  <tr className="bold-row">
                    <td className="row-label">MAR Total</td>
                    {ams.map(am => (
                      <td key={am.id} className="metric-val">{am.mar}</td>
                    ))}
                    <td className="metric-val total-col">
                      {Math.round(ams.reduce((sum, am) => sum + am.mar, 0) * 100) / 100}
                    </td>
                  </tr>
                  {/* New Input */}
                  <tr className="input-row">
                    <td className="row-label">New Input</td>
                    {ams.map(am => (
                      <td key={am.id} className="metric-val">
                        ${Number(am.newInput).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                    ))}
                    <td className="metric-val total-col">
                      ${Math.round(ams.reduce((sum, am) => sum + am.newInput, 0)).toLocaleString('en-US')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Bonus Tracker Chart */}
            <div className="chart-section bonus-chart">
              <h3 className="section-title">Bonus Tracker</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={bonusData} barGap={4} margin={{ top: 10, right: 20, bottom: 50, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" />
                  <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => `$${Number(v).toLocaleString()}`}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Legend />
                  <Bar dataKey="Goal" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="New Input" fill="#04144F" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Activity Detail Modal */}
      {modal && (
        <div className="activity-modal-overlay" onClick={() => setModal(null)}>
          <div className="activity-modal" onClick={e => e.stopPropagation()}>
            <div className="activity-modal-header">
              <h3>{modal.amName} — {modal.activityType}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>&times;</button>
            </div>
            <div className="activity-modal-body">
              <table className="activity-modal-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Client</th>
                    <th>Subject</th>
                  </tr>
                </thead>
                <tbody>
                  {modal.records.map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td>{r.type}</td>
                      <td>{r.client || '—'}</td>
                      <td className="activity-modal-subject">{r.subject || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="activity-modal-count">{modal.records.length} record{modal.records.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
