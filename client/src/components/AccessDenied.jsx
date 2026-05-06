import { Shield } from 'lucide-react';

// Shared "Access Denied" panel. Modules render this when the user lacks the
// per-module grant. The server is authoritative — this is just defense-in-depth.
export default function AccessDenied({ children = 'You do not have permission to view this page.' }) {
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
      <p>{children}</p>
    </div>
  );
}
