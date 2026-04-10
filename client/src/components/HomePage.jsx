import { Link } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';

const modules = [
  {
    id: 'req-board',
    title: 'Req Board',
    description: 'Track open requisitions, manage deadlines, and monitor recruiter activity in real time.',
    icon: '\u{1F4CB}',
    path: '/req-board',
    status: 'active',
  },
  {
    id: 'org-flow',
    title: 'Org Flow',
    description: 'Digital Org Chart tool.',
    icon: '\u{1F504}',
    path: '/org-flow',
    status: 'active',
  },
  {
    id: 'pipeline',
    title: 'Opportunity Pipeline',
    description: 'Track opportunities through sourcing, submission, interview, and placement stages.',
    icon: '\u{1F465}',
    path: '/pipeline',
    status: 'active',
  },
  {
    id: 'clients',
    title: 'APT Health',
    description: 'Company KPIs and client account health monitoring.',
    icon: '\u{1F3E2}',
    path: '/clients',
    status: 'active',
  },
  {
    id: 'reporting',
    title: 'Reporting & Analytics',
    description: 'Dashboards, KPIs, and metrics across requisitions, placements, and revenue.',
    icon: '\u{1F4CA}',
    path: '/reporting',
    status: 'active',
  },
  {
    id: 'performance',
    title: 'Individual Performance',
    description: 'Personal dashboards, goal tracking, and performance metrics for each team member.',
    icon: '\u{1F3AF}',
    path: '/performance',
    status: 'active',
  },
  {
    id: 'operations',
    title: 'Operations',
    description: 'Internal operations tools, workflows, and process management.',
    icon: '\u{2699}\u{FE0F}',
    path: '/operations',
    status: 'coming-soon',
  },
];

export default function HomePage() {
  const { accounts } = useMsal();
  const firstName = (accounts[0]?.name || '').split(' ')[0] || 'there';

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="home-page">
      <h1 className="home-greeting">Welcome back, {firstName}</h1>
      <p className="home-date">{today}</p>
      <p className="home-tagline">Make a Difference. No, But Really.</p>
      <p className="home-subtitle">Select a module to get started.</p>

      <div className="module-grid">
        {modules.map(mod => {
          const className = `module-card ${mod.status === 'coming-soon' ? 'disabled' : ''}`;
          const children = (
            <>
              {mod.underConstruction && <div className="construction-banner">Under Construction</div>}
              <span className="module-card-icon">{mod.icon}</span>
              <h2 className="module-card-title">{mod.title}</h2>
              <p className="module-card-desc">{mod.description}</p>
              <span className={`module-card-badge ${mod.status}`}>
                {mod.status === 'active' ? 'Active' : 'Coming Soon'}
              </span>
            </>
          );

          return mod.external ? (
            <a key={mod.id} href={mod.path} target="_blank" rel="noopener noreferrer" className={className}>
              {children}
            </a>
          ) : (
            <Link key={mod.id} to={mod.path} className={className}>
              {children}
            </Link>
          );
        })}
      </div>
      <div className="resources-card">
        <h3 className="resources-title">Quick Links</h3>
        <div className="resources-links">
          <a href="https://online.adp.com/signin/v1/?APPID=WFNPortal&productId=80e309c3-7085-bae1-e053-3505430b5495&returnURL=https://workforcenow.adp.com/&callingAppId=WFN&TARGET=-SM-https:%2f%2fworkforcenow.adp.com%2ftheme%2findex.html%23/home" target="_blank" rel="noopener noreferrer" className="resource-link">ADP</a>
          <a href="http://app.alex.com/" target="_blank" rel="noopener noreferrer" className="resource-link">Alex</a>
          <a href="https://application.aligntoday.com/" target="_blank" rel="noopener noreferrer" className="resource-link">Align</a>
          <a href="https://universal.bullhornstaffing.com/universal-login/login" target="_blank" rel="noopener noreferrer" className="resource-link">Bullhorn</a>
          <a href="https://auth.cloudcall.com/" target="_blank" rel="noopener noreferrer" className="resource-link">CloudCall</a>
          <a href="https://app.fullyramped.com/login" target="_blank" rel="noopener noreferrer" className="resource-link">FullyRamped</a>
          <a href="https://www.linkedin.com/feed/" target="_blank" rel="noopener noreferrer" className="resource-link">LinkedIn</a>
          <a href="https://login.microsoftonline.com/a78736a9-b975-4898-ae0e-2f783c0bcf14/oauth2/authorize?client_id=00000003-0000-0ff1-ce00-000000000000&response_mode=form_post&redirect_uri=https%3A%2F%2Fbytesizeinc.sharepoint.com%2F_forms%2Fdefault.aspx" target="_blank" rel="noopener noreferrer" className="resource-link">SharePoint</a>
        </div>
      </div>
      <footer className="home-footer">
        <span className="home-footer-brand">APT COMMAND</span> &middot; v1.0
      </footer>
    </div>
  );
}
