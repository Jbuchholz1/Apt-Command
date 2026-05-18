import { useState, useEffect } from 'react';
import { useUserRole } from '../../lib/UserRoleContext';
import {
  getAdminUsers,
  updateUserRole,
  getUserPermissions,
  updateUserPermissions,
  runExportNow,
  createExternalUser,
  adminResetExternalPassword,
  deleteExternalUser,
} from '../../lib/api';
import { useMsal } from '@azure/msal-react';
import { showToast } from '../../lib/toast';
import { Shield, Search, Settings, UserPlus, KeyRound, Copy, Trash2 } from 'lucide-react';
import { MODULES, MODULE_KEYS } from '../../lib/modules';
import AccessDenied from '../../components/AccessDenied';
import './admin.css';

function generatePassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const buf = new Uint32Array(16);
  crypto.getRandomValues(buf);
  for (let i = 0; i < buf.length; i++) out += chars[buf[i] % chars.length];
  return out;
}

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
  const [exportRunning, setExportRunning] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);

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

  const handleRunExport = async () => {
    setExportRunning(true);
    setExportResult(null);
    try {
      const result = await runExportNow();
      setExportResult(result);
      if (result?.ok) {
        showToast('Export complete — 3 files uploaded to SharePoint', 'success');
      } else {
        showToast('Export had errors — see results below', 'error');
      }
    } catch (err) {
      setExportResult({ ok: false, error: err?.message || 'Request failed' });
      showToast(err?.message || 'Export failed', 'error');
    } finally {
      setExportRunning(false);
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

      {canManage && (
        <div
          style={{
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 6,
            padding: 12,
            margin: '12px 0',
            background: 'var(--surface, #fff)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>System actions</strong>
            <button
              className="admin-role-select"
              style={{
                background: 'var(--navy, #0f172a)',
                color: '#fff',
                borderColor: 'var(--navy, #0f172a)',
                cursor: exportRunning ? 'wait' : 'pointer',
              }}
              onClick={handleRunExport}
              disabled={exportRunning}
            >
              {exportRunning ? 'Running export… (~30s)' : 'Run nightly SharePoint export now'}
            </button>
            <button
              type="button"
              className="admin-role-select"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setCreateOpen(true)}
            >
              <UserPlus size={14} />
              Add external user
            </button>
            <span style={{ fontSize: 12, color: 'var(--muted, #64748b)' }}>
              Generates Req Board, Org Flow, and Pipeline xlsx files and uploads to{' '}
              <code>Back Office / Data Back Ups - DO NOT TOUCH</code>.
            </span>
          </div>
          {exportResult && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              {exportResult.error && !exportResult.results && (
                <div style={{ color: 'var(--danger, #dc2626)' }}>
                  <strong>Error:</strong> {exportResult.error}
                </div>
              )}
              {Array.isArray(exportResult.results) && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {exportResult.results.map((r) => (
                    <li
                      key={r.filename}
                      style={{
                        padding: '6px 0',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          color: r.status === 'ok'
                            ? 'var(--success, #16a34a)'
                            : 'var(--danger, #dc2626)',
                          fontWeight: 700,
                          width: 14,
                        }}
                      >
                        {r.status === 'ok' ? '✓' : '✗'}
                      </span>
                      <span style={{ fontWeight: 600, minWidth: 90 }}>{r.name}</span>
                      {r.status === 'ok' ? (
                        <a
                          href={r.webUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--link, #2563eb)' }}
                        >
                          Open {r.filename} in SharePoint
                        </a>
                      ) : (
                        <span style={{ color: 'var(--danger, #dc2626)', flex: 1, minWidth: 0 }}>
                          {r.error || 'Unknown error'}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

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
                    <td className="admin-email-cell">
                      {user.email}
                      {user.auth_provider === 'external' && (
                        <span
                          title="External (non-Microsoft) user"
                          style={{
                            marginLeft: 8,
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: '#e0f2fe',
                            color: '#075985',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          External
                        </span>
                      )}
                    </td>
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
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                        {user.auth_provider === 'external' && canManage && (
                          <button
                            type="button"
                            className="admin-role-select"
                            title="Reset this user's password"
                            onClick={() => setResetUser(user)}
                          >
                            <KeyRound size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                            Reset PW
                          </button>
                        )}
                        {user.auth_provider === 'external' && canManage && !isSelf && (
                          <button
                            type="button"
                            className="admin-role-select"
                            title="Delete this external user"
                            style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                            onClick={() => setDeleteUser(user)}
                          >
                            <Trash2 size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                            Delete
                          </button>
                        )}
                      </div>
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

      {createOpen && (
        <CreateExternalUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); loadUsers(); }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}

      {deleteUser && (
        <DeleteUserModal
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onDeleted={() => { setDeleteUser(null); loadUsers(); }}
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

// ---------- External user modals ----------

function ModalShell({ onClose, children, width = 480 }) {
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
          background: '#fff', borderRadius: 12, width: `min(${width}px, 92vw)`,
          maxHeight: '85vh', overflow: 'auto', padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CredentialsView({ email, password, onClose }) {
  const copy = (value) => {
    navigator.clipboard?.writeText(value).then(
      () => showToast('Copied to clipboard', 'success'),
      () => showToast('Copy failed', 'error'),
    );
  };
  return (
    <>
      <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Credentials issued</h2>
      <p style={{ margin: '6px 0 14px', fontSize: 13, color: '#b45309', background: '#fffbeb', padding: '8px 10px', borderRadius: 6 }}>
        Copy these now. The password will not be shown again — share it with the user
        out-of-band and have them sign in to set a new one.
      </p>
      <CredentialRow label="Email" value={email} onCopy={() => copy(email)} />
      <CredentialRow label="Password" value={password} onCopy={() => copy(password)} mono />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          className="admin-role-select"
          style={{ background: '#0f172a', color: '#fff', borderColor: '#0f172a' }}
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </>
  );
}

function CredentialRow({ label, value, onCopy, mono }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          readOnly
          value={value}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            fontSize: 14,
            fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
            background: '#f8fafc',
          }}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          className="admin-role-select"
          onClick={onCopy}
          title="Copy"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Copy size={12} />
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
};

function CreateExternalUserModal({ onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState(generatePassword());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null); // { email, password }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await createExternalUser({
        email: email.trim(),
        full_name: fullName.trim(),
        initial_password: password,
      });
      setIssued({ email: email.trim().toLowerCase(), password });
      onCreated(); // refresh list in the background
    } catch (err) {
      setError(err?.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  if (issued) {
    return (
      <ModalShell onClose={onClose}>
        <CredentialsView email={issued.email} password={issued.password} onClose={onClose} />
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Add external user</h2>
      <p style={{ margin: '4px 0 16px', fontSize: 12, color: '#64748b' }}>
        Creates a user that signs in with email + password instead of Microsoft SSO.
        They'll be required to set a new password on first login.
      </p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 8 }}>
          Full name
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 8 }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...inputStyle, marginTop: 4 }}
          />
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 8 }}>
          Initial password (min 12 chars, must include a letter and a digit)
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              type="text"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace' }}
            />
            <button
              type="button"
              className="admin-role-select"
              onClick={() => setPassword(generatePassword())}
              title="Generate a random password"
            >
              Generate
            </button>
          </div>
        </label>

        {error && (
          <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="admin-role-select" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="admin-role-select"
            style={{ background: '#0f172a', color: '#fff', borderColor: '#0f172a' }}
            disabled={submitting}
          >
            {submitting ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const [password, setPassword] = useState(generatePassword());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await adminResetExternalPassword(user.id, password);
      setIssued({ email: user.email, password });
    } catch (err) {
      setError(err?.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  if (issued) {
    return (
      <ModalShell onClose={onClose}>
        <CredentialsView email={issued.email} password={issued.password} onClose={onClose} />
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Reset password</h2>
      <p style={{ margin: '4px 0 16px', fontSize: 12, color: '#64748b' }}>
        Generates a new password for <strong>{user.full_name || user.email}</strong>. Their existing
        session will be invalidated immediately, and they'll be required to set a new password
        when they sign in.
      </p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 8 }}>
          New password
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              type="text"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace' }}
            />
            <button
              type="button"
              className="admin-role-select"
              onClick={() => setPassword(generatePassword())}
            >
              Generate
            </button>
          </div>
        </label>

        {error && (
          <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="admin-role-select" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="admin-role-select"
            style={{ background: '#0f172a', color: '#fff', borderColor: '#0f172a' }}
            disabled={submitting}
          >
            {submitting ? 'Resetting…' : 'Reset password'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function DeleteUserModal({ user, onClose, onDeleted }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setSubmitting(true);
    setError('');
    try {
      await deleteExternalUser(user.id);
      showToast(`Deleted ${user.full_name || user.email}`, 'success');
      onDeleted();
    } catch (err) {
      setError(err?.message || 'Failed to delete user');
      setSubmitting(false);
    }
  };

  return (
    <ModalShell onClose={onClose} width={440}>
      <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Delete external user?</h2>
      <p style={{ margin: '8px 0 16px', fontSize: 13, color: '#475569' }}>
        This permanently removes <strong>{user.full_name || user.email}</strong> ({user.email})
        and all of their per-module permissions. Their current session is invalidated immediately.
        This cannot be undone.
      </p>

      {error && (
        <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" className="admin-role-select" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button
          type="button"
          className="admin-role-select"
          style={{ background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' }}
          onClick={handleConfirm}
          disabled={submitting}
        >
          {submitting ? 'Deleting…' : 'Delete user'}
        </button>
      </div>
    </ModalShell>
  );
}
