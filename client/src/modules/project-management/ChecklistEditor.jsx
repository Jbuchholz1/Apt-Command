import { useState } from 'react';
import { Plus, X } from 'lucide-react';

function newId() { return Math.random().toString(36).slice(2, 10); }

export default function ChecklistEditor({ checklist, onChange }) {
  const [text, setText] = useState('');
  const items = Array.isArray(checklist) ? checklist : [];
  const done = items.filter(i => i.done).length;

  const toggle = (id) => {
    onChange(items.map(i => i.id === id ? { ...i, done: !i.done } : i));
  };

  const updateText = (id, newText) => {
    onChange(items.map(i => i.id === id ? { ...i, text: newText } : i));
  };

  const remove = (id) => {
    onChange(items.filter(i => i.id !== id));
  };

  const add = (e) => {
    e?.preventDefault?.();
    const v = text.trim();
    if (!v) return;
    const maxPos = items.reduce((m, i) => Math.max(m, i.position || 0), 0);
    onChange([...items, { id: newId(), text: v, done: false, position: maxPos + 1 }]);
    setText('');
  };

  return (
    <div>
      {items.length > 0 && (
        <div className="pm-checklist-progress">
          <span>{done}/{items.length}</span>
          <div className="pm-checklist-bar">
            <div className="pm-checklist-bar-fill" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
          </div>
          <span>{items.length ? Math.round((done / items.length) * 100) : 0}%</span>
        </div>
      )}
      <div className="pm-checklist">
        {items.map(item => (
          <div key={item.id} className={`pm-checklist-item ${item.done ? 'done' : ''}`}>
            <input
              type="checkbox"
              checked={!!item.done}
              onChange={() => toggle(item.id)}
            />
            <input
              className="pm-checklist-item-text"
              value={item.text}
              onChange={e => updateText(item.id, e.target.value)}
            />
            <button
              className="pm-checklist-remove"
              onClick={() => remove(item.id)}
              aria-label="Remove item"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <form className="pm-add-checklist-form" onSubmit={add}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add an item…"
        />
        <button type="submit" className="pm-btn" disabled={!text.trim()}>
          <Plus size={12} style={{ marginRight: 2, verticalAlign: -1 }} />
          Add
        </button>
      </form>
    </div>
  );
}
