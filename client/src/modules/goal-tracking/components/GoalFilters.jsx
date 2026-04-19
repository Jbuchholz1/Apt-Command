const VIEW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'My Goals' },
  { value: 'company', label: 'Company Priorities' },
];

export default function GoalFilters({ view, onViewChange, owners, owner, onOwnerChange }) {
  return (
    <div className="gt-filters">
      <div className="gt-view-chips">
        {VIEW_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`gt-view-chip ${view === opt.value ? 'active' : ''}`}
            onClick={() => onViewChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {owners && owners.length > 0 && (
        <select
          className="gt-owner-select"
          value={owner || ''}
          onChange={e => onOwnerChange(e.target.value || null)}
        >
          <option value="">All Owners</option>
          {owners.map(o => (
            <option key={o.email} value={o.email}>{o.name || o.email}</option>
          ))}
        </select>
      )}
    </div>
  );
}
