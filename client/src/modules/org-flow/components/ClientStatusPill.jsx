const STATUS_CLASS = {
  'Active': 'of-status-pill--active',
  'Prospect': 'of-status-pill--prospect',
  'On Hold': 'of-status-pill--onhold',
  'Inactive': 'of-status-pill--inactive',
  'Lost': 'of-status-pill--lost',
};

export default function ClientStatusPill({ value, options, onSave }) {
  const colorClass = STATUS_CLASS[value] || 'of-status-pill--inactive';

  return (
    <div className="of-status-row">
      <span className="of-status-row-label">Status</span>
      <select
        className={`of-status-pill ${colorClass}`}
        value={value || 'Active'}
        onChange={(e) => onSave(e.target.value)}
        title="Change client status"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
