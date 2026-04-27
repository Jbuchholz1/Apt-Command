export default function LiveTile({ label, value, subtitle, state = 'ready', onClick, clickable = false }) {
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
  const isClickable = clickable && onClick;
  return (
    <div
      className={`exec-kpi-card ${isClickable ? 'clickable' : ''}`}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="exec-kpi-header">
        <span className="exec-kpi-label">{label}</span>
      </div>
      <div className="exec-kpi-value">{value}</div>
      {subtitle && <div className="exec-kpi-subtitle">{subtitle}</div>}
      {isClickable && <div className="exec-kpi-hint">Click for details</div>}
    </div>
  );
}
