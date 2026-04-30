const TABS = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
];

export default function TabNav({ active, onChange, rightSlot }) {
  return (
    <div className="exec-tab-nav" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={`exec-tab ${active === tab.id ? 'is-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      {rightSlot && <span className="exec-tab-range">{rightSlot}</span>}
    </div>
  );
}
