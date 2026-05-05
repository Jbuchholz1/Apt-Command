const STATUS_CLASS = {
  'Unqualified': 'of-status-pill--unqualified',
  'Qualified Lead': 'of-status-pill--qualified-lead',
  'Proposal': 'of-status-pill--proposal',
  'Negotiation': 'of-status-pill--negotiation',
  'Active Account': 'of-status-pill--active-account',
  'Passive Account': 'of-status-pill--passive-account',
  'DNC': 'of-status-pill--dnc',
  'Archive': 'of-status-pill--archive',
};

export default function ClientStatusPill({ value, options, onSave }) {
  const colorClass = STATUS_CLASS[value] || 'of-status-pill--unqualified';
  // If Bullhorn has a value that isn't in the current picklist (e.g. an old
  // tenant value the sync didn't translate), surface it as a "(legacy)"
  // option instead of silently letting the browser fall back to option #0.
  const knownValues = new Set(options.map((o) => o.value));
  const orphan = value && !knownValues.has(value) ? value : null;

  return (
    <div className="of-status-row">
      <span className="of-status-row-label">Status</span>
      <select
        className={`of-status-pill ${colorClass}`}
        value={value || 'Unqualified'}
        onChange={(e) => onSave(e.target.value)}
        title="Change client status"
      >
        {orphan && <option value={orphan}>{orphan} (legacy)</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
