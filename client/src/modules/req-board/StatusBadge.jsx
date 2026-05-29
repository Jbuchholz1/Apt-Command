import { memo } from 'react';
import { STATUS_COLORS, STATUS_ABBREV } from './lib/statusConstants';

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || { bg: '#6b7280', text: '#fff' };
  const abbrev = STATUS_ABBREV[status] || status || '—';
  return (
    <span
      className="status-badge"
      style={{ backgroundColor: colors.bg, color: colors.text }}
      title={status}
    >
      {abbrev}
    </span>
  );
}

export default memo(StatusBadge);
