export default function LiveTile({ label, value, subtitle, state = 'ready' }) {
  if (state === 'loading') {
    return (
      <div className="exec-kpi-card is-live-loading">
        <div className="exec-kpi-header">
          <span className="exec-kpi-label">{label}</span>
        </div>
        <div className="exec-kpi-value exec-kpi-skeleton">&nbsp;</div>
        <div className="exec-kpi-subtitle">Loading…</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="exec-kpi-card is-live-error">
        <div className="exec-kpi-header">
          <span className="exec-kpi-label">{label}</span>
        </div>
        <div className="exec-kpi-value">—</div>
        <div className="exec-kpi-subtitle">Failed to load</div>
      </div>
    );
  }
  return (
    <div className="exec-kpi-card">
      <div className="exec-kpi-header">
        <span className="exec-kpi-label">{label}</span>
      </div>
      <div className="exec-kpi-value">{value}</div>
      {subtitle && <div className="exec-kpi-subtitle">{subtitle}</div>}
    </div>
  );
}
