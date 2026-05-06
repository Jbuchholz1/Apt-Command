import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import './reporting.css';
import ModuleSplash from '../../components/ModuleSplash';
import AccessDenied from '../../components/AccessDenied';
import { useUserRole } from '../../lib/UserRoleContext';
import { REPORTING_SUB_KEYS } from '../../lib/modules';

export default function ReportingModule() {
  const { hasAccess, loading: roleLoading } = useUserRole();
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <ModuleSplash
      text="Do I have a full understanding of my business and what is going on?"
      hashtag="#WhoseCarAreWeTaking"
      onComplete={() => setShowSplash(false)}
    />;
  }

  if (roleLoading) return null;
  // Reporting parent is accessible if any sub-dashboard is granted; ReportingHome
  // and each sub-component check their own grant separately.
  if (!REPORTING_SUB_KEYS.some(k => hasAccess(k))) return <AccessDenied />;

  return <Outlet />;
}
