import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import ModuleSplash from '../../components/ModuleSplash';
import AccessDenied from '../../components/AccessDenied';
import { useUserRole } from '../../lib/UserRoleContext';
import './operations.css';

export default function OperationsModule() {
  const { hasAccess, loading: roleLoading } = useUserRole();
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return (
      <ModuleSplash
        text="Operations"
        hashtag="#RunItRight"
        onComplete={() => setShowSplash(false)}
      />
    );
  }

  if (roleLoading) return null;

  if (!hasAccess('operations')) {
    return <AccessDenied />;
  }

  return <Outlet />;
}
