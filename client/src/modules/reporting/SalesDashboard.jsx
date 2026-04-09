import { useState, useEffect, useCallback, useMemo } from 'react';
import './reporting.css';
import { getSalesDashboard } from '../../lib/api';
import DateRangePicker from './components/DateRangePicker';
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

  // Get activity type keys from first AM (they all have the same keys)
  const activityKeys = useMemo(() => {
    if (!data?.ams?.length) return [];
    return Object.keys(data.ams[0].activityPoints || {});
  }, [data]);

  // Bonus tracker chart data
  const bonusData = useMemo(() => {
    if (!data?.ams) return [];
    return data.ams
      .filter(am => am.newInput > 0 || am.spreadGoal > 0)
      .map(am => ({
        name: am.name,
        'Goal': am.spreadGoal,
        'New Input': am.newInput,
      }));
  }, [data]);

  const ams = data?.ams || [];

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
          {/* Metrics Summary + Bonus Tracker side by side */}
          <div className="sales-layout">
            <div className="metrics-table-wrap">
              <h3 className="section-title">Metrics Summary</h3>
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>Activity</th>
                    {ams.map(am => <th key={am.id}>{am.name}</th>)}
                    <th className="total-col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Job metrics (teal background) */}
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
                  <tr className="activity-row">
                    <td className="row-label">Note Activity</td>
                    {ams.map(am => (
                      <td key={am.id} className="metric-val">{am.noteActivity}</td>
                    ))}
                    <td className="metric-val total-col">
                      {ams.reduce((sum, am) => sum + am.noteActivity, 0)}
                    </td>
                  </tr>
                  {/* Activity types (point values) */}
                  {activityKeys.map(key => (
                    <tr key={key} className="activity-row">
                      <td className="row-label">{key}</td>
                      {ams.map(am => (
                        <td key={am.id} className="metric-val">
                          {am.activityPoints[key] || 0}
                        </td>
                      ))}
                      <td className="metric-val total-col">
                        {ams.reduce((sum, am) => sum + (am.activityPoints[key] || 0), 0)}
                      </td>
                    </tr>
                  ))}
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
                  {/* All Activity */}
                  <tr>
                    <td className="row-label">All Activity</td>
                    {ams.map(am => (
                      <td key={am.id} className="metric-val">{am.activityCount}</td>
                    ))}
                    <td className="metric-val total-col">
                      {ams.reduce((sum, am) => sum + am.activityCount, 0)}
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
            {bonusData.length > 0 && (
              <div className="chart-section bonus-chart">
                <h3 className="section-title">Bonus Tracker</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={bonusData} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="Goal" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="New Input" fill="#04144F" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
