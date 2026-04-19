import GoalRow from './GoalRow';

export default function GoalTree({
  tree,
  progressMap,
  pinnedIds,
  period,
  onSelect,
  onTogglePin,
  onDelete,
  canDelete,
}) {
  if (!tree || tree.length === 0) return null;
  return (
    <div className="gt-tree">
      {tree.map(node => (
        <GoalRow
          key={node.id}
          node={node}
          depth={0}
          progressMap={progressMap}
          pinnedIds={pinnedIds}
          period={period}
          onSelect={onSelect}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
          canDelete={canDelete}
        />
      ))}
    </div>
  );
}
