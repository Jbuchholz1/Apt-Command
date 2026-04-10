import { useState, useEffect } from 'react';
import { X, UserPlus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ClientAssignment({ client, onClose }) {
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [client.id]);

  const loadData = async () => {
    try {
      const [usersRes, assignmentsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('is_active', true),
        supabase
          .from('client_assignments')
          .select('*, user_profiles(email, full_name)')
          .eq('client_id', client.id),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      const sortedUsers = (usersRes.data || []).sort((a, b) =>
        (a.full_name || a.email).localeCompare(b.full_name || b.email)
      );

      setUsers(sortedUsers);
      setAssignments(assignmentsRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUserId) return;

    try {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from('client_assignments').insert([
        {
          client_id: client.id,
          user_id: selectedUserId,
          assigned_by: userData.user?.id,
        },
      ]);

      if (error) throw error;

      setSelectedUserId('');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = async (assignmentId, userEmail) => {
    if (!confirm(`Remove access for ${userEmail}?`)) return;

    try {
      const { error } = await supabase
        .from('client_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const availableUsers = users
    .filter(
      (user) =>
        user.id !== client.created_by &&
        !assignments.some((a) => a.user_id === user.id)
    )
    .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));

  return (
    <div className="of-modal-overlay">
      <div className="of-modal of-modal--wide">
        <div className="of-modal-header">
          <div>
            <h3 className="of-modal-title">Manage Client Access</h3>
            <p className="of-modal-subtitle">{client.name}</p>
          </div>
          <button
            onClick={onClose}
            className="of-icon-btn"
          >
            <X className="of-icon-sm" />
          </button>
        </div>

        {error && (
          <div className="of-alert of-alert--error">
            {error}
          </div>
        )}

        <div className="of-section">
          <h4 className="of-section-title">Assign User Access</h4>
          <div className="of-assign-row">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="of-select of-select--flex"
            >
              <option value="">Select a user...</option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email} {user.full_name ? `(${user.full_name})` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleAssign}
              disabled={!selectedUserId}
              className="of-btn of-btn--primary of-btn--with-icon"
            >
              <UserPlus className="of-icon-xs" />
              <span>Assign</span>
            </button>
          </div>
        </div>

        <div className="of-section">
          <h4 className="of-section-title">Current Assignments</h4>
          {loading ? (
            <div className="of-loading-text of-text-center">Loading...</div>
          ) : assignments.length === 0 ? (
            <div className="of-empty-state of-empty-state--compact">
              <p className="of-empty-hint">No additional users assigned</p>
            </div>
          ) : (
            <div className="of-assignment-list">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="of-assignment-item"
                >
                  <div>
                    <p className="of-assignment-email">
                      {assignment.user_profiles?.email}
                    </p>
                    {assignment.user_profiles?.full_name && (
                      <p className="of-assignment-name">
                        {assignment.user_profiles.full_name}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(assignment.id, assignment.user_profiles?.email)}
                    className="of-icon-btn of-icon-btn--danger"
                    title="Remove access"
                  >
                    <Trash2 className="of-icon-xs" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="of-modal-footer">
          <button
            onClick={onClose}
            className="of-btn of-btn--secondary of-btn--full"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
