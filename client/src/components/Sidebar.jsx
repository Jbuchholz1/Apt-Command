import { useState, useMemo } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  GitBranch,
  Users,
  Building2,
  BarChart3,

  Settings,
  Shield,
  Target,
  LifeBuoy,
  KanbanSquare,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  LogOut,
  Search,
} from 'lucide-react';
import { APP_VERSION } from '../lib/version';
import { useUserRole } from '../lib/UserRoleContext';
import { REPORTING_SUB_KEYS } from '../lib/modules';
import ChangelogModal from './ChangelogModal';
import './sidebar.css';

// Each entry's `module` is the access key (or list of keys for parents like
// Reporting). Dashboard is always shown — it's the user's landing page.
const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/', exact: true },
  { label: 'Req Board',     icon: ClipboardList, path: '/req-board',  module: 'req_board' },
  { label: 'India Req Board', icon: ClipboardList, path: '/india-req-board', module: 'india_req_board' },
  { label: 'Org Flow',      icon: GitBranch,     path: '/org-flow',   module: 'org_flow' },
  { label: 'Pipeline',      icon: Users,         path: '/pipeline',   module: 'pipeline' },
  { label: 'APT Health',    icon: Building2,     path: '/clients',    module: 'client_health' },
  { label: 'Reporting',     icon: BarChart3,     path: '/reporting',  modulesAny: REPORTING_SUB_KEYS },
  { label: 'Goal Tracking', icon: Target,        path: '/goals',      module: 'goal_tracking' },
  { label: 'Support',       icon: LifeBuoy,      path: '/support',    module: 'support' },
  { label: 'Operations',    icon: Settings,      path: '/operations', module: 'operations' },
  { label: 'Project Management', icon: KanbanSquare, path: '/projects', module: 'project_management' },
  { label: 'Admin',         icon: Shield,        path: '/admin',      module: 'admin' },
];

const QUICK_LINKS = [
  { label: 'ADP', href: 'https://online.adp.com/signin/v1/?APPID=WFNPortal&productId=80e309c3-7085-bae1-e053-3505430b5495&returnURL=https://workforcenow.adp.com/&callingAppId=WFN&TARGET=-SM-https:%2f%2fworkforcenow.adp.com%2ftheme%2findex.html%23/home' },
  { label: 'Alex', href: 'https://app.alex.com/' },
  { label: 'Align', href: 'https://application.aligntoday.com/' },
  { label: 'Bullhorn', href: 'https://universal.bullhornstaffing.com/universal-login/login' },
  { label: 'CloudCall', href: 'https://auth.cloudcall.com/' },
  { label: 'FullyRamped', href: 'https://app.fullyramped.com/login' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/feed/' },
  { label: 'SharePoint', href: 'https://bytesizeinc.sharepoint.com/sites/AptCentral' },
];

export default function Sidebar({ userName, onLogout, mobileOpen, onOpenSearch }) {
  const location = useLocation();
  const [linksOpen, setLinksOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const { hasAccess } = useUserRole();

  const navItems = useMemo(() => {
    return NAV_ITEMS.filter(item => {
      if (!item.module && !item.modulesAny) return true; // Dashboard
      if (item.modulesAny) return item.modulesAny.some(k => hasAccess(k));
      return hasAccess(item.module);
    });
  }, [hasAccess]);

  const isActive = (item) => {
    if (item.exact) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  };

  return (
    <>
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Brand */}
        <Link to="/" className="sidebar-brand">
          <img src="/apt-logo.jpg" alt="APT" className="sidebar-logo" />
          <span className="sidebar-brand-text">APT Command</span>
        </Link>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <div key={item.path} className="sidebar-nav-item disabled">
                  <Icon size={18} />
                  <span>{item.label}</span>
                  <span className="sidebar-badge">Soon</span>
                </div>
              );
            }
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={() =>
                  `sidebar-nav-item ${isActive(item) ? 'active' : ''}`
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Universal Search trigger — opens Cmd+K modal */}
        {onOpenSearch && (
          <div className="sidebar-search-wrap">
            <button
              type="button"
              className="sidebar-nav-item sidebar-search-trigger"
              onClick={onOpenSearch}
              aria-label="Open universal search (Cmd+K)"
            >
              <Search size={18} />
              <span>Search everything…</span>
              <kbd className="sidebar-search-kbd">⌘K</kbd>
            </button>
          </div>
        )}

        {/* Quick Links */}
        <div className="sidebar-section">
          <button
            className="sidebar-section-toggle"
            onClick={() => setLinksOpen(!linksOpen)}
          >
            <ExternalLink size={14} />
            <span>Quick Links</span>
            {linksOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {linksOpen && (
            <div className="sidebar-links">
              {QUICK_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sidebar-link-pill"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {(userName || '?')[0].toUpperCase()}
            </div>
            <span className="sidebar-user-name">{userName}</span>
          </div>
          <div className="sidebar-footer-row">
            <button
              className="sidebar-version"
              onClick={() => setChangelogOpen(true)}
            >
              v{APP_VERSION}
            </button>
            <button className="sidebar-logout" onClick={onLogout} title="Sign out">
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </>
  );
}
