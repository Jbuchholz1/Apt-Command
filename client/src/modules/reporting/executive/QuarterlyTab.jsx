import PlaceholderTile from './components/PlaceholderTile';

const TILES = [
  { label: 'P&L Statement (Full)', note: 'Pending accounting integration' },
  { label: 'Revenue Forecast (next 2 quarters)', note: 'Pending pipeline weighting model' },
  { label: 'Budget vs Actuals', note: 'Pending GL + budget setup' },
  { label: 'Headcount Plan vs Actuals', note: 'From Supabase employees + Bullhorn Placements' },
  { label: 'Talent Pipeline Health Report', note: 'From Bullhorn funnel — Lead → Sub → Interview → Placement' },
  { label: 'Key Client Reviews & Health Scores', note: 'From /api/client-health endpoint' },
  { label: 'Regulatory & Compliance Audit', note: 'Pending compliance system integration' },
  { label: 'Vendor & Partner Review', note: 'Pending procurement system integration' },
];

export default function QuarterlyTab() {
  return (
    <div className="exec-kpi-grid">
      {TILES.map((t) => (
        <PlaceholderTile key={t.label} label={t.label} note={t.note} />
      ))}
    </div>
  );
}
