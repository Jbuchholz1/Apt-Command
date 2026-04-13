import { useState, useEffect } from 'react';
import { useUserRole } from '../../lib/UserRoleContext';
import { getAdminUsers, updateUserRole } from '../../lib/api';
import { useMsal } from '@azure/msal-react';
import { showToast } from '../../lib/toast';
import { Shield, Search } from 'lucide-react';
import './admin.css';

export default function AdminModule() {
  const { isAdmin, isManager } = useUserRole();
  const { accounts } = useMsal();
  const currentEmail = (accounts[0]?.username || '').toLowerCase();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [updating, setUpdating] = useState(null); // user ID being updated

  useEffect(() => {
    if (isManager) loadUsers();
  }, [isManager]);

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

  if (!isManager) {
    return (
      <div className="admin-access-denied">
        <Shield size={48} />
        <h2>Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

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
                        disabled={!isAdmin || isSelf || updating === user.id}
                        title={!isAdmin ? 'Only admins can change roles' : isSelf ? 'Cannot change your own role' : ''}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      >
                        <option value="basic">Basic</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="4" className="admin-empty">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
