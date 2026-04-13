import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

export default function AppShell() {
  const { instance, accounts } = useMsal();
  const location = useLocation();
  const userName = accounts[0]?.name || accounts[0]?.username || '';
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
  };

  // Close mobile sidebar on navigation
  const handleNavClick = () => setMobileOpen(false);

  return (
    <div className="app-shell">
      <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>
        <Menu size={20} />
      </button>
      <div
        className={`mobile-overlay ${mobileOpen ? 'visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      />
      <div onClick={handleNavClick}>
        <Sidebar
          userName={userName}
          onLogout={handleLogout}
          mobileOpen={mobileOpen}
        />
      </div>
      <div className="shell-content">
        <Outlet />
      </div>
    </div>
  );
}
