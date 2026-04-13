import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { useUserRole } from '../lib/UserRoleContext';
import { getAnnouncement, updateAnnouncement, getReminder, updateReminder } from '../lib/api';
import { showToast } from '../lib/toast';
import { Megaphone, Bell, Pencil, Check, X } from 'lucide-react';

export default function HomePage() {
  const { accounts } = useMsal();
  const firstName = (accounts[0]?.name || '').split(' ')[0] || 'there';
  const { isAdmin } = useUserRole();

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const [announcement, setAnnouncement] = useState('');
  const [editingAnn, setEditingAnn] = useState(false);
  const [draftAnn, setDraftAnn] = useState('');
  const [savingAnn, setSavingAnn] = useState(false);

  const [reminder, setReminder] = useState('');
  const [editingRem, setEditingRem] = useState(false);
  const [draftRem, setDraftRem] = useState('');
  const [savingRem, setSavingRem] = useState(false);

  useEffect(() => {
    getAnnouncement()
      .then((data) => setAnnouncement(data?.text || ''))
      .catch(() => {});
    getReminder()
      .then((data) => setReminder(data?.text || ''))
      .catch(() => {});
  }, []);

  const handleEditAnn = () => {
    setDraftAnn(announcement);
    setEditingAnn(true);
  };

  const handleCancelAnn = () => {
    setEditingAnn(false);
    setDraftAnn('');
  };

  const handleSaveAnn = async () => {
    setSavingAnn(true);
    try {
      await updateAnnouncement(draftAnn);
      setAnnouncement(draftAnn.trim());
      setEditingAnn(false);
      showToast('Announcement updated', 'success');
    } catch {
      showToast('Failed to save announcement', 'error');
    } finally {
      setSavingAnn(false);
    }
  };

  const handleEditRem = () => {
    setDraftRem(reminder);
    setEditingRem(true);
  };

  const handleCancelRem = () => {
    setEditingRem(false);
    setDraftRem('');
  };

  const handleSaveRem = async () => {
    setSavingRem(true);
    try {
      await updateReminder(draftRem);
      setReminder(draftRem.trim());
      setEditingRem(false);
      showToast('Reminder updated', 'success');
    } catch {
      showToast('Failed to save reminder', 'error');
    } finally {
      setSavingRem(false);
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
          {isAdmin && !editingAnn && (
            <button className="announcement-edit-btn" onClick={handleEditAnn} title="Edit announcement">
              <Pencil size={14} />
            </button>
          )}
        </div>
        {editingAnn ? (
          <div className="announcement-editor">
            <textarea
              className="announcement-textarea"
              value={draftAnn}
              onChange={(e) => setDraftAnn(e.target.value)}
              rows={4}
              placeholder="Write an announcement for the team..."
              autoFocus
            />
            <div className="announcement-actions">
              <button className="announcement-save-btn" onClick={handleSaveAnn} disabled={savingAnn}>
                <Check size={14} />
                {savingAnn ? 'Saving...' : 'Save'}
              </button>
              <button className="announcement-cancel-btn" onClick={handleCancelAnn}>
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

      <div className="announcement-card">
        <div className="announcement-header">
          <Bell size={16} className="announcement-icon" />
          <span className="announcement-title">Reminders</span>
          {isAdmin && !editingRem && (
            <button className="announcement-edit-btn" onClick={handleEditRem} title="Edit reminder">
              <Pencil size={14} />
            </button>
          )}
        </div>
        {editingRem ? (
          <div className="announcement-editor">
            <textarea
              className="announcement-textarea"
              value={draftRem}
              onChange={(e) => setDraftRem(e.target.value)}
              rows={4}
              placeholder="Write a reminder for the team..."
              autoFocus
            />
            <div className="announcement-actions">
              <button className="announcement-save-btn" onClick={handleSaveRem} disabled={savingRem}>
                <Check size={14} />
                {savingRem ? 'Saving...' : 'Save'}
              </button>
              <button className="announcement-cancel-btn" onClick={handleCancelRem}>
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="announcement-body">
            {reminder ? (
              <p className="announcement-text">{reminder}</p>
            ) : (
              <p className="announcement-empty">No reminders right now.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
