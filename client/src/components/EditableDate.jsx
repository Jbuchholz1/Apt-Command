import { useState, useRef, useEffect } from 'react';

/**
 * Inline-editable table cell with a date picker.
 * Click to open date input, change to save, blur/Escape to cancel.
 */
export default function EditableDate({ value, onSave, className }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  // Convert ISO date string to YYYY-MM-DD for input
  const toInputDate = (val) => {
    if (!val) return '';
    try {
      return new Date(val).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.showPicker?.();
    }
  }, [editing]);

  const commit = (newValue) => {
    setEditing(false);
    const oldDate = toInputDate(value);
    if (newValue !== oldDate) {
      // Send as Unix ms timestamp for Bullhorn
      const ts = newValue ? new Date(newValue + 'T12:00:00').getTime() : null;
      onSave(ts);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setEditing(false);
    } else if (e.key === 'Enter') {
      commit(inputRef.current?.value || '');
    }
  };

  const formatDisplay = (val) => {
    if (!val) return null;
    try {
      return new Date(val).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', timeZone: 'America/Chicago',
      });
    } catch {
      return null;
    }
  };

  if (editing) {
    return (
      <td className={`editable-cell editing ${className || ''}`} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="date"
          className="editable-date-input"
          defaultValue={toInputDate(value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </td>
    );
  }

  return (
    <td
      className={`editable-cell ${className || ''}`}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title="Click to edit"
    >
      {formatDisplay(value) || <span className="editable-placeholder">—</span>}
    </td>
  );
}
