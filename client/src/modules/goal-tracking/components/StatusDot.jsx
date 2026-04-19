import { STATUS_COLORS } from '../lib/status';

export default function StatusDot({ status = 'green', size = 8, title }) {
  return (
    <span
      className="gt-status-dot"
      title={title || status}
      style={{ width: size, height: size, background: STATUS_COLORS[status] || STATUS_COLORS.gray }}
    />
  );
}
