import { useState } from 'react';
import { ChevronRight, MoreHorizontal, Pin, PinOff, Trash2, Pencil, Plus } from 'lucide-react';
import {
  resolveStatus,
  statusLabel,
  LEDGER_STATUS_COPY,
  LEDGER_STATUS_VAR,
} from '../lib/status';

function initials(nameOrEmail) {
  if (!nameOrEmail) return '?';
  const name = nameOrEmail.trim();
  if (!name.includes(' ') && name.includes('@')) return name[0].toUpperCase();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function paddedIndex(n) {
  return String(n).padStart(2, '0');
}

export default function LedgerRow({
  node,
  depth = 0,
  isLastSibling = false,
  progressMap,
  pinnedIds,
  period,
  currentEmail,
  isManager,
  readOnly = false,
  onSelect,
  onTogglePin,
  onEdit,
  onAddSubGoal,
  onDelete,
}) {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const hasChildren = !!(node.children && node.children.length);
  const pct = Math.round(progressMap[node.id] ?? 0);
  const colorStatus = resolveStatus(node, pct, period);
  const label = statusLabel(colorStatus, pct);
  const statusCopy = LEDGER_STATUS_COPY[label];
  const statusColor = LEDGER_STATUS_VAR[label];

  const canEdit = !readOnly && (isManager || (node.owner_email || '').toLowerCase() === (currentEmail || '').toLowerCase());
  const canDelete = !readOnly && (isManager || (node.owner_email || '').toLowerCase() === (currentEmail || '').toLowerCase());
  const pinned = pinnedIds?.includes?.(node.id);

  const isRoot = depth === 0;

  const rowClass = [
    'ql-row',
    isRoot ? 'is-root' : 'is-nested',
    expanded ? 'is-expanded' : 'is-collapsed',
    isLastSibling ? 'is-last' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        className={rowClass}
        data-depth={depth}
        style={depth > 0 ? { '--ql-indent': `${depth * 40}px` } : undefined}
        onClick={() => onSelect?.(node)}
      >
        {!isRoot && <span className="ql-tree-rail" aria-hidden />}

        <button
          type="button"
          className={`ql-row-chevron ${hasChildren ? '' : 'is-hidden'}`}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setExpanded(!expanded); }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren && <ChevronRight size={14} />}
        </button>

        <span className="ql-row-index">
          {isRoot && hasChildren ? paddedIndex(node.children.length) : ''}
        </span>

        <div
          className={`ql-row-avatar ${node.is_company_priority ? 'is-priority' : ''} ${isRoot ? '' : 'is-nested'}`}
          title={node.owner_name || node.owner_email}
        >
          {initials(node.owner_name || node.owner_email)}
        </div>

        <div className="ql-row-title-col">
          <div className={`ql-row-title ${isRoot ? 'is-serif' : 'is-sans'}`}>{node.name}</div>
          {isRoot && node.is_company_priority && (
            <div className="ql-row-priority-eyebrow">
              <span className="ql-row-priority-dot" aria-hidden />
              COMPANY PRIORITY
            </div>
          )}
        </div>

        <div className="ql-row-actions" onClick={(e) => e.stopPropagation()}>
          {!readOnly && (
            <button
              type="button"
              className="ql-row-more"
              onClick={() => setMenuOpen(m => !m)}
              aria-label="Actions"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
          {menuOpen && (
            <div className="ql-row-menu" onMouseLeave={() => setMenuOpen(false)}>
              {canEdit && (
                <button
                  type="button"
                  className="ql-row-menu-item"
                  onClick={() => { onEdit?.(node); setMenuOpen(false); }}
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button
                type="button"
                className="ql-row-menu-item"
                onClick={() => { onAddSubGoal?.(node); setMenuOpen(false); }}
              >
                <Plus size={13} /> Add Sub-Goal
              </button>
              <button
                type="button"
                className="ql-row-menu-item"
                onClick={() => { onTogglePin?.(node, !pinned); setMenuOpen(false); }}
              >
                {pinned
                  ? <><PinOff size={13} /> Unpin</>
                  : <><Pin size={13} /> Pin as My Priority</>}
              </button>
              {canDelete && (
                <button
                  type="button"
                  className="ql-row-menu-item is-danger"
                  onClick={() => { onDelete?.(node); setMenuOpen(false); }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          )}
        </div>

        <div className="ql-row-meta">
          <div className="ql-row-status">
            <span
              className="ql-status-dot"
              style={{ background: statusColor, boxShadow: `0 0 0 3px ${statusColor}22` }}
              aria-hidden
            />
            <span className="ql-status-label">{statusCopy}</span>
          </div>

          <div className="ql-row-progress">
            <span className="ql-progress-rule">
              <span
                className="ql-progress-fill"
                style={{ width: `${pct}%`, background: statusColor }}
              />
              <span
                className="ql-progress-dot"
                style={{ left: `${pct}%`, background: statusColor }}
                aria-hidden
              />
            </span>
            <span className="ql-progress-readout">
              {pct}
              <sup>%</sup>
            </span>
          </div>
        </div>
      </div>

      {hasChildren && expanded && node.children.map((child, idx) => (
        <LedgerRow
          key={child.id}
          node={child}
          depth={depth + 1}
          isLastSibling={idx === node.children.length - 1}
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
    </>
  );
}
