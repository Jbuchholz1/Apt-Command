import PlaceholderTile from './components/PlaceholderTile';

const TILES = [
  { label: 'New Reqs', note: 'From Bullhorn JobOrder, dateAdded in range' },
  { label: 'New Placements This Week', note: 'From Bullhorn Placement, dateBegin in range' },
  { label: 'Candidate Submissions', note: 'From Bullhorn Sendout/JobSubmission' },
  { label: 'Offers Extended & Accepted', note: 'From Bullhorn JobSubmission status transitions' },
  { label: 'Active Contractor Headcount (Δ vs prior week)', note: 'From Bullhorn active Placements with WoW delta' },
  { label: 'Attrition / Dropouts This Week', note: 'From Bullhorn backout notes (NoteEntity)' },
  { label: 'Client Escalations / Issues', note: 'Pending intake source (Slack channel or custom field)' },
  { label: 'Revenue / Spread / Pipeline (weekly movement)', note: 'From Bullhorn placement spread × commission %' },
  { label: 'Collections & Payments Received', note: 'Pending accounting integration' },
];

export default function WeeklyTab() {
  return (
    <div className="exec-kpi-grid">
      {TILES.map((t) => (
        <PlaceholderTile key={t.label} label={t.label} note={t.note} />
      ))}
    </div>
  );
}
