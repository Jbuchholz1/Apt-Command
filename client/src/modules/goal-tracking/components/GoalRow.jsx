import { useState } from 'react';
import { ChevronRight, ChevronDown, MoreHorizontal, Pin, PinOff, Trash2, Pencil, Plus } from 'lucide-react';
import ProgressBar from './ProgressBar';
import StatusDot from './StatusDot';
import TagChip from './TagChip';
import { resolveStatus } from '../lib/status';

function initials(nameOrEmail) {
  if (!nameOrEmail) return '?';
  const name = nameOrEmail.trim();
  if (!name.includes(' ') && name.includes('@')) return name[0].toUpperCase();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function typeLabel(t) {
  if (t === 'rollup') return 'ROLLUP';
  if (t === 'number') return 'NUMBER';
  if (t === 'task') return 'TASK';
  return t?.toUpperCase?.() || '';
}

function numberValueStrip(goal) {
  if (goal.goal_type !== 'number') return null;
  const s = goal.start_value ?? 0;
  const c = goal.current_value ?? s;
  const t = goal.target_value ?? s;
  return `${s} · ${c} · ${t}`;
}

export default function GoalRow({
  node,           // tree node { ...goal, children: [] }
  depth = 0,
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
  const canEdit = isManager || (node.owner_email || '').toLowerCase() === (currentEmail || '').toLowerCase();
  const canDelete = isManager || (node.owner_email || '').toLowerCase() === (currentEmail || '').toLowerCase();
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const hasChildren = node.children && node.children.length > 0;
  const subCount = hasChildren ? countDescendants(node) : 0;
  const pct = progressMap[node.id] ?? 0;
  const status = resolveStatus(node, pct, period);
  const pinned = pinnedIds?.includes?.(node.id);

  return (
    <>
      <div
        className={`gt-row gt-row-depth-${Math.min(depth, 5)}`}
        onClick={() => onSelect?.(node)}
      >
        {hasChildren && (
          <button
            className="gt-expand-btn"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        {!hasChildren && <span className="gt-expand-spacer" />}

        <span className={`gt-sub-count ${subCount > 0 ? '' : 'is-empty'}`} title={subCount > 0 ? `${subCount} sub-goals` : ''}>
          {subCount > 0 ? subCount : ''}
        </span>

        <div className="gt-avatar" title={node.owner_name || node.owner_email}>
          {initials(node.owner_name || node.owner_email)}
        </div>

        <div className="gt-row-main">
          <div className="gt-row-name">{node.name}</div>
          <div className="gt-row-tags">
            {node.is_company_priority && <TagChip kind="company" />}
            {pinned && <TagChip kind="mine" />}
          </div>
        </div>

        <span className="gt-type-badge">{typeLabel(node.goal_type)}</span>

        <div className="gt-row-right">
          {node.goal_type === 'number' && (
            <div className="gt-number-strip">{numberValueStrip(node)}</div>
          )}
          <div className="gt-progress-line">
            <StatusDot status={status} />
            <ProgressBar pct={pct} status={status} />
            <span className="gt-pct">{Math.round(pct)}%</span>
          </div>
        </div>

        <div className="gt-row-menu" onClick={(e) => e.stopPropagation()}>
          <button
            className="gt-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            title="Actions"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="gt-menu-popover" onMouseLeave={() => setMenuOpen(false)}>
              {canEdit && (
                <button
                  className="gt-menu-item"
                  onClick={() => { onEdit?.(node); setMenuOpen(false); }}
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button
                className="gt-menu-item"
                onClick={() => { onAddSubGoal?.(node); setMenuOpen(false); }}
              >
                <Plus size={13} /> Add Sub-Goal
              </button>
              <button
                className="gt-menu-item"
                onClick={() => { onTogglePin?.(node, !pinned); setMenuOpen(false); }}
              >
                {pinned ? <><PinOff size={13} /> Unpin</> : <><Pin size={13} /> Pin as My Priority</>}
              </button>
              {canDelete && (
                <button
                  className="gt-menu-item gt-menu-danger"
                  onClick={() => { onDelete?.(node); setMenuOpen(false); }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {hasChildren && expanded && node.children.map(child => (
        <GoalRow
          key={child.id}
          node={child}
          depth={depth + 1}
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
    </>
  );
}

function countDescendants(node) {
  if (!node.children?.length) return 0;
  let n = node.children.length;
  for (const c of node.children) n += countDescendants(c);
  return n;
}
