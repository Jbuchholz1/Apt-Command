import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser } from './api';

const UserRoleContext = createContext({ role: null, loading: true, isAdmin: false, isManager: false });

export function UserRoleProvider({ children }) {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((data) => setRole(data?.role || 'basic'))
      .catch(() => setRole('basic'))
      .finally(() => setLoading(false));
  }, []);

  const isAdmin = role === 'admin';
  const isManager = role === 'admin' || role === 'manager';
  const value = { role, loading, isAdmin, isManager };

  return (
    <UserRoleContext.Provider value={value}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  return useContext(UserRoleContext);
}
