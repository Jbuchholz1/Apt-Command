import { useState, useEffect } from 'react';
import LiveTile from './components/LiveTile';
import PlaceholderTile from './components/PlaceholderTile';
import { getClientHealth, getExecutiveQuarterly } from '../../../lib/api';

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US');
}

function tileState(loading, value) {
  if (loading) return 'loading';
  if (value === null || value === undefined) return 'error';
  return 'ready';
}

export default function QuarterlyTab({ startDate, endDate }) {
  const [health, setHealth] = useState(null);
  const [quarterly, setQuarterly] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getClientHealth(startDate, endDate).catch(() => null),
      getExecutiveQuarterly(startDate, endDate).catch(() => null),
    ]).then(([h, q]) => {
      if (cancelled) return;
      setHealth(h);
      setQuarterly(q);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const summary = health?.summary;
  const totalClients = summary?.total ?? null;
  const clientSubtitle = summary
    ? `${summary.green ?? 0} healthy · ${summary.yellow ?? 0} watch · ${summary.red ?? 0} at risk`
    : 'Total active clients';

  const funnel = quarterly?.funnel;
  const funnelHeadline = funnel ? fmtNum(funnel.placements) : null;
  const funnelSubtitle = funnel
    ? `${fmtNum(funnel.leads)} leads → ${fmtNum(funnel.submissions)} subs → ${fmtNum(funnel.interviews)} interviews → ${fmtNum(funnel.placements)} placements`
    : 'Lead → Sub → Interview → Placement';

  return (
    <div className="exec-kpi-grid">
      <PlaceholderTile label="P&L Statement (Full)" note="Pending accounting integration" />
      <PlaceholderTile label="Revenue Forecast (next 2 quarters)" note="Pending pipeline weighting model" />
      <PlaceholderTile label="Budget vs Actuals" note="Pending GL + budget setup" />
      <PlaceholderTile label="Headcount Plan vs Actuals" note="From Supabase employees + Bullhorn Placements" />
      <LiveTile
        label="Talent Pipeline Health Report"
        value={funnelHeadline ?? '—'}
        subtitle={funnelSubtitle}
        state={tileState(loading, funnelHeadline)}
      />
      <LiveTile
        label="Key Client Reviews & Health Scores"
        value={totalClients ?? '—'}
        subtitle={clientSubtitle}
        state={tileState(loading, totalClients)}
      />
      <PlaceholderTile label="Regulatory & Compliance Audit" note="Pending compliance system integration" />
      <PlaceholderTile label="Vendor & Partner Review" note="Pending procurement system integration" />
    </div>
  );
}
