import { useState } from 'react';
import { X } from 'lucide-react';
import { pmCreateProject } from '../../lib/api';
import { showToast } from '../../lib/toast';

const COLORS = ['#04144F', '#0F8A5F', '#B8851A', '#B42C2C', '#7C3AED', '#0E7490', '#D3BF30'];

export default function NewProjectModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setSubmitting(true);
      const res = await pmCreateProject({ name: name.trim(), description: description.trim(), color });
      onCreated(res.project);
    } catch (err) {
      showToast(err.message || 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pm-modal-overlay" onClick={onClose}>
      <div className="pm-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-modal-header">
          <h2>New Project</h2>
          <button className="pm-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="pm-modal-body">
            <div className="pm-field">
              <label htmlFor="pm-new-name">Name</label>
              <input
                id="pm-new-name"
                className="pm-input"
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Onboarding Rollout, Q3 Initiatives"
                required
              />
            </div>
            <div className="pm-field">
              <label htmlFor="pm-new-desc">Description (optional)</label>
              <textarea
                id="pm-new-desc"
                className="pm-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this project about?"
              />
            </div>
            <div className="pm-field">
              <label>Color</label>
              <div className="pm-label-color-picker">
                {COLORS.map(c => (
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
            </div>
          </div>
          <div className="pm-modal-footer">
            <button type="button" className="pm-btn pm-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pm-btn" disabled={submitting || !name.trim()}>
              {submitting ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
