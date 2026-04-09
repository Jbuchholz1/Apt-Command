import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';

export default function AppShell() {
  const { instance, accounts } = useMsal();
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';
  const userName = accounts[0]?.name || accounts[0]?.username || '';

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
  };

  return (
    <div className="app-shell">
      <header className="app-shell-header">
        <div className="shell-header-left">
          {!isHome && (
            <button className="shell-back-btn" onClick={() => navigate('/')} title="Back to Home">
              &#8592;
            </button>
          )}
          <Link to="/" className="shell-brand">
            <img src="/apt-logo.jpg" alt="APT" className="shell-logo" />
            <h1 className="shell-title">APT Command</h1>
          </Link>
        </div>
        <div className="shell-header-right">
          <span className="shell-user-name">{userName}</span>
          <button className="shell-logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </header>
      <div className="shell-content">
        <Outlet />
      </div>
    </div>
  );
}
