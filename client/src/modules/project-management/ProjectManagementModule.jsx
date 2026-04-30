import { Outlet } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useUserRole } from '../../lib/UserRoleContext';
import './project-management.css';

export default function ProjectManagementModule() {
  const { isManager, loading } = useUserRole();

  if (loading) return null;

  if (!isManager) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
        textAlign: 'center',
        color: 'var(--text-muted)',
      }}>
        <Shield size={48} />
        <h2 style={{ marginTop: 16, marginBottom: 8, color: 'var(--navy)' }}>Access Denied</h2>
        <p>Project Management is available to managers and admins only.</p>
      </div>
    );
  }

  return (
    <div className="pm-module">
      <Outlet />
    </div>
  );
}
