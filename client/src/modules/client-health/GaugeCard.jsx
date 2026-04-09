function getColor(pct, invert) {
  const p = invert ? 100 - pct : pct;
  if (p >= 80) return '#16a34a';
  if (p >= 50) return '#eab308';
  if (p >= 25) return '#f97316';
  return '#dc2626';
}

function formatValue(value, format) {
  if (value === null || value === undefined) return '—';
  if (format === 'currency') return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === 'percent') return `${value}`;
  return Number(value).toLocaleString('en-US');
}

export default function GaugeCard({ label, value, target, format, invert, placeholder }) {
  const pct = (value !== null && target > 0) ? Math.min((value / target) * 100, 100) : 0;
  const color = placeholder ? '#e2e8f0' : getColor(pct, invert);

  // SVG arc for the gauge (180 degrees)
  const radius = 50;
  const cx = 60;
  const cy = 60;
  const startAngle = Math.PI;
  const endAngle = startAngle + (Math.PI * pct / 100);

  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy + radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy + radius * Math.sin(endAngle);
  const largeArc = pct > 50 ? 1 : 0;

  // Needle angle
  const needleAngle = startAngle + (Math.PI * pct / 100);
  const needleLen = radius - 12;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy + needleLen * Math.sin(needleAngle);

  return (
    <div className="gauge-card">
      <div className="gauge-header">
        <span className="gauge-label">{label}</span>
        <span className="gauge-target">Target: {format === 'currency' ? `$${target.toLocaleString()}` : target.toLocaleString()}</span>
      </div>
      <div className="gauge-value" style={{ color: placeholder ? '#94a3b8' : color }}>
        {formatValue(value, format)}
      </div>
      <svg viewBox="0 0 120 70" className="gauge-svg">
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none" stroke="#e2e8f0" strokeWidth="10" strokeLinecap="round"
        />
        {/* Value arc */}
        {!placeholder && pct > 0 && (
          <path
            d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          />
        )}
        {/* Needle */}
        {!placeholder && (
          <>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#475569" strokeWidth="2" />
            <circle cx={cx} cy={cy} r="3" fill="#475569" />
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
