import { Bar, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '../lib/constants';

const QUARTER_WEEKS = 13;

export default function GoalPointsChart({ recruiters, startDate, endDate, weeklyTarget = 26 }) {
  if (!recruiters || recruiters.length === 0) return null;

  const quarterGoal = weeklyTarget * QUARTER_WEEKS;

  // Pacing: what fraction of the 13-week quarter does the selected range represent?
  // Scales above 100% when the range exceeds a quarter (e.g. YTD ≈ 21 weeks → ~161%).
  let pacingFraction = 1;
  if (startDate && endDate) {
    const s = new Date(startDate + 'T00:00:00').getTime();
    const e = new Date(endDate + 'T23:59:59').getTime();
    const rangeWeeks = (e - s) / (7 * 24 * 60 * 60 * 1000);
    pacingFraction = Math.max(0, rangeWeeks / QUARTER_WEEKS);
  }

  const pacingPct = Math.round(pacingFraction * 100);
  const pacingTarget = Math.round(quarterGoal * pacingFraction);

  const data = recruiters.map(r => ({
    name: r.name,
    'Goal': pacingTarget,
    'MAR Points': r.points?.total ?? r.mar ?? 0,
    'pacing': pacingTarget,
  }));

  return (
    <div className="chart-section">
      <h3 className="section-title">MAR Tracking</h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
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
  );
}
