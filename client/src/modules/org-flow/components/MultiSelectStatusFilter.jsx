import { useEffect, useRef, useState } from 'react';

export default function MultiSelectStatusFilter({ options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (value) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const label = selected.size === 0
    ? 'All Statuses'
    : selected.size === 1
      ? [...selected][0]
      : `${selected.size} statuses`;

  return (
    <div className="of-multi-select" ref={ref}>
      <button
        type="button"
        className="of-sort-select of-multi-select-btn"
        onClick={() => setOpen((o) => !o)}
        title="Filter by status"
      >
        <span className="of-multi-select-label">{label}</span>
        <span className="of-multi-select-chevron">▾</span>
      </button>
      {open && (
        <div className="of-multi-select-panel" role="listbox">
          <button
            type="button"
            className="of-multi-select-clear"
            onClick={() => onChange(new Set())}
            disabled={selected.size === 0}
          >
            Clear all
          </button>
          {options.map((opt) => (
            <label key={opt.value} className="of-multi-select-item">
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
