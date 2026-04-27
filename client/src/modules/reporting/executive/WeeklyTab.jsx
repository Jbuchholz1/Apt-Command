import { useState, useEffect } from 'react';
import LiveTile from './components/LiveTile';
import PlaceholderTile from './components/PlaceholderTile';
import {
  getSalesDashboard,
  getRecruiterDashboard,
  getStats,
  getExecutiveDashboard,
} from '../../../lib/api';

function fmtCurrency(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US');
}

function tileState(loading, value) {
  if (loading) return 'loading';
  if (value === null || value === undefined) return 'error';
  return 'ready';
}

export default function WeeklyTab({ startDate, endDate }) {
  const [data, setData] = useState({ sales: null, recruiter: null, stats: null, exec: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getSalesDashboard(startDate, endDate).catch(() => null),
      getRecruiterDashboard(startDate, endDate).catch(() => null),
      getStats().catch(() => null),
      getExecutiveDashboard(startDate, endDate).catch(() => null),
    ]).then(([sales, recruiter, stats, exec]) => {
      if (cancelled) return;
      setData({ sales, recruiter, stats, exec });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const newReqs = data.sales?.ams
    ? data.sales.ams.reduce((sum, am) => sum + (am.jobMetrics?.newReqs || 0), 0)
    : null;
  const newPlacements = data.sales?.ams
    ? data.sales.ams.reduce((sum, am) => sum + (am.jobMetrics?.newPlacements || 0), 0)
    : null;
  const candidateSubs = data.recruiter?.totals?.clientSubs ?? null;
  const activeContractors = data.stats?.activeContractors ?? null;
  const newInput = data.exec?.currentNewInput?.value ?? null;

  return (
    <div className="exec-kpi-grid">
      <LiveTile
        label="New Reqs"
        value={fmtNum(newReqs)}
        subtitle="JobOrders added in date range"
        state={tileState(loading, newReqs)}
      />
      <LiveTile
        label="New Placements This Week"
        value={fmtNum(newPlacements)}
        subtitle="Placements approved in date range"
        state={tileState(loading, newPlacements)}
      />
      <LiveTile
        label="Candidate Submissions"
        value={fmtNum(candidateSubs)}
        subtitle="Client subs in date range"
        state={tileState(loading, candidateSubs)}
      />
      <PlaceholderTile
        label="Offers Extended & Accepted"
        note="From Bullhorn JobSubmission status transitions"
      />
      <LiveTile
        label="Active Contractor Headcount"
        value={fmtNum(activeContractors)}
        subtitle="Current count (Δ vs prior week coming soon)"
        state={tileState(loading, activeContractors)}
      />
      <PlaceholderTile
        label="Attrition / Dropouts This Week"
        note="From Bullhorn backout notes (NoteEntity)"
      />
      <PlaceholderTile
        label="Client Escalations / Issues"
        note="Pending intake source (Slack channel or custom field)"
      />
      <LiveTile
        label="Revenue / Spread / Pipeline (weekly movement)"
        value={fmtCurrency(newInput)}
        subtitle="Current new input in date range"
        state={tileState(loading, newInput)}
      />
      <PlaceholderTile
        label="Collections & Payments Received"
        note="Pending accounting integration"
      />
    </div>
  );
}
