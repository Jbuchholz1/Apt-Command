import { useState, useEffect, useCallback, useMemo } from 'react';
import { getMyDashboard, getPerformanceUsers } from '../../lib/api';
import { useUserRole } from '../../lib/UserRoleContext';
import AccessDenied from '../../components/AccessDenied';
import DateRangePicker from '../reporting/components/DateRangePicker';
import DetailTable from '../reporting/components/DetailTable';
import MyTicketsSection from './MyTicketsSection';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '../reporting/lib/constants';
import './performance.css';
import { toLocalYMD } from '../../lib/localDate';

function getDefaultDates() {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  return {
    start: toLocalYMD(sunday),
    end: toLocalYMD(today),
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
  const { hasAccess, loading: roleLoading } = useUserRole();
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [modalSort, setModalSort] = useState({ key: null, dir: 'asc' });

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

  // Admin user selector
  const { isManager } = useUserRole();
  const [allUsers, setAllUsers] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(''); // empty = self

  useEffect(() => {
    if (isManager) {
      getPerformanceUsers()
        .then((res) => setAllUsers(res?.users || []))
        .catch(() => {});
    }
  }, [isManager]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getMyDashboard(startDate, endDate, selectedEmail || undefined);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedEmail]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatRange = () => {
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', opts)}`;
  };

  const formatCurrency = (val) => `$${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (roleLoading) return null;
  if (!hasAccess('reporting_performance')) return <AccessDenied />;

  return (
    <div className="reporting-module">
      <div className="reporting-toolbar">
        <div className="toolbar-left">
          {isManager && allUsers.length > 0 ? (
            <select
              className="perf-user-select"
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
            >
              <option value="">My Performance</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name} {u.role ? `(${u.role})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="toolbar-title">My Performance</h2>
          )}
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

      {data?.role === 'Recruiter' && <RecruiterView data={data} formatCurrency={formatCurrency} selectedEmail={selectedEmail} />}
      {data?.role === 'Account Manager' && <AMView data={data} formatCurrency={formatCurrency} modal={modal} setModal={setModal} selectedEmail={selectedEmail} />}

      {/* Activity Detail Modal (AM only) */}
      {modal && (
        <div className="activity-modal-overlay" onClick={() => { setModal(null); setModalSort({ key: null, dir: 'asc' }); }}>
          <div className="activity-modal" onClick={e => e.stopPropagation()}>
            <div className="activity-modal-header">
              <h3>{modal.activityType}</h3>
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
                          <th className="sortable" style={{ cursor: 'pointer' }} onClick={() => toggleModalSort('title')}>Title{mSortIcon('title')}</th>
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
              <p className="activity-modal-count">{sortedRecords.length} record{sortedRecords.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Recruiter View ---
function RecruiterView({ data, formatCurrency, selectedEmail }) {
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

      {data.overdueTasks?.total > 0 && <OverdueAlert overdueTasks={data.overdueTasks} />}

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

      {data.followUps && <FollowUpsSection followUps={data.followUps} title="TR 30/90 Check-In Follow Ups" />}

      <MyTicketsSection email={selectedEmail} />
    </>
  );
}

// --- Account Manager View ---
function AMView({ data, formatCurrency, modal, setModal, selectedEmail }) {
  const inputChartData = [{ name: data.name, 'Spread Goal': data.spreadGoal, 'New Input': data.newInput }];
  const marChartData = [{ name: data.name, 'Goal': data.marGoal, 'MAR Points': data.mar }];
  const flwChartData = [{ name: data.name, Fills: data.jobMetrics.fills, Losses: data.jobMetrics.losses, Washed: data.jobMetrics.washed }];

  const handleFlwBarClick = (category) => () => {
    const detailKeyMap = { Fills: 'fills', Losses: 'losses', Washed: 'washed' };
    const details = data.jobDetails?.[detailKeyMap[category]] || [];
    if (details.length > 0) {
      setModal({ amName: data.name, activityType: category, records: details, isJob: true });
    }
  };

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

      {data.overdueTasks?.total > 0 && <OverdueAlert overdueTasks={data.overdueTasks} />}

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

      {/* Fills / Losses / Washes chart — full width below MAR & Input */}
      <div style={{ padding: '0 24px 16px' }}>
        <div className="chart-section" style={{ flex: 'none', width: '100%' }}>
          <h3 className="section-title">Fills / Losses / Washes</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={flwChartData} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Fills" fill={CHART_COLORS.fills} radius={[3, 3, 0, 0]} cursor="pointer" onClick={handleFlwBarClick('Fills')} />
              <Bar dataKey="Losses" fill={CHART_COLORS.losses} radius={[3, 3, 0, 0]} cursor="pointer" onClick={handleFlwBarClick('Losses')} />
              <Bar dataKey="Washed" fill={CHART_COLORS.washed} radius={[3, 3, 0, 0]} cursor="pointer" onClick={handleFlwBarClick('Washed')} />
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

      {data.followUps && <FollowUpsSection followUps={data.followUps} title="AM 30/90 Check-In Follow Ups" />}

      <MyTicketsSection email={selectedEmail} />
    </>
  );
}

// --- Follow Ups Section (shared by TR and AM) ---
// --- Overdue Tasks Alert ---
function OverdueAlert({ overdueTasks }) {
  const [expanded, setExpanded] = useState(false);
  const {
    total, overdueFollowUps, missedDeadlines, overdueCheckins,
    goalTasksOverdue = [], goalTasksUpcoming = [],
  } = overdueTasks;

  if (total === 0) return null;

  return (
    <div className="perf-overdue-wrap">
      <div className="perf-overdue-alert" onClick={() => setExpanded(!expanded)}>
        <div className="perf-overdue-left">
          <div className="perf-overdue-icon">!</div>
          <div>
            <h4 className="perf-overdue-title">{total} Task{total !== 1 ? 's' : ''} Needing Attention</h4>
            <p className="perf-overdue-sub">{expanded ? 'Click to collapse' : 'Click to review follow-ups, deadlines, check-ins, and goal tasks'}</p>
          </div>
        </div>
        <div className="perf-overdue-badges">
          {overdueFollowUps.length > 0 && <span className="perf-overdue-badge">{overdueFollowUps.length} Follow Up{overdueFollowUps.length !== 1 ? 's' : ''}</span>}
          {missedDeadlines.length > 0 && <span className="perf-overdue-badge">{missedDeadlines.length} Deadline{missedDeadlines.length !== 1 ? 's' : ''}</span>}
          {overdueCheckins.length > 0 && <span className="perf-overdue-badge">{overdueCheckins.length} Check-In{overdueCheckins.length !== 1 ? 's' : ''}</span>}
          {goalTasksOverdue.length > 0 && <span className="perf-overdue-badge">{goalTasksOverdue.length} Overdue Goal Task{goalTasksOverdue.length !== 1 ? 's' : ''}</span>}
          {goalTasksUpcoming.length > 0 && <span className="perf-overdue-badge">{goalTasksUpcoming.length} Upcoming Goal Task{goalTasksUpcoming.length !== 1 ? 's' : ''}</span>}
        </div>
      </div>
      {expanded && (
        <div className="perf-overdue-detail">
          {overdueFollowUps.length > 0 && (
            <div className="perf-overdue-section">
              <div className="perf-overdue-section-title">Overdue Follow Ups ({overdueFollowUps.length})</div>
              {overdueFollowUps.map((r, i) => (
                <div key={i} className="perf-overdue-item">
                  <div className="perf-overdue-item-left">
                    <a href={r.jobLink} target="_blank" rel="noopener noreferrer" className="bh-detail-link">{r.jobId}</a>
                    <span className="perf-overdue-item-title">{r.title}</span>
                    <span className="perf-overdue-item-client">— {r.client}</span>
                  </div>
                  <span className="perf-overdue-item-date">{r.value}</span>
                </div>
              ))}
            </div>
          )}
          {missedDeadlines.length > 0 && (
            <div className="perf-overdue-section">
              <div className="perf-overdue-section-title">Missed Deadlines ({missedDeadlines.length})</div>
              {missedDeadlines.map((r, i) => (
                <div key={i} className="perf-overdue-item">
                  <div className="perf-overdue-item-left">
                    <a href={r.jobLink} target="_blank" rel="noopener noreferrer" className="bh-detail-link">{r.jobId}</a>
                    <span className="perf-overdue-item-title">{r.title}</span>
                    <span className="perf-overdue-item-client">— {r.client}</span>
                  </div>
                  <span className="perf-overdue-item-date">{r.value}</span>
                </div>
              ))}
            </div>
          )}
          {overdueCheckins.length > 0 && (
            <div className="perf-overdue-section">
              <div className="perf-overdue-section-title">Overdue Check-Ins ({overdueCheckins.length})</div>
              {overdueCheckins.map((r, i) => (
                <div key={i} className="perf-overdue-item">
                  <div className="perf-overdue-item-left">
                    {r.candidateId ? <a href={r.candidateLink} target="_blank" rel="noopener noreferrer" className="bh-detail-link">{r.candidateId}</a> : <span>—</span>}
                    <span className="perf-overdue-item-title">{r.candidate}</span>
                    <span className="perf-overdue-item-client">— {r.client}</span>
                  </div>
                  <span className="perf-overdue-item-date">{r.reason}</span>
                </div>
              ))}
            </div>
          )}
          {goalTasksOverdue.length > 0 && (
            <div className="perf-overdue-section">
              <div className="perf-overdue-section-title">Overdue Goal Tasks ({goalTasksOverdue.length})</div>
              {goalTasksOverdue.map(r => (
                <div key={r.taskId} className="perf-overdue-item">
                  <div className="perf-overdue-item-left">
                    <span className="perf-overdue-item-title">{r.title}</span>
                    <span className="perf-overdue-item-client">— {r.goalName}</span>
                  </div>
                  <span className="perf-overdue-item-date">Due {formatTaskDue(r.dueDate)}</span>
                </div>
              ))}
            </div>
          )}
          {goalTasksUpcoming.length > 0 && (
            <div className="perf-overdue-section">
              <div className="perf-overdue-section-title">Upcoming Goal Tasks ({goalTasksUpcoming.length})</div>
              {goalTasksUpcoming.map(r => (
                <div key={r.taskId} className="perf-overdue-item">
                  <div className="perf-overdue-item-left">
                    <span className="perf-overdue-item-title">{r.title}</span>
                    <span className="perf-overdue-item-client">— {r.goalName}</span>
                  </div>
                  <span className="perf-overdue-item-date">Due {formatTaskDue(r.dueDate)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTaskDue(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function FollowUpsSection({ followUps, title }) {
  const [sort, setSort] = useState({ key: 'daysSinceStart', dir: 'desc' });
  const [filter, setFilter] = useState('');

  if (!followUps || followUps.length === 0) return null;

  const toggleSort = (key) => setSort(prev =>
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  );
  const sortIcon = (key) => sort.key !== key ? ' ↕' : sort.dir === 'asc' ? ' ↑' : ' ↓';

  const filtered = followUps
    .filter(r => {
      if (!filter) return true;
      if (filter === 'overdue') return r.thirtyDay === 'Overdue' || r.ninetyDay === 'Overdue';
      if (filter === 'done') return r.thirtyDay === 'Done' && (r.ninetyDay === 'Done' || r.ninetyDay === 'Not yet due');
      return true;
    })
    .sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });

  const overdueCount = followUps.filter(r => r.thirtyDay === 'Overdue' || r.ninetyDay === 'Overdue').length;

  return (
    <div className="perf-metrics-section">
      <h3 className="section-title">{title} <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12 }}>({followUps.length} placements{overdueCount > 0 ? `, ${overdueCount} with overdue` : ''})</span></h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}>
          <option value="">All</option>
          <option value="overdue">Overdue Only</option>
          <option value="done">Completed Only</option>
        </select>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="metrics-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('candidateId')}>Candidate #{sortIcon('candidateId')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('placementId')}>Placement #{sortIcon('placementId')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('candidate')}>Candidate{sortIcon('candidate')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('client')}>Client{sortIcon('client')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('jobTitle')}>Job{sortIcon('jobTitle')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('daysSinceStart')}>Start Date{sortIcon('daysSinceStart')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('thirtyDay')}>30-Day{sortIcon('thirtyDay')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('ninetyDay')}>90-Day{sortIcon('ninetyDay')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td>{r.candidateId ? <a href={r.candidateLink} target="_blank" rel="noopener noreferrer" className="bh-detail-link">{r.candidateId}</a> : '—'}</td>
                <td><a href={r.placementLink} target="_blank" rel="noopener noreferrer" className="bh-detail-link">{r.placementId}</a></td>
                <td>{r.candidate}</td>
                <td>{r.client}</td>
                <td>{r.jobTitle}</td>
                <td>{r.startDate}</td>
                <td style={{ color: r.thirtyDay === 'Done' ? '#166534' : r.thirtyDay === 'Overdue' ? '#991b1b' : '#94a3b8', fontWeight: r.thirtyDay !== 'Not yet due' ? 600 : 400 }}>{r.thirtyDay}</td>
                <td style={{ color: r.ninetyDay === 'Done' ? '#166534' : r.ninetyDay === 'Overdue' ? '#991b1b' : '#94a3b8', fontWeight: r.ninetyDay !== 'Not yet due' ? 600 : 400 }}>{r.ninetyDay}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>No follow ups match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
