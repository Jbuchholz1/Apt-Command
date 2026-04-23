import { useState, useRef, useEffect } from 'react';
import { useEditingSignal } from './EditingContext';

/**
 * Inline-editable table cell. Click to edit, blur/Enter to save.
 * Accepts optional cellStyle for background color overrides (e.g. deadline urgency).
 * When multiline=true, renders a textarea. Enter saves; Shift+Enter inserts a newline.
 */
export default function EditableCell({ value, onSave, placeholder, className, cellStyle, defaultText, noValueStyle, multiline }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  // Locally-committed value rendered immediately after blur/Enter so the
  // cell updates in the same frame as the commit, regardless of how fast
  // the parent's optimistic state update propagates back as a new `value`
  // prop. Cleared as soon as the parent catches up (useEffect on `value`).
  const [pendingValue, setPendingValue] = useState(null);
  const inputRef = useRef(null);
  // Tell the board-wide editing context we're live, so auto-refresh pauses.
  useEditingSignal(editing);

  useEffect(() => {
    setDraft(value || '');
    // Defer to the parent's value whenever it changes — whether that's our
    // successful save's optimistic update, a rollback from a failed save,
    // or a background refresh that reconciled state.
    setPendingValue(null);
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
      // Render the committed value immediately from local state. The parent
      // will follow up with an optimistic prop update; until then this
      // guarantees the user never sees their own edit lag by even a frame.
      setPendingValue(draft);
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

  // Prefer the locally-committed value if we have one — this is the
  // guaranteed-instant render path. Falls back to the prop as soon as the
  // parent catches up (useEffect clears pendingValue on prop change).
  const displayValue = pendingValue !== null ? pendingValue : value;
  const isEmpty = !displayValue;
  const appliedStyle = isEmpty && noValueStyle ? { ...cellStyle, ...noValueStyle } : cellStyle;

  return (
    <td
      className={`editable-cell ${className || ''}`}
      style={appliedStyle}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title={multiline ? 'Click to edit — Shift+Enter for new line, Enter to save' : 'Click to edit'}
    >
      {displayValue
        ? (multiline
            // Render manual newlines as <br> so the td's normal wrapping behavior
            // (max-width + word-wrap: break-word) keeps working unchanged.
            ? String(displayValue).split('\n').map((line, i, arr) => (
                <span key={i}>
                  {line}
                  {i < arr.length - 1 && <br />}
                </span>
              ))
            : displayValue)
        : <span className={isEmpty && defaultText ? 'editable-default-text' : 'editable-placeholder'}>{defaultText || placeholder || '—'}</span>}
    </td>
  );
}
