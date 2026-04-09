import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import { CHART_COLORS, POINTS } from '../lib/constants';

export default function GoalPointsChart({ recruiters }) {
  if (!recruiters || recruiters.length === 0) return null;

  const data = recruiters.map(r => ({
    name: r.name,
    'Subs Points': r.points.subsPoints,
    'Interview Points': r.points.interviewPoints,
    'Starts Points': r.points.startsPoints,
    total: r.points.total,
  }));

  return (
    <div className="chart-section">
      <h3 className="section-title">Goal Points Tracking</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            interval={0}
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <ReferenceLine
            y={POINTS.WEEKLY_TARGET}
            stroke={CHART_COLORS.goalLine}
            strokeDasharray="6 3"
            strokeWidth={2}
            label={{ value: `${POINTS.WEEKLY_TARGET} pt target`, position: 'right', fontSize: 11, fill: CHART_COLORS.goalLine }}
          />
          <Bar dataKey="Subs Points" stackId="a" fill={CHART_COLORS.subsPoints} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Interview Points" stackId="a" fill={CHART_COLORS.interviewPoints} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Starts Points" stackId="a" fill={CHART_COLORS.startsPoints} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
