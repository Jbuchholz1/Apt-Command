import { useState, useEffect, useCallback } from 'react';
import { pmListComments, pmCreateComment, pmUpdateComment, pmDeleteComment } from '../../lib/api';
import { showToast } from '../../lib/toast';
import { useUserRole } from '../../lib/UserRoleContext';

function initials(name, email) {
  const src = (name || email || '').trim();
  if (!src) return '?';
  const parts = src.split(/\s+|@/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function CommentsThread({ taskId }) {
  const { email: myEmail, isAdmin } = useUserRole();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState('');

  const reload = useCallback(async () => {
    // Optimistic tasks have a tmp id and no comments yet — skip the fetch.
    if (!taskId || taskId.startsWith('tmp-')) {
      setComments([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await pmListComments(taskId);
      setComments(res?.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const v = body.trim();
    if (!v) return;
    try {
      setSubmitting(true);
      const res = await pmCreateComment(taskId, v);
      setComments(prev => [...prev, res.data]);
      setBody('');
    } catch (err) {
      showToast(err.message || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditingBody(c.body);
  };

  const saveEdit = async () => {
    try {
      const res = await pmUpdateComment(editingId, editingBody.trim());
      setComments(prev => prev.map(c => c.id === editingId ? res.data : c));
      setEditingId(null);
      setEditingBody('');
    } catch (err) {
      showToast(err.message || 'Failed to update comment');
    }
  };

  const deleteComment = async (id) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await pmDeleteComment(id);
      setComments(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      showToast(err.message || 'Failed to delete comment');
    }
  };

  const myEmailLower = (myEmail || '').toLowerCase();

  return (
    <div className="pm-comments">
      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
      {!loading && comments.map(c => {
        const mine = (c.created_by || '').toLowerCase() === myEmailLower;
        const canEdit = mine;
        const canDelete = mine || isAdmin;
        const isEditing = editingId === c.id;
        return (
          <div key={c.id} className="pm-comment">
            <div className="pm-comment-avatar">{initials(c.created_by_name, c.created_by)}</div>
            <div className="pm-comment-body">
              <div className="pm-comment-meta">
                <span className="pm-comment-author">{c.created_by_name || c.created_by}</span>
                <span>·</span>
                <span>{formatTime(c.created_at)}</span>
                {c.edited_at && <span>(edited)</span>}
              </div>
              {isEditing ? (
                <>
                  <textarea
                    className="pm-textarea"
                    value={editingBody}
                    onChange={e => setEditingBody(e.target.value)}
                    style={{ minHeight: 50 }}
                  />
                  <div className="pm-comment-actions">
                    <button onClick={saveEdit}>Save</button>
                    <button onClick={() => { setEditingId(null); setEditingBody(''); }}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="pm-comment-text">{c.body}</p>
                  {(canEdit || canDelete) && (
                    <div className="pm-comment-actions">
                      {canEdit && <button onClick={() => startEdit(c)}>Edit</button>}
                      {canDelete && (
                        <button className="danger" onClick={() => deleteComment(c.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      <form className="pm-comment-form" onSubmit={handleAdd}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write a comment…"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="pm-btn" disabled={submitting || !body.trim()}>
            {submitting ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </form>
    </div>
  );
}
