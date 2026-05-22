import { BarChart, Bar, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '../lib/constants';

export default function InputVsGoalsChart({ recruiters, startDate, endDate }) {
  if (!recruiters || recruiters.length === 0) return null;

  // Pacing: spread goal is a quarterly (13-week) target.
  // The pacing line shows what fraction of the goal the selected date range represents.
  // E.g., 2-week range = 2/13 ≈ 15.4% of goal; YTD ≈ 21 weeks ≈ 161% of goal.
  const QUARTER_WEEKS = 13;
  let pacingFraction = 1;
  if (startDate && endDate) {
    const start = new Date(startDate + 'T00:00:00').getTime();
    const end = new Date(endDate + 'T23:59:59').getTime();
    const rangeMs = end - start;
    const rangeWeeks = rangeMs / (7 * 24 * 60 * 60 * 1000);
    pacingFraction = Math.max(0, rangeWeeks / QUARTER_WEEKS);
  }

  const data = recruiters.map(r => {
    const scaledGoal = Math.round(r.spreadGoal * pacingFraction);
    return {
      name: r.name,
      tier: `Tier ${r.tier}`,
      goal: scaledGoal,
      actual: r.metrics.newInput,
      pacing: scaledGoal,
    };
  });

  const formatDollar = (val) => `$${Number(val).toLocaleString()}`;
  const pacingPct = Math.round(pacingFraction * 100);

  return (
    <div className="chart-section">
      <h3 className="section-title">New Input Totals vs Goals</h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={0}
          />
          <YAxis tickFormatter={formatDollar} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(val) => formatDollar(val)} />
          <Legend />
          <Bar dataKey="goal" name="Spread Goal" fill={CHART_COLORS.navy} radius={[3, 3, 0, 0]} />
          <Bar dataKey="actual" name="New Input" fill={CHART_COLORS.gold} radius={[3, 3, 0, 0]} />
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
