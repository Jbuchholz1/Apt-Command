import PlaceholderTile from './components/PlaceholderTile';

const TILES = [
  { label: 'Gross Revenue (USD)', note: 'Pending accounting integration' },
  { label: 'Net Revenue / Gross Margin', note: 'Pending accounting + payroll integration' },
  { label: 'Accounts Receivable Aging', note: 'Pending accounting integration' },
  { label: 'New Hires vs Attrition (Net)', note: 'From Bullhorn Placements + backout notes' },
  { label: 'Active Clients (paying)', note: 'Pending AR integration to filter to paying' },
  { label: 'New Clients Onboarded', note: 'From Bullhorn — first JobOrder per Client in month' },
  { label: 'Client Retention Rate (%)', note: 'From Bullhorn cohort comparison MoM' },
  { label: 'Payroll & Benefits Cost', note: 'Pending HR/payroll integration (ADP/Gusto)' },
  { label: 'Compliance & Legal Updates', note: 'Pending compliance system integration' },
  { label: 'P&L Statement', note: 'Pending accounting integration' },
  { label: 'GP vs Budget / Earnout Tracker', note: 'Pending accounting + budget setup' },
  { label: 'Contractor Headcount + Margins + Off-boards Next Month', note: 'From Bullhorn Placements with dateEnd in [today, +30d]' },
  { label: 'YTD Trackers — GP / Revenue / Earnout', note: 'From Bullhorn YTD aggregation' },
  { label: 'Cost-Saving Potential', note: 'Pending vendor benchmark data' },
];

export default function MonthlyTab(_props) {
  return (
    <div className="exec-kpi-grid">
      {TILES.map((t) => (
        <PlaceholderTile key={t.label} label={t.label} note={t.note} />
      ))}
    </div>
  );
}
