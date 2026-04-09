import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../lib/authConfig';

export default function LoginPage() {
  const { instance } = useMsal();

  const handleLogin = () => {
    instance.loginRedirect(loginRequest).catch(err => {
      console.error('Login failed:', err);
    });
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
      </div>
    </div>
  );
}
