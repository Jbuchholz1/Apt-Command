import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { useUserRole } from '../lib/UserRoleContext';
import { getAnnouncement, updateAnnouncement } from '../lib/api';
import { showToast } from '../lib/toast';
import { Megaphone, Pencil, Check, X } from 'lucide-react';

export default function HomePage() {
  const { accounts } = useMsal();
  const firstName = (accounts[0]?.name || '').split(' ')[0] || 'there';
  const { isAdmin } = useUserRole();

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const [announcement, setAnnouncement] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAnnouncement()
      .then((data) => setAnnouncement(data?.text || ''))
      .catch(() => {});
  }, []);

  const handleEdit = () => {
    setDraft(announcement);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAnnouncement(draft);
      setAnnouncement(draft.trim());
      setEditing(false);
      showToast('Announcement updated', 'success');
    } catch {
      showToast('Failed to save announcement', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="home-page">
      <h1 className="home-greeting">Welcome back, {firstName}</h1>
      <p className="home-date">{today}</p>
      <p className="home-tagline">Make a Difference. No, But Really.</p>

      <div className="announcement-card">
        <div className="announcement-header">
          <Megaphone size={16} className="announcement-icon" />
          <span className="announcement-title">Announcements</span>
          {isAdmin && !editing && (
            <button className="announcement-edit-btn" onClick={handleEdit} title="Edit announcement">
              <Pencil size={14} />
            </button>
          )}
        </div>
        {editing ? (
          <div className="announcement-editor">
            <textarea
              className="announcement-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder="Write an announcement for the team..."
              autoFocus
            />
            <div className="announcement-actions">
              <button className="announcement-save-btn" onClick={handleSave} disabled={saving}>
                <Check size={14} />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button className="announcement-cancel-btn" onClick={handleCancel}>
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="announcement-body">
            {announcement ? (
              <p className="announcement-text">{announcement}</p>
            ) : (
              <p className="announcement-empty">No announcements right now.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
