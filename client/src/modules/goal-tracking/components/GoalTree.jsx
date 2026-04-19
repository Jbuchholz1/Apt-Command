import GoalRow from './GoalRow';

export default function GoalTree({
  tree,
  progressMap,
  pinnedIds,
  period,
  currentEmail,
  isManager,
  onSelect,
  onTogglePin,
  onEdit,
  onAddSubGoal,
  onDelete,
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
          currentEmail={currentEmail}
          isManager={isManager}
          onSelect={onSelect}
          onTogglePin={onTogglePin}
          onEdit={onEdit}
          onAddSubGoal={onAddSubGoal}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
