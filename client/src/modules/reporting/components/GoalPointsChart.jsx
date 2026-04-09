import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '../lib/constants';

export default function GoalPointsChart({ recruiters, goalForRange }) {
  if (!recruiters || recruiters.length === 0) return null;

  const goal = goalForRange || 26;

  const data = recruiters.map(r => ({
    name: r.name,
    'MAR Points': r.points.total,
    'Goal': goal,
  }));

  return (
    <div className="chart-section">
      <h3 className="section-title">MAR Tracking</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} barGap={4} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            interval={0}
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="Goal" fill={CHART_COLORS.navy} radius={[3, 3, 0, 0]} />
          <Bar dataKey="MAR Points" fill={CHART_COLORS.gold} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
