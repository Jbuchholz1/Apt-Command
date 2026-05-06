import { Outlet } from 'react-router-dom';
import AccessDenied from '../../components/AccessDenied';
import { useUserRole } from '../../lib/UserRoleContext';
import './project-management.css';

export default function ProjectManagementModule() {
  const { hasAccess, loading } = useUserRole();

  if (loading) return null;

  if (!hasAccess('project_management')) {
    return <AccessDenied>Project Management requires explicit access.</AccessDenied>;
  }

  return (
    <div className="pm-module">
      <Outlet />
    </div>
  );
}
