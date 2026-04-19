import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { periodBounds } from '../lib/period';

function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ProgressGraph({ checkins, period }) {
  if (!checkins || checkins.length === 0) {
    return <div className="gt-empty">No check-ins yet.</div>;
  }

  const data = checkins.map(c => ({
    date: formatShortDate(c.created_at),
    ts: new Date(c.created_at).getTime(),
    pct: Math.round(Number(c.progress_pct) || 0),
  }));

  let pacing = null;
  if (period) {
    const { start, end } = periodBounds(period);
    pacing = [
      { ts: start.getTime(), pct: 0 },
      { ts: end.getTime(), pct: 100 },
    ];
  }

  const combined = pacing ? data : data;

  return (
    <div className="gt-graph">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={combined} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => `${v}%`} />
          {pacing && (
            <ReferenceLine
              segment={[
                { x: combined[0]?.date, y: 0 },
                { x: combined[combined.length - 1]?.date, y: 100 },
              ]}
              stroke="#cbd5e1"
              strokeDasharray="4 4"
            />
          )}
          <Line
            type="monotone"
            dataKey="pct"
            stroke="#04144F"
            strokeWidth={2}
            dot={{ r: 3, fill: '#04144F' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
