import { useState } from 'react';
import { changeExternalPassword } from '../lib/api';
import { setExternalToken } from '../lib/externalAuth';
import { useUserRole } from '../lib/UserRoleContext';

// Blocks the app behind a non-dismissable modal until the user picks a new
// password. Triggered when /api/users/me returns password_must_change=true
// (admin-issued initial password, or admin-issued reset).
export default function ForcePasswordChangeModal() {
  const { passwordMustChange, authProvider, acknowledgePasswordChange } = useUserRole();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!passwordMustChange || authProvider !== 'external') return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const res = await changeExternalPassword({ currentPassword, newPassword });
      if (res?.token) setExternalToken(res.token);
      acknowledgePasswordChange();
    } catch (err) {
      setError(err?.message || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff', borderRadius: 12, width: 'min(440px, 92vw)',
          padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Set a new password</h2>
        <p style={{ margin: '6px 0 16px', fontSize: 13, color: '#475569' }}>
          You must choose a new password before continuing. Minimum 12 characters,
          with at least one letter and one digit.
        </p>

        <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 10, marginBottom: 4 }}>
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 10, marginBottom: 4 }}>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        {error && (
          <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '8px 14px',
              border: '1px solid #0f172a',
              background: '#0f172a',
              color: '#fff',
              borderRadius: 6,
              cursor: submitting ? 'wait' : 'pointer',
              fontSize: 13,
            }}
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  marginTop: 4,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
};
