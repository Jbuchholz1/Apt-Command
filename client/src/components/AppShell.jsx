import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import UniversalSearch from './UniversalSearch/UniversalSearch';
import { UserRoleProvider, useUserRole } from '../lib/UserRoleContext';

function AppShellInner() {
  const { instance, accounts } = useMsal();
  const location = useLocation();
  const userName = accounts[0]?.name || accounts[0]?.username || '';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { role: userRole } = useUserRole();

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
  };

  // Close mobile sidebar on navigation
  const handleNavClick = () => setMobileOpen(false);

  // Global Cmd+K / Ctrl+K toggles the Universal Search modal.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
          userRole={userRole}
          onLogout={handleLogout}
          mobileOpen={mobileOpen}
          onOpenSearch={() => setSearchOpen(true)}
        />
      </div>
      <div className="shell-content">
        <Outlet />
      </div>
      <UniversalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export default function AppShell() {
  return (
    <UserRoleProvider>
      <AppShellInner />
    </UserRoleProvider>
  );
}
