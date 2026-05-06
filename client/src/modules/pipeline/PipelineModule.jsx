import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import './pipeline.css';
import ModuleSplash from '../../components/ModuleSplash';
import AccessDenied from '../../components/AccessDenied';
import { useUserRole } from '../../lib/UserRoleContext';

export default function PipelineModule() {
  const { hasAccess, loading: roleLoading } = useUserRole();
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <ModuleSplash
      text="What are we building for tomorrow?"
      hashtag="#BringHomeTheLion"
      onComplete={() => setShowSplash(false)}
    />;
  }

  if (roleLoading) return null;
  if (!hasAccess('pipeline')) return <AccessDenied />;

  return <Outlet />;
}
