import { STATUS_COLORS } from '../lib/status';

export default function ProgressBar({ pct, status = 'green' }) {
  const width = Math.min(100, Math.max(0, pct || 0));
  return (
    <div className="gt-progress-track">
      <div
        className="gt-progress-fill"
        style={{ width: `${width}%`, background: STATUS_COLORS[status] || STATUS_COLORS.green }}
      />
    </div>
  );
}
