import { useState, useEffect, useRef } from 'react';
import { Users, Plus, Trash2, Upload, Download, CreditCard as Edit, X, ArrowLeft, RefreshCw, Shield, Key } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

export default function UserManagement({ onBack }) {
  const user = { id: 'temp-user-id' }; // TODO: Replace with MSAL
  const currentUser = user;
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);
  const [userForPasswordReset, setUserForPasswordReset] = useState(null);
  const [reassignToUserId, setReassignToUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'user',
    is_active: true,
  });

  useEffect(() => {
    loadUsers();
    loadClients();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('email');

      if (error) throw error;

      setUsers(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('*');
    const sortedClients = (data || []).sort((a, b) => a.name.localeCompare(b.name));
    setClients(sortedClients);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.full_name,
          },
        },
      });

      if (signUpError) throw signUpError;

      if (authData.user) {
        await supabase
          .from('user_profiles')
          .update({
            role: formData.role,
            full_name: formData.full_name,
            is_active: formData.is_active
          })
          .eq('id', authData.user.id);
      }

      setSuccess('User added successfully!');
      setShowAddModal(false);
      setFormData({ email: '', password: '', full_name: '', role: 'user', is_active: true });
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: formData.full_name,
          role: formData.role,
          is_active: formData.is_active,
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      setSuccess('User updated successfully!');
      setShowAddModal(false);
      setSelectedUser(null);
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (user) => {
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: !user.is_active })
        .eq('id', user.id);

      if (error) throw error;

      setSuccess(`User ${!user.is_active ? 'activated' : 'deactivated'} successfully!`);
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setError('');
    setSuccess('');

    try {
      // Check for clients owned by the user
      const { data: userClients } = await supabase
        .from('clients')
        .select('id')
        .eq('created_by', userToDelete.id);

      // Check for client assignments
      const { data: userAssignments } = await supabase
        .from('client_assignments')
        .select('id, client_id')
        .eq('user_id', userToDelete.id);

      const hasClients = userClients && userClients.length > 0;
      const hasAssignments = userAssignments && userAssignments.length > 0;

      if (hasClients || hasAssignments) {
        if (!reassignToUserId) {
          setShowReassignModal(true);
          return;
        }

        // Reassign owned clients
        if (hasClients) {
          for (const client of userClients) {
            await supabase
              .from('clients')
              .update({ created_by: reassignToUserId })
              .eq('id', client.id);
          }
        }

        // Reassign client assignments
        if (hasAssignments) {
          for (const assignment of userAssignments) {
            await supabase
              .from('client_assignments')
              .update({ user_id: reassignToUserId })
              .eq('id', assignment.id);
          }
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: userToDelete.id }),
        }
      );

      const result = await response.json();
      console.log('Delete user response:', response.status, result);

      if (!response.ok) {
        throw new Error(result.error || `Failed to delete user (${response.status})`);
      }

      setSuccess('User deleted successfully');
      setShowDeleteModal(false);
      setShowReassignModal(false);
      setUserToDelete(null);
      setReassignToUserId('');
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        for (const row of jsonData) {
          if (!row.Email || !row.Password) continue;

          try {
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
              email: row.Email,
              password: row.Password,
              options: {
                data: {
                  full_name: row.FullName || '',
                },
              },
            });

            if (!signUpError && authData.user) {
              await supabase
                .from('user_profiles')
                .update({
                  role: row.Role === 'admin' ? 'admin' : 'user',
                  full_name: row.FullName || '',
                })
                .eq('id', authData.user.id);
            }
          } catch (err) {
            console.error(`Failed to create user ${row.Email}:`, err);
          }
        }

        loadUsers();
        alert('Bulk upload completed. Check console for any errors.');
      } catch (error) {
        console.error('Error importing Excel:', error);
        alert('Error importing file. Please check the format.');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportTemplate = () => {
    let templateData;

    if (users.length > 0) {
      templateData = users.map((user) => ({
        Email: user.email,
        Password: '',
        FullName: user.full_name,
        Role: user.role,
      }));
    } else {
      templateData = [
        {
          Email: 'user@example.com',
          Password: 'password123',
          FullName: 'John Doe',
          Role: 'user',
        },
      ];
    }

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'user_import_template.xlsx');
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      password: '',
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
    });
    setShowAddModal(true);
  };

  const openAddModal = () => {
    setSelectedUser(null);
    setFormData({ email: '', password: '', full_name: '', role: 'user', is_active: true });
    setShowAddModal(true);
  };

  const confirmDelete = (user) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const openPasswordResetModal = (user) => {
    setUserForPasswordReset(user);
    setNewPassword('');
    setShowPasswordModal(true);
  };

  const handlePasswordReset = async () => {
    if (!userForPasswordReset || !newPassword) return;
    setError('');
    setSuccess('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-password`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userForPasswordReset.id,
            password: newPassword,
          }),
        }
      );

      const result = await response.json();
      console.log('Password reset response:', response.status, result);

      if (!response.ok) {
        throw new Error(result.error || `Failed to reset password (${response.status})`);
      }

      setSuccess(`Password reset successfully for ${userForPasswordReset.email}`);
      setShowPasswordModal(false);
      setUserForPasswordReset(null);
      setNewPassword('');
      loadUsers();
    } catch (err) {
      console.error('Password reset error:', err);
      setError(err.message);
    }
  };

  return (
    <div className="of-page">
      <header className="of-header-dark">
        <div className="of-container of-header-inner">
          <div className="of-header-row">
            <div className="of-header-left">
              <button
                onClick={onBack}
                className="of-header-back-btn"
              >
                <ArrowLeft className="of-icon-sm" />
              </button>
              <div className="of-header-title-group">
                <div className="of-header-icon-box">
                  <Users className="of-icon-md of-icon-navy" />
                </div>
                <div>
                  <h1 className="of-header-title">User Management</h1>
                  <p className="of-header-subtitle">Manage system users and permissions</p>
                </div>
              </div>
            </div>
            <div className="of-header-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleBulkUpload}
                className="of-hidden"
              />
              <button
                onClick={loadUsers}
                className="of-btn of-btn--dark"
                title="Refresh user list"
              >
                <RefreshCw className="of-icon-xs" />
              </button>
              <button
                onClick={handleExportTemplate}
                className="of-btn of-btn--dark of-btn--with-icon"
              >
                <Download className="of-icon-xs" />
                <span>Template</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="of-btn of-btn--blue of-btn--with-icon"
              >
                <Upload className="of-icon-xs" />
                <span>Bulk Upload</span>
              </button>
              <button
                onClick={openAddModal}
                className="of-btn of-btn--primary of-btn--with-icon"
              >
                <Plus className="of-icon-xs" />
                <span>Add User</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="of-container of-main-content">
        {error && (
          <div className="of-alert of-alert--error">
            {error}
          </div>
        )}
        {success && (
          <div className="of-alert of-alert--success">
            {success}
          </div>
        )}

        {loading ? (
          <div className="of-loading-text of-text-center">Loading users...</div>
        ) : (
          <div className="of-table-wrapper">
            <table className="of-table">
              <thead className="of-table-head">
                <tr>
                  <th className="of-table-th">Email</th>
                  <th className="of-table-th">Full Name</th>
                  <th className="of-table-th">Role</th>
                  <th className="of-table-th">Status</th>
                  <th className="of-table-th">Last Password Reset</th>
                  <th className="of-table-th of-text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="of-table-body">
                {users.map((user) => (
                  <tr key={user.id} className="of-table-row">
                    <td className="of-table-td of-table-td--primary">
                      {user.email}
                    </td>
                    <td className="of-table-td of-table-td--secondary">
                      {user.full_name || '-'}
                    </td>
                    <td className="of-table-td">
                      <span
                        className={`of-badge ${
                          user.role === 'admin'
                            ? 'of-badge--gold'
                            : 'of-badge--gray'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="of-table-td">
                      <span
                        className={`of-badge ${
                          user.is_active
                            ? 'of-badge--green'
                            : 'of-badge--red'
                        }`}
                      >
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="of-table-td of-table-td--secondary">
                      {user.password_reset_at ? (
                        <div className="of-password-reset-info">
                          <span className="of-password-reset-date">{new Date(user.password_reset_at).toLocaleDateString()}</span>
                          <span className="of-password-reset-time">
                            {new Date(user.password_reset_at).toLocaleTimeString()}
                          </span>
                          {user.password_reset_by && (
                            <span className="of-password-reset-by">
                              by {users.find(u => u.id === user.password_reset_by)?.email || 'admin'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="of-text-muted">Never</span>
                      )}
                    </td>
                    <td className="of-table-td of-text-right">
                      <div className="of-action-buttons">
                        <button
                          onClick={() => openEditModal(user)}
                          className="of-icon-btn of-icon-btn--edit"
                          title="Edit user"
                        >
                          <Edit className="of-icon-xs" />
                        </button>
                        {user.id !== currentUser?.id && (
                          <>
                            <button
                              onClick={() => openPasswordResetModal(user)}
                              className="of-icon-btn of-icon-btn--gold"
                              title="Reset password"
                            >
                              <Key className="of-icon-xs" />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(user)}
                              className={`of-icon-btn ${
                                user.is_active
                                  ? 'of-icon-btn--warning'
                                  : 'of-icon-btn--success'
                              }`}
                              title={user.is_active ? 'Deactivate user' : 'Activate user'}
                            >
                              <Shield className="of-icon-xs" />
                            </button>
                            <button
                              onClick={() => confirmDelete(user)}
                              className="of-icon-btn of-icon-btn--danger"
                              title="Delete user"
                            >
                              <Trash2 className="of-icon-xs" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showAddModal && (
        <div className="of-modal-overlay">
          <div className="of-modal">
            <div className="of-modal-header">
              <h3 className="of-modal-title">
                {selectedUser ? 'Edit User' : 'Add New User'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedUser(null);
                }}
                className="of-icon-btn"
              >
                <X className="of-icon-sm" />
              </button>
            </div>

            <form onSubmit={selectedUser ? (e) => { e.preventDefault(); handleUpdateUser(); } : handleAddUser}>
              <div className="of-form-fields">
                <div className="of-form-group">
                  <label className="of-form-label">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="of-input"
                    disabled={!!selectedUser}
                    required
                  />
                </div>

                {!selectedUser && (
                  <div className="of-form-group">
                    <label className="of-form-label">
                      Password *
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="of-input"
                      minLength={6}
                      required
                    />
                  </div>
                )}

                <div className="of-form-group">
                  <label className="of-form-label">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="of-input"
                  />
                </div>

                <div className="of-form-group">
                  <label className="of-form-label">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value })
                    }
                    className="of-select"
                  >
                    <option value="user">Basic User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {selectedUser && (
                  <div className="of-form-group">
                    <label className="of-form-label">Status</label>
                    <select
                      value={formData.is_active ? 'active' : 'inactive'}
                      onChange={(e) =>
                        setFormData({ ...formData, is_active: e.target.value === 'active' })
                      }
                      className="of-select"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="of-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedUser(null);
                  }}
                  className="of-btn of-btn--secondary of-btn--flex"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="of-btn of-btn--primary of-btn--flex"
                >
                  {selectedUser ? 'Update User' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && userToDelete && (
        <div className="of-modal-overlay">
          <div className="of-modal">
            <h3 className="of-modal-title">Delete User</h3>
            <p className="of-modal-body-text">
              Are you sure you want to delete <strong>{userToDelete.email}</strong>? This action
              cannot be undone.
            </p>
            <div className="of-modal-actions">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setUserToDelete(null);
                }}
                className="of-btn of-btn--secondary of-btn--flex"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="of-btn of-btn--danger of-btn--flex"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {showReassignModal && userToDelete && (
        <div className="of-modal-overlay">
          <div className="of-modal">
            <div className="of-modal-header-with-icon">
              <RefreshCw className="of-icon-md of-icon-gold" />
              <h3 className="of-modal-title">Reassign Clients</h3>
            </div>
            <p className="of-modal-body-text">
              <strong>{userToDelete.email}</strong> is assigned to clients. Please reassign them to another
              user before deletion. This will transfer all client ownership and assignments.
            </p>
            <div className="of-form-group">
              <label className="of-form-label">
                Reassign to User
              </label>
              <select
                value={reassignToUserId}
                onChange={(e) => setReassignToUserId(e.target.value)}
                className="of-select"
                required
              >
                <option value="">Select a user...</option>
                {users
                  .filter((u) => u.id !== userToDelete.id && u.is_active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email} {u.full_name ? `(${u.full_name})` : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="of-modal-actions">
              <button
                onClick={() => {
                  setShowReassignModal(false);
                  setShowDeleteModal(false);
                  setUserToDelete(null);
                  setReassignToUserId('');
                }}
                className="of-btn of-btn--secondary of-btn--flex"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={!reassignToUserId}
                className="of-btn of-btn--danger of-btn--flex"
              >
                Reassign & Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && userForPasswordReset && (
        <div className="of-modal-overlay">
          <div className="of-modal">
            <div className="of-modal-header">
              <div className="of-modal-header-with-icon">
                <Key className="of-icon-md of-icon-gold" />
                <h3 className="of-modal-title">Reset Password</h3>
              </div>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setUserForPasswordReset(null);
                  setNewPassword('');
                }}
                className="of-icon-btn"
              >
                <X className="of-icon-sm" />
              </button>
            </div>

            <p className="of-modal-body-text">
              Set a new password for <strong>{userForPasswordReset.email}</strong>
            </p>

            <div className="of-form-group">
              <label className="of-form-label">
                New Password *
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="of-input"
                placeholder="Enter new password"
                minLength={6}
                required
              />
              <p className="of-form-hint">Minimum 6 characters</p>
            </div>

            <div className="of-modal-actions">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setUserForPasswordReset(null);
                  setNewPassword('');
                }}
                className="of-btn of-btn--secondary of-btn--flex"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordReset}
                disabled={!newPassword || newPassword.length < 6}
                className="of-btn of-btn--primary of-btn--flex"
              >
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
