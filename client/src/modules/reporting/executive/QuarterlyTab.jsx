import { useState, useEffect } from 'react';
import LiveTile from './components/LiveTile';
import PlaceholderTile from './components/PlaceholderTile';
import { getClientHealth } from '../../../lib/api';

function tileState(loading, value) {
  if (loading) return 'loading';
  if (value === null || value === undefined) return 'error';
  return 'ready';
}

export default function QuarterlyTab({ startDate, endDate }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getClientHealth(startDate, endDate)
      .catch(() => null)
      .then((res) => {
        if (cancelled) return;
        setHealth(res);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const summary = health?.summary;
  const total = summary?.total ?? null;
  const subtitle = summary
    ? `${summary.green ?? 0} healthy · ${summary.yellow ?? 0} watch · ${summary.red ?? 0} at risk`
    : 'Total active clients';

  return (
    <div className="exec-kpi-grid">
      <PlaceholderTile label="P&L Statement (Full)" note="Pending accounting integration" />
      <PlaceholderTile label="Revenue Forecast (next 2 quarters)" note="Pending pipeline weighting model" />
      <PlaceholderTile label="Budget vs Actuals" note="Pending GL + budget setup" />
      <PlaceholderTile label="Headcount Plan vs Actuals" note="From Supabase employees + Bullhorn Placements" />
      <PlaceholderTile label="Talent Pipeline Health Report" note="From Bullhorn funnel — Lead → Sub → Interview → Placement" />
      <LiveTile
        label="Key Client Reviews & Health Scores"
        value={total ?? '—'}
        subtitle={subtitle}
        state={tileState(loading, total)}
      />
      <PlaceholderTile label="Regulatory & Compliance Audit" note="Pending compliance system integration" />
      <PlaceholderTile label="Vendor & Partner Review" note="Pending procurement system integration" />
    </div>
  );
}
