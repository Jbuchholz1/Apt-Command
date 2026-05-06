import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from './api';
import { showToast } from './toast';

const UserRoleContext = createContext({
  role: null,
  email: '',
  name: '',
  loading: true,
  isAdmin: false,
  isManager: false,
  permissions: {},
  hasAccess: () => false,
  bullhornRole: '',
  bullhornUserId: null,
  bullhornName: '',
});

const RETRY_DELAYS_MS = [400, 1200, 3000];

async function fetchCurrentUserWithRetry() {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await getCurrentUser();
    } catch (err) {
      lastErr = err;
      // 401 — MSAL will redirect to login via api.js; 403 — real authz decision. Don't retry either.
      if (err?.status === 401 || err?.status === 403) throw err;
      if (attempt === RETRY_DELAYS_MS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastErr;
}

export function UserRoleProvider({ children }) {
  const [role, setRole] = useState(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [bullhornRole, setBullhornRole] = useState('');
  const [bullhornUserId, setBullhornUserId] = useState(null);
  const [bullhornName, setBullhornName] = useState('');

  useEffect(() => {
    fetchCurrentUserWithRetry()
      .then((data) => {
        setRole(data?.role || 'basic');
        setEmail(data?.email || '');
        setName(data?.name || '');
        setPermissions(data?.permissions || {});
        // Bullhorn functional role + CorporateUser id, used by the Daily Brief
        // to render AM vs Recruiter stats without a second round-trip.
        // `bullhorn` is null when the caller has no matching Bullhorn user
        // or when the lookup failed — in either case the UI falls back to
        // the AM/default view.
        setBullhornRole(data?.bullhorn?.role || '');
        setBullhornUserId(data?.bullhorn?.userId ?? null);
        setBullhornName(data?.bullhorn?.name || '');
      })
      .catch((err) => {
        setRole('basic');
        setPermissions({});
        if (err?.status !== 401 && err?.status !== 403) {
          console.warn('[UserRoleContext] Failed to load user role after retries:', err);
          showToast("Couldn't verify your role — some tabs may be hidden. Refresh to retry.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const isAdmin = role === 'admin';
  const isManager = role === 'admin' || role === 'manager';

  // hasAccess(moduleKey, level = 'basic') — true if the user has at least that
  // level on the module. Global admins always pass (they bypass the grants
  // table on the server and resolvePermissions seeds them admin everywhere).
  const hasAccess = useCallback(
    (moduleKey, level = 'basic') => {
      if (!moduleKey) return false;
      if (isAdmin) return true;
      const granted = permissions[moduleKey];
      if (!granted) return false;
      if (level === 'admin') return granted === 'admin';
      return true;
    },
    [permissions, isAdmin],
  );

  const value = useMemo(
    () => ({
      role, email, name, loading, isAdmin, isManager,
      permissions, hasAccess,
      bullhornRole, bullhornUserId, bullhornName,
    }),
    [role, email, name, loading, isAdmin, isManager, permissions, hasAccess, bullhornRole, bullhornUserId, bullhornName],
  );

  return (
    <UserRoleContext.Provider value={value}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  return useContext(UserRoleContext);
}
