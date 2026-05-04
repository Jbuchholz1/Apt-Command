import { useState, useRef, useEffect } from 'react';

const STATUS_CLASS = {
  'Active': 'of-status-pill--active',
  'Prospect': 'of-status-pill--prospect',
  'On Hold': 'of-status-pill--onhold',
  'Inactive': 'of-status-pill--inactive',
  'Lost': 'of-status-pill--lost',
};

export default function ClientStatusPill({ value, options, onSave }) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef(null);

  useEffect(() => {
    if (editing && selectRef.current) selectRef.current.focus();
  }, [editing]);

  const commit = (newValue) => {
    setEditing(false);
    if (newValue !== value) onSave(newValue);
  };

  const stop = (e) => e.stopPropagation();

  const colorClass = STATUS_CLASS[value] || 'of-status-pill--inactive';

  if (editing) {
    return (
      <div
        className={`of-status-pill of-status-pill--editing ${colorClass}`}
        onClick={stop}
      >
        <select
          ref={selectRef}
          className="of-status-pill-select"
          value={value || ''}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          onClick={stop}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`of-status-pill ${colorClass}`}
      onClick={(e) => { stop(e); setEditing(true); }}
      title="Click to change status"
    >
      {value || 'Active'}
    </button>
  );
}
