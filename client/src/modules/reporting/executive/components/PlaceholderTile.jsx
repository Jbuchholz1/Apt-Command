export default function PlaceholderTile({ label, note }) {
  return (
    <div className="exec-kpi-card is-placeholder" title={note || ''}>
      <div className="exec-kpi-header">
        <span className="exec-kpi-label">{label}</span>
        <span className="exec-coming-soon-badge">Coming Soon</span>
      </div>
      <div className="exec-kpi-value">—</div>
      {note && <div className="exec-kpi-subtitle">{note}</div>}
    </div>
  );
}
