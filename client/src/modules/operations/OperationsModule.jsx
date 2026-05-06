import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Shield } from 'lucide-react';
import ModuleSplash from '../../components/ModuleSplash';
import { useUserRole } from '../../lib/UserRoleContext';
import './operations.css';

export default function OperationsModule() {
  const { isAdmin, loading: roleLoading } = useUserRole();
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

  // Don't render while role is still loading (prevents flash of denied/content)
  if (roleLoading) {
    return null;
  }

  // Admin-only module — matches sidebar `adminOnly: true` restriction
  if (!isAdmin) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
        textAlign: 'center',
        color: '#64748b',
      }}>
        <Shield size={48} />
        <h2 style={{ marginTop: 16, marginBottom: 8 }}>Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  return <Outlet />;
}
