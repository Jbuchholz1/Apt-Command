import { Link } from 'react-router-dom';
import { BookOpen, Bug, Activity, Headphones } from 'lucide-react';

const sections = [
  {
    id: 'help',
    title: 'Help & Docs',
    description: 'FAQs, how-to guides, and training resources for every module.',
    Icon: BookOpen,
    path: '/support/help',
  },
  {
    id: 'feedback',
    title: 'Bug & Feedback',
    description: 'Report a bug, request a feature, or share feedback with the team.',
    Icon: Bug,
    path: '/support/feedback',
  },
  {
    id: 'status',
    title: 'System Status',
    description: 'API health, known issues, and the full version changelog.',
    Icon: Activity,
    path: '/support/status',
  },
  {
    id: 'it',
    title: 'IT Support',
    description: 'Contact IT, view escalation paths, or submit a quick support ticket.',
    Icon: Headphones,
    path: '/support/it',
  },
];

export default function SupportHome() {
  return (
    <div className="support-home">
      <h2 className="support-home-title">Support Center</h2>
      <p className="support-home-subtitle">What do you need help with?</p>
      <div className="support-card-grid">
        {sections.map(s => {
          const { Icon } = s;
          return (
            <Link key={s.id} to={s.path} className="support-card">
              <Icon size={28} className="support-card-icon" />
              <h3 className="support-card-title">{s.title}</h3>
              <p className="support-card-desc">{s.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
