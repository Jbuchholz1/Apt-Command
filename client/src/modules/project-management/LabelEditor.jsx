import { useState } from 'react';
import { Plus } from 'lucide-react';

const LABEL_COLORS = ['#04144F', '#0F8A5F', '#B8851A', '#B42C2C', '#7C3AED', '#0E7490', '#D3BF30', '#64748b'];

function newId() { return Math.random().toString(36).slice(2, 10); }

export default function LabelEditor({ labels, onChange }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [color, setColor] = useState(LABEL_COLORS[0]);

  const remove = (id) => {
    onChange(labels.filter(l => l.id !== id));
  };

  const add = () => {
    const v = text.trim();
    if (!v) return;
    onChange([...labels, { id: newId(), name: v, color }]);
    setText('');
    setAdding(false);
  };

  return (
    <div className="pm-label-editor">
      <div className="pm-label-list">
        {labels.length === 0 && !adding && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No labels yet.</span>
        )}
        {labels.map(l => (
          <span key={l.id} className="pm-label-pill" style={{ background: l.color || 'var(--navy)' }}>
            {l.name}
            <button onClick={() => remove(l.id)} aria-label="Remove label">×</button>
          </span>
        ))}
      </div>
      {adding ? (
        <div className="pm-label-add">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Label name"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); add(); }
              if (e.key === 'Escape') { setAdding(false); setText(''); }
            }}
          />
          <div className="pm-label-color-picker">
            {LABEL_COLORS.map(c => (
              <button
                key={c}
                type="button"
                className={`pm-label-swatch ${color === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <button type="button" className="pm-btn" onClick={add} disabled={!text.trim()}>Add</button>
          <button
            type="button"
            className="pm-btn pm-btn-ghost"
            onClick={() => { setAdding(false); setText(''); }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="pm-btn pm-btn-secondary"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setAdding(true)}
        >
          <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          Add label
        </button>
      )}
    </div>
  );
}
