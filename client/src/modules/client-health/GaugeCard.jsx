// Color by value relative to target. For invert gauges (lower is better, e.g.
// Backout %), being AT or UNDER target is good (green) and color degrades as the
// value exceeds the target. The old `100 - pct` flip colored an 8%/10% backout
// (comfortably under target) fully red, because it measured "consumption of the
// 0–100 fill" rather than performance against the threshold.
function getColor(value, target, invert) {
  if (value == null || !(target > 0)) return '#16a34a';
  const ratio = value / target;
  if (invert) {
    if (ratio <= 1) return '#16a34a';   // at/under the limit — good
    if (ratio <= 1.25) return '#eab308';
    if (ratio <= 1.5) return '#f97316';
    return '#dc2626';
  }
  const p = ratio * 100;                // higher is better
  if (p >= 80) return '#16a34a';
  if (p >= 50) return '#eab308';
  if (p >= 25) return '#f97316';
  return '#dc2626';
}

function formatValue(value, format) {
  if (value === null || value === undefined) return '—';
  if (format === 'currency') return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === 'percent') return `${value}%`;
  return Number(value).toLocaleString('en-US');
}

function describeArc(cx, cy, radius, startDeg, endDeg) {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export default function GaugeCard({ label, value, target, format, invert, placeholder, details, onClick, tooltip }) {
  const pct = (value !== null && target > 0) ? Math.min((value / target) * 100, 100) : 0;
  const color = placeholder ? '#e2e8f0' : getColor(value, target, invert);

  const radius = 45;
  const cx = 60;
  const cy = 55;

  // Arc goes from 180° (left) to 360° (right) = half circle
  const bgPath = describeArc(cx, cy, radius, 180, 360);
  const valueDeg = 180 + (180 * pct / 100);
  const valPath = pct > 0 ? describeArc(cx, cy, radius, 180, Math.min(valueDeg, 359.9)) : '';

  // Needle
  const needleRad = ((180 + (180 * pct / 100)) * Math.PI) / 180;
  const needleLen = radius - 10;
  const nx = cx + needleLen * Math.cos(needleRad);
  const ny = cy + needleLen * Math.sin(needleRad);

  return (
    <div className={`gauge-card ${details?.length ? 'gauge-clickable' : ''}`} onClick={() => details?.length && onClick?.(label, details)}>
      <div className="gauge-header">
        <span className="gauge-label">
          {label}
          {tooltip && <span className="gauge-tooltip-icon" title={tooltip}>{'\u24D8'}</span>}
        </span>
        <span className="gauge-target">Target: {format === 'currency' ? `$${target.toLocaleString()}` : format === 'percent' ? `${target}%` : target.toLocaleString()}</span>
      </div>
      <div className="gauge-value" style={{ color: placeholder ? '#94a3b8' : color }}>
        {formatValue(value, format)}
      </div>
      <svg viewBox="0 0 120 65" className="gauge-svg">
        {/* Background arc */}
        <path d={bgPath} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        {/* Value arc */}
        {!placeholder && pct > 0 && (
          <path d={valPath} fill="none" stroke={color} strokeWidth="8" />
        )}
        {/* Needle */}
        {!placeholder && (
          <>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#475569" strokeWidth="1.5" />
            <circle cx={cx} cy={cy} r="2.5" fill="#475569" />
          </>
        )}
      </svg>
      {!placeholder && value !== null && (
        <div className="gauge-delta" style={{ color }}>
          {'\u25B2'} {formatValue(value, format)}
        </div>
      )}
    </div>
  );
}
