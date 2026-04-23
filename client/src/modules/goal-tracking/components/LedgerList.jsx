import { ArrowRight } from 'lucide-react';
import LedgerRow from './LedgerRow';
import { formatPeriod, shiftPeriod } from '../lib/period';

export default function LedgerList({
  tree,
  progressMap,
  pinnedIds,
  period,
  currentEmail,
  isManager,
  readOnly = false,
  archivedCount = 0,
  onSelect,
  onTogglePin,
  onEdit,
  onAddSubGoal,
  onDelete,
  onViewArchive,
}) {
  const prevPeriod = shiftPeriod(period, -1);
  const hasRows = tree && tree.length > 0;

  return (
    <div className="ql-list">
      {!hasRows && (
        <div className="ql-list-empty">No goals match the current filter.</div>
      )}

      {hasRows && tree.map((node, idx) => (
        <LedgerRow
          key={node.id}
          node={node}
          depth={0}
          isLastSibling={idx === tree.length - 1}
          progressMap={progressMap}
          pinnedIds={pinnedIds}
          period={period}
          currentEmail={currentEmail}
          isManager={isManager}
          readOnly={readOnly}
          onSelect={onSelect}
          onTogglePin={onTogglePin}
          onEdit={onEdit}
          onAddSubGoal={onAddSubGoal}
          onDelete={onDelete}
        />
      ))}

      {!readOnly && archivedCount > 0 && (
        <div className="ql-list-footer">
          <span className="ql-list-footer-text">
            Plus <strong>{archivedCount}</strong> archived goal{archivedCount === 1 ? '' : 's'} from {formatPeriod(prevPeriod)}.
          </span>
          <button type="button" className="ql-btn-secondary" onClick={() => onViewArchive?.(prevPeriod)}>
            View archive <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
