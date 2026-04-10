import { useState, useEffect, useCallback, useMemo } from 'react';
import { getMyDashboard } from '../../lib/api';
import DateRangePicker from '../reporting/components/DateRangePicker';
import DetailTable from '../reporting/components/DetailTable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '../reporting/lib/constants';

function getDefaultDates() {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  return {
    start: sunday.toISOString().slice(0, 10),
    end: today.toISOString().slice(0, 10),
  };
}

// Recruiter detail table column definitions (omit recruiter name — it's always you)
const INTERVIEW_COLS = [
  { key: 'dateAdded', label: 'Date Added' },
  { key: 'jobId', label: 'Job ID', bhEntity: 'JobOrder' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'candidateId', label: 'Candidate ID', bhEntity: 'Candidate' },
  { key: 'candidateName', label: 'Name' },
];

const CLIENT_SUBS_COLS = [
  { key: 'jobId', label: 'Job ID', bhEntity: 'JobOrder' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'dateAdded', label: 'Date Added' },
  { key: 'companyName', label: 'Company' },
  { key: 'candidateId', label: 'Candidate ID', bhEntity: 'Candidate' },
  { key: 'candidateName', label: 'Candidate Name' },
];

const STARTS_COLS = [
  { key: 'placementId', label: 'Placement ID', bhEntity: 'Placement' },
  { key: 'client', label: 'Client' },
  { key: 'candidateId', label: 'Candidate ID', bhEntity: 'Candidate' },
  { key: 'candidateName', label: 'Candidate Name' },
  { key: 'guarantee', label: 'Guarantee' },
  { key: 'date', label: 'Date' },
];

const NEW_INPUT_COLS = [
  { key: 'placementId', label: 'Placement ID', bhEntity: 'Placement' },
  { key: 'employeeType', label: 'Employee Type' },
  { key: 'candidateName', label: 'Candidate Name' },
  { key: 'startDate', label: 'Start Date' },
  { key: 'scheduledEnd', label: 'Scheduled End' },
  { key: 'daysBetween', label: 'Days Between' },
  { key: 'guarantee', label: 'Guarantee' },
  { key: 'newInput', label: 'New Input', format: 'currency' },
];

// AM job detail columns
const JOB_DETAIL_COLS = [
  { key: 'jobId', label: 'Job ID', bhEntity: 'JobOrder' },
  { key: 'title', label: 'Title' },
  { key: 'client', label: 'Client' },
  { key: 'status', label: 'Status' },
  { key: 'openings', label: 'Openings' },
];

const PLACEMENT_COLS = [
  { key: 'placementId', label: 'Placement ID', bhEntity: 'Placement' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'client', label: 'Client' },
  { key: 'candidate', label: 'Candidate' },
];

const JOB_METRIC_ROWS = [
  { key: 'newReqs', label: 'New Reqs', detailKey: 'newReqs' },
  { key: 'openings', label: '# of Openings', detailKey: 'newReqs' },
  { key: 'closedReqs', label: 'Closed Reqs', detailKey: 'closedReqs' },
  { key: 'fills', label: 'Fills', detailKey: 'fills' },
  { key: 'losses', label: 'Losses', detailKey: 'losses' },
  { key: 'washed', label: 'Washed', detailKey: 'washed' },
  { key: 'newPlacements', label: 'New Placements', detailKey: 'newPlacements' },
];

export default function MyDashboard() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getMyDashboard(startDate, endDate);
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

  const formatCurrency = (val) => `$${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="reporting-module">
      <div className="reporting-toolbar">
        <div className="toolbar-left">
          <h2 className="toolbar-title">My Performance</h2>
          {data?.role && <span className="perf-role-badge">{data.role}</span>}
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
        <div className="reporting-loading">
          <div className="skeleton-shimmer skeleton-row" style={{ width: '60%' }}></div>
          <div style={{ display: 'flex', gap: 20, padding: '16px 24px' }}>
            <div className="skeleton-shimmer" style={{ flex: 1, height: 320, borderRadius: 8 }}></div>
            <div className="skeleton-shimmer" style={{ flex: 1, height: 320, borderRadius: 8 }}></div>
          </div>
        </div>
      )}

      {data && !data.role && (
        <div className="perf-not-found">
          <h3>User Not Found</h3>
          <p>Your email wasn't matched to a Bullhorn user. Contact your admin to verify your CRM profile.</p>
        </div>
      )}

      {data?.role === 'Recruiter' && <RecruiterView data={data} formatCurrency={formatCurrency} />}
      {data?.role === 'Account Manager' && <AMView data={data} formatCurrency={formatCurrency} modal={modal} setModal={setModal} />}

      {/* Activity Detail Modal (AM only) */}
      {modal && (
        <div className="activity-modal-overlay" onClick={() => setModal(null)}>
          <div className="activity-modal" onClick={e => e.stopPropagation()}>
            <div className="activity-modal-header">
              <h3>{modal.activityType}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>&times;</button>
            </div>
            <div className="activity-modal-body">
              <table className="activity-modal-table">
                <thead>
                  <tr>
                    {modal.isJob ? (
                      modal.records[0]?.placementId !== undefined ? (
                        <><th>ID</th><th>Job</th><th>Client</th><th>Candidate</th></>
                      ) : (
                        <><th>ID</th><th>Title</th><th>Client</th><th>Status</th><th>Openings</th></>
                      )
                    ) : (
                      <><th>Date</th><th>Type</th><th>Client</th><th>Subject</th></>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {modal.records.map((r, i) => (
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
                            <td>{r.openings}</td>
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
              <p className="activity-modal-count">{modal.records.length} record{modal.records.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Recruiter View ---
function RecruiterView({ data, formatCurrency }) {
  const inputChartData = [{ name: data.name, 'Spread Goal': data.spreadGoal, 'New Input': data.metrics.newInput }];
  const marChartData = [{ name: data.name, 'Goal': data.marGoal, 'MAR Points': data.metrics.mar }];

  return (
    <>
      {/* Welcome banner */}
      <div className="perf-banner">
        <div className="perf-banner-left">
          <h2 className="perf-banner-name">{data.name}</h2>
          <p className="perf-banner-sub">Recruiter · Tier {data.tier} · Spread Goal: {formatCurrency(data.spreadGoal)}</p>
        </div>
        <div className="perf-stat-pills">
          <div className="perf-pill perf-pill-gold">
            <div className="perf-pill-value">{data.metrics.mar}</div>
            <div className="perf-pill-label">MAR Score</div>
          </div>
          <div className="perf-pill">
            <div className="perf-pill-value">{data.marGoal}</div>
            <div className="perf-pill-label">MAR Goal</div>
          </div>
          <div className="perf-pill perf-pill-green">
            <div className="perf-pill-value">{formatCurrency(data.metrics.newInput)}</div>
            <div className="perf-pill-label">New Input</div>
          </div>
          <div className="perf-pill">
            <div className="perf-pill-value">{data.metrics.clientSubs + data.metrics.interviews + Math.round(data.metrics.starts)}</div>
            <div className="perf-pill-label">Activities</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-row">
        <div className="chart-section">
          <h3 className="section-title">New Input vs Goal</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={inputChartData} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="Spread Goal" fill={CHART_COLORS.navy} radius={[3, 3, 0, 0]} />
              <Bar dataKey="New Input" fill={CHART_COLORS.gold} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-section">
          <h3 className="section-title">MAR Tracking</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={marChartData} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Goal" fill={CHART_COLORS.navy} radius={[3, 3, 0, 0]} />
              <Bar dataKey="MAR Points" fill={CHART_COLORS.gold} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity Breakdown */}
      <div className="perf-metrics-section">
        <h3 className="section-title">Activity Breakdown</h3>
        <table className="metrics-table">
          <thead>
            <tr><th>Activity</th><th>Count</th><th>Points</th></tr>
          </thead>
          <tbody>
            <tr className="activity-row-odd">
              <td className="row-label">Client Subs</td>
              <td className="metric-val">{data.metrics.clientSubs}</td>
              <td className="metric-val">{data.points.subsPoints}</td>
            </tr>
            <tr className="activity-row-even">
              <td className="row-label">Interviews</td>
              <td className="metric-val">{data.metrics.interviews}</td>
              <td className="metric-val">{data.points.interviewPoints}</td>
            </tr>
            <tr className="activity-row-odd">
              <td className="row-label">Starts</td>
              <td className="metric-val">{data.metrics.starts}</td>
              <td className="metric-val">{data.points.startsPoints}</td>
            </tr>
            <tr className="bold-row">
              <td className="row-label">MAR Total</td>
              <td className="metric-val">{data.metrics.clientSubs + data.metrics.interviews + Math.round(data.metrics.starts)}</td>
              <td className="metric-val">{data.metrics.mar}</td>
            </tr>
            <tr className="input-row">
              <td className="row-label">New Input</td>
              <td className="metric-val" colSpan={2}>{formatCurrency(data.metrics.newInput)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detail tables */}
      <DetailTable title="Client Submissions" columns={CLIENT_SUBS_COLS} data={data.details.clientSubs} />
      <DetailTable title="Interviews" columns={INTERVIEW_COLS} data={data.details.interviews} />
      <DetailTable title="Starts" columns={STARTS_COLS} data={data.details.starts} />
      <DetailTable title="New Input" columns={NEW_INPUT_COLS} data={data.details.newInput} />
    </>
  );
}

// --- Account Manager View ---
function AMView({ data, formatCurrency, modal, setModal }) {
  const inputChartData = [{ name: data.name, 'Spread Goal': data.spreadGoal, 'New Input': data.newInput }];
  const marChartData = [{ name: data.name, 'Goal': data.marGoal, 'MAR Points': data.mar }];

  const activityKeys = Object.keys(data.activityPoints || {});

  return (
    <>
      {/* Welcome banner */}
      <div className="perf-banner">
        <div className="perf-banner-left">
          <h2 className="perf-banner-name">{data.name}</h2>
          <p className="perf-banner-sub">Account Manager · Tier {data.tier} · Spread Goal: {formatCurrency(data.spreadGoal)}</p>
        </div>
        <div className="perf-stat-pills">
          <div className="perf-pill perf-pill-gold">
            <div className="perf-pill-value">{data.mar}</div>
            <div className="perf-pill-label">MAR Score</div>
          </div>
          <div className="perf-pill">
            <div className="perf-pill-value">{data.marGoal}</div>
            <div className="perf-pill-label">MAR Goal</div>
          </div>
          <div className="perf-pill perf-pill-green">
            <div className="perf-pill-value">{formatCurrency(data.newInput)}</div>
            <div className="perf-pill-label">New Input</div>
          </div>
          <div className="perf-pill">
            <div className="perf-pill-value">{data.activityCount}</div>
            <div className="perf-pill-label">Activities</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-row">
        <div className="chart-section">
          <h3 className="section-title">New Input vs Goal</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={inputChartData} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="Spread Goal" fill={CHART_COLORS.navy} radius={[3, 3, 0, 0]} />
              <Bar dataKey="New Input" fill={CHART_COLORS.gold} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-section">
          <h3 className="section-title">MAR Tracking</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={marChartData} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Goal" fill={CHART_COLORS.navy} radius={[3, 3, 0, 0]} />
              <Bar dataKey="MAR Points" fill={CHART_COLORS.gold} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Job Metrics */}
      <div className="perf-metrics-section">
        <h3 className="section-title">Job Metrics</h3>
        <table className="metrics-table">
          <thead>
            <tr><th>Metric</th><th>Count</th></tr>
          </thead>
          <tbody>
            {JOB_METRIC_ROWS.map(row => {
              const details = data.jobDetails?.[row.detailKey] || [];
              return (
                <tr key={row.key} className="job-metric-row">
                  <td className="row-label">{row.label}</td>
                  <td
                    className={`metric-val ${details.length > 0 ? 'clickable-cell' : ''}`}
                    onClick={() => details.length > 0 && setModal({ activityType: row.label, records: details, isJob: true })}
                  >
                    {data.jobMetrics[row.key]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Activity Breakdown */}
      <div className="perf-metrics-section">
        <h3 className="section-title">Activity Breakdown</h3>
        <table className="metrics-table">
          <thead>
            <tr><th>Activity Type</th><th>Points</th></tr>
          </thead>
          <tbody>
            {activityKeys.map((key, i) => {
              const pts = data.activityPoints[key] || 0;
              const details = data.activityDetails?.[key] || [];
              return (
                <tr key={key} className={i % 2 === 0 ? 'activity-row-odd' : 'activity-row-even'}>
                  <td className="row-label">{key}</td>
                  <td
                    className={`metric-val ${details.length > 0 ? 'clickable-cell' : ''}`}
                    onClick={() => details.length > 0 && setModal({ activityType: key, records: details })}
                  >
                    {pts}
                  </td>
                </tr>
              );
            })}
            <tr className="bold-row">
              <td className="row-label">MAR Total</td>
              <td className="metric-val">{data.mar}</td>
            </tr>
            <tr className="input-row">
              <td className="row-label">New Input</td>
              <td className="metric-val">{formatCurrency(data.newInput)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Placement details */}
      {data.jobDetails?.newPlacements?.length > 0 && (
        <DetailTable title="New Placements" columns={PLACEMENT_COLS} data={data.jobDetails.newPlacements} />
      )}
    </>
  );
}
