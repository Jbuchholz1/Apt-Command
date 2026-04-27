import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

function formatCell(value, format) {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'currency') {
    return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  if (format === 'currency2') {
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === 'number') {
    return Number(value).toLocaleString('en-US');
  }
  if (format === 'date' && typeof value === 'number') {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return value;
}

export default function DrillDownModal({ title, columns, rows, onClose }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return sorted;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return createPortal(
    <div className="exec-modal-overlay" onClick={onClose}>
      <div className="exec-modal" onClick={(e) => e.stopPropagation()}>
        <div className="exec-modal-header">
          <h3>{title} — {rows.length} {rows.length === 1 ? 'record' : 'records'}</h3>
          <button className="exec-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="exec-modal-body">
          <table className="exec-modal-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={c.align === 'num' ? 'num' : ''}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                    {sortKey === c.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={columns.length} className="exec-empty">No records.</td></tr>
              )}
              {sortedRows.map((row, i) => (
                <tr key={row.id ?? i}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === 'num' ? 'num' : ''}>
                      {formatCell(row[c.key], c.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body
  );
}
