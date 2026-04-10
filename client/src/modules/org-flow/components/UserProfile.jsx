import { useState, useEffect } from 'react';
import { ArrowLeft, User, Mail, Shield, Calendar, Key } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function UserProfile({ onBack }) {
  const user = { id: 'temp-user-id' }; // TODO: Replace with MSAL
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user?.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setProfile(data);
        setFullName(data.full_name || '');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', user?.id);

      if (error) throw error;

      setSuccess('Profile updated successfully!');
      setEditing(false);
      loadProfile();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setSuccess('Password changed successfully!');
      setChangingPassword(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="of-page of-center">
        <div className="of-text-muted">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="of-page">
      <header className="of-header-dark">
        <div className="of-container-narrow of-header-inner-profile">
          <button
            onClick={onBack}
            className="of-back-btn of-back-btn--gold"
          >
            <ArrowLeft className="of-icon-sm" />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="of-page-title of-page-title--white">My Profile</h1>
        </div>
      </header>

      <main className="of-container-narrow of-main-content">
        {error && (
          <div className="of-alert of-alert--error">
            {error}
          </div>
        )}
        {success && (
          <div className="of-alert of-alert--success">
            {success}
          </div>
        )}

        <div className="of-profile-card">
          <div className="of-profile-card-header">
            <div className="of-profile-avatar-row">
              <div className="of-profile-avatar">
                <User className="of-icon-lg of-icon-navy" />
              </div>
              <div>
                <h2 className="of-profile-name">{profile?.full_name || 'User'}</h2>
                <p className="of-profile-email">{profile?.email}</p>
              </div>
            </div>
          </div>

          <div className="of-profile-card-body">
            <div className="of-profile-grid">
              <div className="of-profile-field">
                <div className="of-profile-field-label">
                  <Mail className="of-icon-sm" />
                  <span>Email</span>
                </div>
                <p className="of-profile-field-value">{profile?.email}</p>
              </div>

              <div className="of-profile-field">
                <div className="of-profile-field-label">
                  <Shield className="of-icon-sm" />
                  <span>Role</span>
                </div>
                <p className="of-profile-field-value">
                  <span
                    className={`of-badge ${
                      profile?.role === 'admin'
                        ? 'of-badge--gold'
                        : 'of-badge--gray'
                    }`}
                  >
                    {profile?.role === 'admin' ? 'Admin' : 'Basic User'}
                  </span>
                </p>
              </div>

              <div className="of-profile-field">
                <div className="of-profile-field-label">
                  <Calendar className="of-icon-sm" />
                  <span>Member Since</span>
                </div>
                <p className="of-profile-field-value">
                  {new Date(profile?.created_at || '').toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              <div className="of-profile-field">
                <div className="of-profile-field-label">
                  <User className="of-icon-sm" />
                  <span>Full Name</span>
                </div>
                {editing ? (
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="of-input of-input--indented"
                    placeholder="Enter your full name"
                  />
                ) : (
                  <p className="of-profile-field-value">
                    {profile?.full_name || <span className="of-text-muted">Not set</span>}
                  </p>
                )}
              </div>
            </div>

            {editing ? (
              <form onSubmit={handleUpdateProfile} className="of-profile-edit-actions">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setFullName(profile?.full_name || '');
                    setError('');
                  }}
                  className="of-btn of-btn--secondary of-btn--flex"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="of-btn of-btn--primary of-btn--flex"
                >
                  Save Changes
                </button>
              </form>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="of-btn of-btn--primary of-btn--full"
              >
                Edit Profile
              </button>
            )}
          </div>
        </div>

        <div className="of-profile-card of-profile-card--security">
          <div className="of-profile-card-header">
            <div className="of-profile-avatar-row">
              <div className="of-profile-avatar">
                <Key className="of-icon-lg of-icon-navy" />
              </div>
              <div>
                <h2 className="of-profile-name">Security</h2>
                <p className="of-profile-email">Change your password</p>
              </div>
            </div>
          </div>

          <div className="of-profile-card-body">
            {changingPassword ? (
              <form onSubmit={handlePasswordReset} className="of-form-fields">
                <div className="of-form-group">
                  <label className="of-form-label">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="of-input"
                    placeholder="Enter new password"
                    required
                    minLength={6}
                  />
                </div>

                <div className="of-form-group">
                  <label className="of-form-label">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="of-input"
                    placeholder="Confirm new password"
                    required
                    minLength={6}
                  />
                </div>

                <div className="of-profile-edit-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setChangingPassword(false);
                      setNewPassword('');
                      setConfirmPassword('');
                      setError('');
                    }}
                    className="of-btn of-btn--secondary of-btn--flex"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="of-btn of-btn--primary of-btn--flex"
                  >
                    Change Password
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setChangingPassword(true)}
                className="of-btn of-btn--primary of-btn--full"
              >
                Change Password
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
