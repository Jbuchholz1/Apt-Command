import { useState, useEffect } from 'react';
import { useUserRole } from '../../lib/UserRoleContext';
import { getAdminUsers, updateUserRole, getUserPermissions, updateUserPermissions } from '../../lib/api';
import { useMsal } from '@azure/msal-react';
import { showToast } from '../../lib/toast';
import { Shield, Search, Settings } from 'lucide-react';
import { MODULES, MODULE_KEYS } from '../../lib/modules';
import AccessDenied from '../../components/AccessDenied';
import './admin.css';

export default function AdminModule() {
  const { hasAccess, loading: roleLoading } = useUserRole();
  const { accounts } = useMsal();
  const currentEmail = (accounts[0]?.username || '').toLowerCase();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [updating, setUpdating] = useState(null); // user ID being updated
  const [editorUser, setEditorUser] = useState(null); // user whose permissions are open

  const canRead = hasAccess('admin');
  const canManage = hasAccess('admin', 'admin');

  useEffect(() => {
    if (canRead) loadUsers();
  }, [canRead]);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminUsers();
      setUsers(data?.users || []);
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setUpdating(userId);
    try {
      const updated = await updateUserRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: updated.role } : u))
      );
      showToast(`Role updated to ${updated.role}`, 'success');
    } catch (err) {
      const msg = err?.message || 'Failed to update role';
      showToast(msg, 'error');
    } finally {
      setUpdating(null);
    }
  };

  if (roleLoading) return null;
  if (!canRead) return <AccessDenied />;

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="admin-header-left">
          <Shield size={20} className="admin-header-icon" />
          <h1 className="admin-title">User Management</h1>
        </div>
        <span className="admin-count">{users.length} users</span>
      </div>

      <div className="admin-search">
        <Search size={16} className="admin-search-icon" />
        <input
          type="text"
          className="admin-search-input"
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <div className="admin-loading">Loading users...</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Role</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isSelf = (user.email || '').toLowerCase() === currentEmail;
                return (
                  <tr key={user.id} className={isSelf ? 'admin-row-self' : ''}>
                    <td className="admin-name-cell">
                      <span className="admin-name">{user.full_name || '—'}</span>
                      {isSelf && <span className="admin-you-badge">You</span>}
                    </td>
                    <td className="admin-email-cell">{user.email}</td>
                    <td>
                      <span className={`admin-status ${user.is_active ? 'admin-status-active' : 'admin-status-inactive'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <select
                        className="admin-role-select"
                        value={user.role || 'basic'}
                        disabled={!canManage || isSelf || updating === user.id}
                        title={!canManage ? 'Only admins can change roles' : isSelf ? 'Cannot change your own role' : ''}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      >
                        <option value="basic">Basic</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-role-select"
                        disabled={!canManage}
                        title={canManage ? 'Edit per-module access' : 'Admin level required'}
                        onClick={() => setEditorUser(user)}
                      >
                        <Settings size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="5" className="admin-empty">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editorUser && (
        <PermissionsEditor
          user={editorUser}
          isSelf={(editorUser.email || '').toLowerCase() === currentEmail}
          onClose={() => setEditorUser(null)}
        />
      )}
    </div>
  );
}

function PermissionsEditor({ user, isSelf, onClose }) {
  const [grants, setGrants] = useState(null); // { [moduleKey]: 'basic' | 'admin' | null }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getUserPermissions(user.id)
      .then((data) => {
        if (!alive) return;
        const map = {};
        for (const key of MODULE_KEYS) map[key] = null;
        for (const p of data?.permissions || []) {
          if (p.module_key in map) map[p.module_key] = p.access_level;
        }
        setGrants(map);
      })
      .catch(() => {
        if (alive) setError('Failed to load permissions');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [user.id]);

  const setLevel = (moduleKey, level) => {
    setGrants((prev) => ({ ...prev, [moduleKey]: level }));
  };

  const handleSave = async () => {
    if (!grants) return;
    const permissions = MODULE_KEYS
      .filter((k) => grants[k] === 'basic' || grants[k] === 'admin')
      .map((module_key) => ({ module_key, access_level: grants[module_key] }));

    setSaving(true);
    setError(null);
    try {
      await updateUserPermissions(user.id, permissions);
      showToast('Permissions updated', 'success');
      onClose();
    } catch (err) {
      const msg = err?.message || 'Failed to save permissions';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: 'min(560px, 92vw)',
          maxHeight: '85vh', overflow: 'auto', padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, color: 'var(--navy, #0f172a)' }}>
          Access for {user.full_name || user.email}
        </h2>
        <p style={{ margin: '4px 0 16px', fontSize: 12, color: '#64748b' }}>
          {user.email}
          {user.role === 'admin' && (
            <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 3, background: '#fef3c7', color: '#92400e' }}>
              Global admin — bypasses these grants
            </span>
          )}
        </p>

        {error && <div className="admin-error">{error}</div>}

        {loading || !grants ? (
          <div className="admin-loading">Loading permissions…</div>
        ) : (
          <table className="admin-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Module</th>
                <th style={{ textAlign: 'center' }}>None</th>
                <th style={{ textAlign: 'center' }}>Basic</th>
                <th style={{ textAlign: 'center' }}>Admin</th>
              </tr>
            </thead>
            <tbody>
              {MODULE_KEYS.map((key) => {
                const level = grants[key];
                const isAdminModuleSelf = isSelf && key === 'admin';
                return (
                  <tr key={key}>
                    <td>{MODULES[key].label}</td>
                    {[null, 'basic', 'admin'].map((opt) => (
                      <td key={String(opt)} style={{ textAlign: 'center' }}>
                        <input
                          type="radio"
                          name={`perm_${key}`}
                          checked={level === opt}
                          disabled={isAdminModuleSelf && opt !== 'admin'}
                          title={isAdminModuleSelf && opt !== 'admin'
                            ? 'Cannot revoke your own admin-on-admin grant'
                            : ''}
                          onChange={() => setLevel(key, opt)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="admin-role-select" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="admin-role-select"
            style={{ background: 'var(--navy, #0f172a)', color: '#fff', borderColor: 'var(--navy, #0f172a)' }}
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
