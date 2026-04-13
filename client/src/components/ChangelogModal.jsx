import { useEffect } from 'react';
import { CHANGELOG, APP_VERSION } from '../lib/version';

const TYPE_LABELS = { major: 'Major', minor: 'Feature', patch: 'Fix' };
const TYPE_CLASSES = { major: 'changelog-tag-major', minor: 'changelog-tag-minor', patch: 'changelog-tag-patch' };

export default function ChangelogModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="changelog-overlay" onClick={onClose}>
      <div className="changelog-modal" onClick={(e) => e.stopPropagation()}>
        <div className="changelog-header">
          <h2>Release Notes</h2>
          <span className="changelog-current">v{APP_VERSION}</span>
          <button className="changelog-close" onClick={onClose}>&times;</button>
        </div>
        <div className="changelog-body">
          {CHANGELOG.map((release) => (
            <div key={release.version} className="changelog-release">
              <div className="changelog-release-header">
                <span className="changelog-version">v{release.version}</span>
                <span className="changelog-title">{release.title}</span>
                <span className="changelog-date">{release.date}</span>
              </div>
              <ul className="changelog-list">
                {release.changes.map((change, i) => (
                  <li key={i} className="changelog-item">
                    <span className={`changelog-tag ${TYPE_CLASSES[change.type]}`}>
                      {TYPE_LABELS[change.type]}
                    </span>
                    {change.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
