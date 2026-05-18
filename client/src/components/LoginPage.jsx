import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../lib/authConfig';
import { loginExternalUser } from '../lib/api';
import { setExternalToken } from '../lib/externalAuth';

export default function LoginPage() {
  const { instance } = useMsal();
  const [showExternal, setShowExternal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = () => {
    instance.loginRedirect(loginRequest).catch(err => {
      console.error('Login failed:', err);
    });
  };

  const handleExternalLogin = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await loginExternalUser({ email: email.trim(), password });
      if (!res?.token) throw new Error('Login failed — no token returned');
      setExternalToken(res.token);
      // Force a full reload so MSAL state + UserRoleProvider re-initialize
      // with the new token already in localStorage.
      window.location.href = '/';
    } catch (err) {
      setError(err?.message || 'Login failed');
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">APT Command</h1>
        <p className="login-subtitle">Operations Platform</p>
        <p className="login-desc">
          Sign in with your APT Microsoft account to access the platform.
        </p>
        <button className="login-btn" onClick={handleLogin}>
          <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Sign in with Microsoft
        </button>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          {!showExternal ? (
            <button
              type="button"
              onClick={() => setShowExternal(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Or sign in with email
            </button>
          ) : (
            <form onSubmit={handleExternalLogin} style={{ textAlign: 'left', marginTop: 8 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>
                Email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    marginTop: 4,
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 10, marginBottom: 4 }}>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    marginTop: 4,
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </label>
              {error && (
                <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => { setShowExternal(false); setError(''); }}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #0f172a',
                    background: '#0f172a',
                    color: '#fff',
                    borderRadius: 6,
                    cursor: submitting ? 'wait' : 'pointer',
                    fontSize: 13,
                  }}
                >
                  {submitting ? 'Signing in…' : 'Sign in'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
