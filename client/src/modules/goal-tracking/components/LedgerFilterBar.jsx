import { ChevronDown } from 'lucide-react';

const TABS = [
  { value: 'all', label: 'ALL' },
  { value: 'mine', label: 'MY GOALS' },
  { value: 'company', label: 'COMPANY PRIORITIES' },
];

const STATUS_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'on', label: 'On track' },
  { value: 'at-risk', label: 'At risk' },
  { value: 'off', label: 'Off track' },
  { value: 'complete', label: 'Complete' },
];

export default function LedgerFilterBar({
  view,
  onViewChange,
  owners,
  owner,
  onOwnerChange,
  statusFilter,
  onStatusFilterChange,
  goalCount,
  priorityCount,
}) {
  const statusLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label || 'Any';

  return (
    <div className="ql-filter-bar">
      <div className="ql-filter-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={view === t.value}
            className={`ql-filter-tab ${view === t.value ? 'is-active' : ''}`}
            onClick={() => onViewChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <span className="ql-filter-divider" aria-hidden />

      <label className="ql-filter-select">
        <span className="ql-filter-select-label">
          {owner
            ? (owners.find(o => o.email === owner)?.name || owner)
            : 'All Owners'}
        </span>
        <ChevronDown size={13} aria-hidden />
        <select
          className="ql-filter-select-native"
          value={owner || ''}
          onChange={(e) => onOwnerChange(e.target.value || null)}
        >
          <option value="">All Owners</option>
          {owners.map(o => (
            <option key={o.email} value={o.email}>{o.name || o.email}</option>
          ))}
        </select>
      </label>

      <label className="ql-filter-select">
        <span className="ql-filter-select-label">Status: {statusLabel}</span>
        <ChevronDown size={13} aria-hidden />
        <select
          className="ql-filter-select-native"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      <span className="ql-filter-spacer" />

      <span className="ql-filter-count">
        {goalCount} GOALS · {priorityCount} COMPANY {priorityCount === 1 ? 'PRIORITY' : 'PRIORITIES'}
      </span>
    </div>
  );
}
