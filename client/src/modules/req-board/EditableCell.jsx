import { useState, useRef, useEffect } from 'react';

/**
 * Inline-editable table cell. Click to edit, blur/Enter to save.
 * Accepts optional cellStyle for background color overrides (e.g. deadline urgency).
 * When multiline=true, renders a textarea. Enter saves; Shift+Enter inserts a newline.
 */
export default function EditableCell({ value, onSave, placeholder, className, cellStyle, defaultText, noValueStyle, multiline }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== (value || '')) {
      onSave(draft);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      // In multiline mode: Shift+Enter = newline (default), plain Enter = save
      if (multiline && e.shiftKey) return; // let the textarea insert the newline
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setDraft(value || '');
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <td className={`editable-cell editing ${className || ''}`} style={cellStyle} onClick={e => e.stopPropagation()}>
        {multiline ? (
          <textarea
            ref={inputRef}
            className="editable-input editable-textarea"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={3}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            className="editable-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
          />
        )}
      </td>
    );
  }

  const isEmpty = !value;
  const appliedStyle = isEmpty && noValueStyle ? { ...cellStyle, ...noValueStyle } : cellStyle;

  return (
    <td
      className={`editable-cell ${className || ''}`}
      style={appliedStyle}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title={multiline ? 'Click to edit — Shift+Enter for new line, Enter to save' : 'Click to edit'}
    >
      {value
        ? value
        : <span className={isEmpty && defaultText ? 'editable-default-text' : 'editable-placeholder'}>{defaultText || placeholder || '—'}</span>}
    </td>
  );
}
