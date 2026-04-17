import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser } from './api';

const UserRoleContext = createContext({ role: null, email: '', name: '', loading: true, isAdmin: false, isManager: false });

export function UserRoleProvider({ children }) {
  const [role, setRole] = useState(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((data) => {
        setRole(data?.role || 'basic');
        setEmail(data?.email || '');
        setName(data?.name || '');
      })
      .catch(() => setRole('basic'))
      .finally(() => setLoading(false));
  }, []);

  const isAdmin = role === 'admin';
  const isManager = role === 'admin' || role === 'manager';
  const value = { role, email, name, loading, isAdmin, isManager };

  return (
    <UserRoleContext.Provider value={value}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  return useContext(UserRoleContext);
}
