import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import ModuleSplash from '../../components/ModuleSplash';
import AccessDenied from '../../components/AccessDenied';
import { useUserRole } from '../../lib/UserRoleContext';
import './support.css';

export default function SupportModule() {
  const { hasAccess, loading: roleLoading } = useUserRole();
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <ModuleSplash
      text="How can we help?"
      hashtag="#WeGotYou"
      onComplete={() => setShowSplash(false)}
    />;
  }

  if (roleLoading) return null;
  if (!hasAccess('support')) return <AccessDenied />;

  return <Outlet />;
}
