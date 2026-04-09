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
    status: 'coming-soon',
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
        {modules.map(mod => (
          <Link
            key={mod.id}
            to={mod.path}
            className={`module-card ${mod.status === 'coming-soon' ? 'disabled' : ''}`}
            onClick={mod.status === 'coming-soon' ? undefined : undefined}
          >
            <span className="module-card-icon">{mod.icon}</span>
            <h2 className="module-card-title">{mod.title}</h2>
            <p className="module-card-desc">{mod.description}</p>
            <span className={`module-card-badge ${mod.status}`}>
              {mod.status === 'active' ? 'Active' : 'Coming Soon'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
