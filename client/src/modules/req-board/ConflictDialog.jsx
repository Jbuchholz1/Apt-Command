import './conflict-dialog.css';

/**
 * Shown when a save returns 409 OVERRIDE_CONFLICT — someone else updated the
 * same job's overrides while this user was editing. We don't try to merge;
 * the user reloads to see their colleague's change and re-applies their own.
 *
 * Props:
 *   conflict: { jobId, field, current: { updated_by, updated_at, ...fields } }
 *   onReload: () => void  — parent refreshes the board, then closes the dialog
 *   onDismiss: () => void — parent just closes the dialog (accept current state)
 */
export default function ConflictDialog({ conflict, onReload, onDismiss }) {
  if (!conflict) return null;
  const { current = {}, field } = conflict;
  const who = current.updated_by || 'another user';
  const when = current.updated_at ? new Date(current.updated_at).toLocaleString() : '';

  return (
    <div className="conflict-dialog-overlay" onClick={onDismiss}>
      <div className="conflict-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="conflict-dialog-title">Someone else edited this req</h3>
        <p className="conflict-dialog-body">
          <strong>{who}</strong>
          {when ? ` changed this req at ${when}.` : ' updated this req before your save landed.'}
          {field ? ` Your ${field} change couldn't be applied safely.` : ' Your change couldn\'t be applied safely.'}
        </p>
        <p className="conflict-dialog-body">
          Reload to see their changes, then reapply yours.
        </p>
        <div className="conflict-dialog-actions">
          <button type="button" className="conflict-dialog-cancel" onClick={onDismiss}>
            Cancel
          </button>
          <button type="button" className="conflict-dialog-primary" onClick={onReload} autoFocus>
            Reload the board
          </button>
        </div>
      </div>
    </div>
  );
}
