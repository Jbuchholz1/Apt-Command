import { Link } from 'react-router-dom';
import { useUserRole } from '../../lib/UserRoleContext';

const dashboards = [
  {
    id: 'recruiting',
    title: 'Recruiting',
    description: 'Recruiter activity metrics, goal tracking, and new input vs spread targets.',
    icon: '\u{1F465}',
    path: '/reporting/recruiting',
    module: 'reporting_recruiter',
  },
  {
    id: 'sales',
    title: 'Sales',
    description: 'Sales pipeline metrics, revenue tracking, and account manager performance.',
    icon: '\u{1F4B0}',
    path: '/reporting/sales',
    module: 'reporting_sales',
  },
  {
    id: 'performance',
    title: 'Individual Performance',
    description: 'Personal performance metrics, goal tracking, and follow-up management.',
    icon: '\u{1F3AF}',
    path: '/reporting/performance',
    module: 'reporting_performance',
  },
  {
    id: 'executive',
    title: 'Executive Reporting',
    description: 'High-level company performance, cross-team rollups, and leadership insights.',
    icon: '\u{1F4CA}',
    path: '/reporting/executive',
    module: 'reporting_executive',
  },
];

export default function ReportingHome() {
  const { hasAccess } = useUserRole();
  const visibleDashboards = dashboards.filter(d => hasAccess(d.module));

  return (
    <div className="reporting-home">
      <h2 className="reporting-home-title">Reporting & Analytics</h2>
      <p className="reporting-home-subtitle">Select a dashboard.</p>
      <div className="reporting-card-grid">
        {visibleDashboards.map(d => (
          <Link
            key={d.id}
            to={d.path}
            className="reporting-dash-card"
          >
            <span className="reporting-dash-icon">{d.icon}</span>
            <h3 className="reporting-dash-title">{d.title}</h3>
            <p className="reporting-dash-desc">{d.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
