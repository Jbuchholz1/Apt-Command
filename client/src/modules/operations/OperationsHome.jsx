import { Link } from 'react-router-dom';
import { ClipboardCheck, FileCheck, FileText } from 'lucide-react';

const sections = [
  {
    id: 'onboarding',
    title: 'Onboarding Tracking',
    description: 'Track new hire paperwork, healthcare enrollment, payroll, and 401k onboarding milestones.',
    Icon: ClipboardCheck,
    path: '/operations/onboarding',
  },
  {
    id: 'coi',
    title: 'COI Tracking',
    description: 'Track Certificates of Insurance for placements and clients.',
    Icon: FileCheck,
    path: '/operations/coi',
  },
  {
    id: 'contracts',
    title: 'Contract Tracking',
    description: 'Track vendor contracts, costs, renewal dates, and notice periods.',
    Icon: FileText,
    path: '/operations/contracts',
  },
];

export default function OperationsHome() {
  return (
    <div className="ops-home">
      <h2 className="ops-home-title">Operations Center</h2>
      <p className="ops-home-subtitle">What would you like to manage?</p>
      <div className="ops-card-grid">
        {sections.map(s => {
          const { Icon } = s;
          return (
            <Link key={s.id} to={s.path} className="ops-card">
              <Icon size={28} className="ops-card-icon" />
              <h3 className="ops-card-title">{s.title}</h3>
              <p className="ops-card-desc">{s.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
