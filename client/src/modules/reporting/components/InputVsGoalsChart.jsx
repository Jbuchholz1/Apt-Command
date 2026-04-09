import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ReferenceLine, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '../lib/constants';

export default function InputVsGoalsChart({ recruiters }) {
  if (!recruiters || recruiters.length === 0) return null;

  const data = recruiters.map(r => ({
    name: r.name,
    tier: `Tier ${r.tier}`,
    goal: r.spreadGoal,
    actual: r.metrics.newInput,
  }));

  const formatDollar = (val) => `$${Number(val).toLocaleString()}`;

  return (
    <div className="chart-section">
      <h3 className="section-title">New Input Totals vs Goals</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
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
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
