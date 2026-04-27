import { useState, useEffect } from 'react';
import LiveTile from './components/LiveTile';
import PlaceholderTile from './components/PlaceholderTile';
import {
  getSalesDashboard,
  getRecruiterDashboard,
  getStats,
  getExecutiveDashboard,
  getExecutiveWeekly,
} from '../../../lib/api';

function fmtCurrency(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US');
}

function fmtDelta(n) {
  if (n === null || n === undefined) return '';
  if (n === 0) return 'no change vs prior week';
  return `${n > 0 ? '+' : ''}${n} vs prior week`;
}

function tileState(loading, value) {
  if (loading) return 'loading';
  if (value === null || value === undefined) return 'error';
  return 'ready';
}

export default function WeeklyTab({ startDate, endDate }) {
  const [data, setData] = useState({ sales: null, recruiter: null, stats: null, exec: null, weekly: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getSalesDashboard(startDate, endDate).catch(() => null),
      getRecruiterDashboard(startDate, endDate).catch(() => null),
      getStats().catch(() => null),
      getExecutiveDashboard(startDate, endDate).catch(() => null),
      getExecutiveWeekly(startDate, endDate).catch(() => null),
    ]).then(([sales, recruiter, stats, exec, weekly]) => {
      if (cancelled) return;
      setData({ sales, recruiter, stats, exec, weekly });
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
  const activeContractors = data.weekly?.headcount?.current
    ?? data.stats?.activeContractors
    ?? null;
  const headcountDelta = data.weekly?.headcount?.delta ?? null;
  const attritionCount = data.weekly?.attrition?.count ?? null;
  const offersTotal = data.weekly?.offers?.total ?? null;
  const offersExtended = data.weekly?.offers?.extended ?? null;
  const offersAccepted = data.weekly?.offers?.accepted ?? null;
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
      <LiveTile
        label="Offers Extended & Accepted"
        value={fmtNum(offersTotal)}
        subtitle={offersExtended != null ? `${offersExtended} extended · ${offersAccepted} accepted` : 'In date range'}
        state={tileState(loading, offersTotal)}
      />
      <LiveTile
        label="Active Contractor Headcount"
        value={fmtNum(activeContractors)}
        subtitle={headcountDelta != null ? fmtDelta(headcountDelta) : 'Current count'}
        state={tileState(loading, activeContractors)}
      />
      <LiveTile
        label="Attrition / Dropouts This Week"
        value={fmtNum(attritionCount)}
        subtitle="Backout notes logged in range"
        state={tileState(loading, attritionCount)}
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
