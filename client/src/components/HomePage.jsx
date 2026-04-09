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
    description: 'Organizational workflow management and process automation.',
    icon: '\u{1F504}',
    path: 'https://aptorgflow.com/',
    status: 'active',
    external: true,
  },
  {
    id: 'pipeline',
    title: 'Candidate Pipeline',
    description: 'Follow candidates through sourcing, submission, interview, and placement stages.',
    icon: '\u{1F465}',
    path: '/pipeline',
    status: 'coming-soon',
  },
  {
    id: 'clients',
    title: 'Client Management',
    description: 'Client company profiles, contacts, account health, and engagement activity.',
    icon: '\u{1F3E2}',
    path: '/clients',
    status: 'coming-soon',
  },
  {
    id: 'reporting',
    title: 'Reporting & Analytics',
    description: 'Dashboards, KPIs, and metrics across requisitions, placements, and revenue.',
    icon: '\u{1F4CA}',
    path: '/reporting',
    status: 'active',
    underConstruction: true,
  },
];

export default function HomePage() {
  const { accounts } = useMsal();
  const firstName = (accounts[0]?.name || '').split(' ')[0] || 'there';

  return (
    <div className="home-page">
      <h1 className="home-greeting">Welcome back, {firstName}</h1>
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
          <a href="https://universal.bullhornstaffing.com/universal-login/login" target="_blank" rel="noopener noreferrer" className="resource-link">Bullhorn</a>
          <a href="https://auth.cloudcall.com/" target="_blank" rel="noopener noreferrer" className="resource-link">CloudCall</a>
          <a href="https://application.aligntoday.com/" target="_blank" rel="noopener noreferrer" className="resource-link">Align</a>
          <a href="http://app.alex.com/" target="_blank" rel="noopener noreferrer" className="resource-link">Alex</a>
        </div>
      </div>
    </div>
  );
}
