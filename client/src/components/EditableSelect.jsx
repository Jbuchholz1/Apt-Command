import { useState, useRef, useEffect } from 'react';

/**
 * Inline-editable table cell with a dropdown select.
 * Click to open dropdown, select to save, blur/Escape to cancel.
 */
export default function EditableSelect({ value, displayValue, options, onSave, className }) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef(null);

  useEffect(() => {
    if (editing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [editing]);

  const commit = (newValue) => {
    setEditing(false);
    if (newValue !== value) {
      onSave(newValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <td className={`editable-cell editing ${className || ''}`} onClick={e => e.stopPropagation()}>
        <select
          ref={selectRef}
          className="editable-select"
          value={value || ''}
          onChange={e => commit(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={handleKeyDown}
        >
          <option value="">—</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </td>
    );
  }

  return (
    <td
      className={`editable-cell ${className || ''}`}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title="Click to edit"
    >
      {displayValue || value || <span className="editable-placeholder">—</span>}
    </td>
  );
}
