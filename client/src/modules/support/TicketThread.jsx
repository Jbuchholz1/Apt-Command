import { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { getTicketComments, addTicketComment } from '../../lib/api';
import { showToast } from '../../lib/toast';

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Shared inline thread view for a single ticket.
 * Displays comments in chronological order and — when canComment is true —
 * a compose box for adding a new comment.
 *
 * Props:
 *   ticketId   — UUID of the ticket
 *   canComment — whether to show the compose box (admin or submitter)
 *   currentEmail — logged-in user's email (for highlighting own messages)
 */
export default function TicketThread({ ticketId, canComment, currentEmail }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await getTicketComments(ticketId);
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      const newComment = await addTicketComment(ticketId, draft.trim());
      setComments(prev => [...prev, newComment]);
      setDraft('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ticket-thread">
      {loading ? (
        <p className="ticket-thread-loading">Loading conversation...</p>
      ) : comments.length === 0 ? (
        <p className="ticket-thread-empty">No notes yet — start the conversation below.</p>
      ) : (
        <ul className="ticket-thread-list">
          {comments.map(c => {
            const isMe = c.author_email === currentEmail;
            return (
              <li key={c.id} className={`ticket-thread-item ${isMe ? 'is-mine' : ''}`}>
                <div className="ticket-thread-meta">
                  <span className="ticket-thread-author">{c.author_name || c.author_email}</span>
                  <span className="ticket-thread-time">{formatDateTime(c.created_at)}</span>
                </div>
                <div className="ticket-thread-body">{c.comment}</div>
              </li>
            );
          })}
        </ul>
      )}

      {canComment && (
        <form className="ticket-thread-compose" onSubmit={handleSubmit}>
          <textarea
            className="ticket-thread-input"
            placeholder="Add a note..."
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={2}
            maxLength={2000}
          />
          <button
            type="submit"
            className="ticket-thread-send"
            disabled={submitting || !draft.trim()}
            title="Send"
          >
            <Send size={14} />
            {submitting ? 'Sending...' : 'Send'}
          </button>
        </form>
      )}
    </div>
  );
}
