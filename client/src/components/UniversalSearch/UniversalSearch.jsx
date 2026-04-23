import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { useSearch } from '../../hooks/useSearch';
import {
  RESULT_GROUP_ORDER,
  getResultIcon,
  formatResultDate,
  getRecentSearches,
  saveRecentSearch,
  clearRecentSearches,
} from '../../lib/searchHelpers';
import './universalSearch.css';

// Render hitHighlightedSummary (or plain text) safely:
// HTML-escape everything, then promote only <em>/</em> to <mark>.
function renderHighlightedHtml(raw) {
  if (!raw) return '';
  const escaped = String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/&lt;em&gt;/g, '<mark>')
    .replace(/&lt;\/em&gt;/g, '</mark>');
}

export default function UniversalSearch({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [expanded, setExpanded] = useState({});
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);

  const { results, isLoading, error, totalCount, durationMs, errors } = useSearch(query);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFocusedIndex(0);
      setExpanded({});
      setRecent(getRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const visibleRows = useMemo(() => {
    const flat = [];
    for (const type of RESULT_GROUP_ORDER) {
      const items = results[type] || [];
      if (!items.length) continue;
      const limit = expanded[type] ? items.length : Math.min(3, items.length);
      for (let i = 0; i < limit; i++) {
        flat.push({ ...items[i], groupType: type });
      }
    }
    return flat;
  }, [results, expanded]);

  useEffect(() => {
    if (focusedIndex >= visibleRows.length) {
      setFocusedIndex(Math.max(0, visibleRows.length - 1));
    }
  }, [visibleRows.length, focusedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => (visibleRows.length === 0 ? 0 : (prev + 1) % visibleRows.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => (visibleRows.length === 0 ? 0 : (prev - 1 + visibleRows.length) % visibleRows.length));
        return;
      }
      if (e.key === 'Enter') {
        const row = visibleRows[focusedIndex];
        if (row) {
          e.preventDefault();
          openResult(row);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, visibleRows, focusedIndex, onClose]);

  useEffect(() => {
    const el = resultsRef.current?.querySelector(`[data-row-index="${focusedIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  if (!isOpen) return null;

  function openResult(row) {
    if (row?.url) window.open(row.url, '_blank', 'noopener');
    if (query.trim()) saveRecentSearch(query);
    onClose();
  }

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const showEmptyState = !hasQuery && !isLoading;
  const showNoResults = hasQuery && !isLoading && totalCount === 0 && !error;

  let rowIndex = 0;

  return (
    <div className="us-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Universal search">
      <div className="us-modal" onClick={(e) => e.stopPropagation()}>
        <div className="us-input-row">
          <Search size={18} className="us-input-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="us-input"
            placeholder="Search people, jobs, files, email…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFocusedIndex(0); }}
            aria-label="Search query"
          />
          {query && (
            <button
              type="button"
              className="us-clear"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
          <span className="us-esc-hint">ESC</span>
        </div>

        <div className="us-body" ref={resultsRef}>
          {error && <div className="us-error">Search failed: {error}</div>}

          {errors && errors.length > 0 && (
            <div className="us-warning">⚠ Some sources unavailable: {errors.join(', ')}</div>
          )}

          {showEmptyState && (
            <div className="us-empty">
              {recent.length > 0 ? (
                <>
                  <div className="us-empty-label">Recent searches</div>
                  <div className="us-recent-row">
                    {recent.map(r => (
                      <button
                        key={r.query}
                        type="button"
                        className="us-recent-chip"
                        onClick={() => setQuery(r.query)}
                      >
                        {r.query}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="us-recent-clear"
                      onClick={() => { clearRecentSearches(); setRecent([]); }}
                    >
                      Clear
                    </button>
                  </div>
                </>
              ) : (
                <div className="us-empty-hint">Start typing to search M365 + Bullhorn</div>
              )}
              <div className="us-kbd-row">
                <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                <span><kbd>↵</kbd> open</span>
                <span><kbd>Esc</kbd> close</span>
              </div>
            </div>
          )}

          {hasQuery && isLoading && (
            <div className="us-loading">
              {[0, 1, 2].map(section => (
                <div className="us-skeleton-group" key={section}>
                  <div className="us-skeleton-header" />
                  <div className="us-skeleton-row" />
                  <div className="us-skeleton-row" />
                </div>
              ))}
              <div className="us-loading-label">Searching M365 + Bullhorn…</div>
            </div>
          )}

          {showNoResults && (
            <div className="us-empty-hint us-noresults">No results for “{trimmed}”</div>
          )}

          {hasQuery && !isLoading && totalCount > 0 && (
            <div className="us-groups">
              {RESULT_GROUP_ORDER.map(type => {
                const items = results[type] || [];
                if (!items.length) return null;
                const limit = expanded[type] ? items.length : Math.min(3, items.length);
                const remaining = items.length - limit;
                const icon = getResultIcon(type);
                return (
                  <div key={type} className="us-group">
                    <div className="us-group-header">
                      <span className="us-group-label">{icon.label}</span>
                      <span className="us-group-count">{items.length}</span>
                    </div>
                    {items.slice(0, limit).map(item => {
                      const myIndex = rowIndex++;
                      const focused = myIndex === focusedIndex;
                      return (
                        <button
                          key={`${type}-${item.id}-${myIndex}`}
                          type="button"
                          data-row-index={myIndex}
                          className={`us-row ${focused ? 'focused' : ''}`}
                          onMouseEnter={() => setFocusedIndex(myIndex)}
                          onClick={() => openResult(item)}
                        >
                          <span className="us-row-icon">{icon.emoji}</span>
                          <span className="us-row-main">
                            <span
                              className="us-row-title"
                              dangerouslySetInnerHTML={{ __html: renderHighlightedHtml(item.title) }}
                            />
                            {item.subtitle && (
                              <span className="us-row-subtitle">{item.subtitle}</span>
                            )}
                          </span>
                          {item.date && (
                            <span className="us-row-date">{formatResultDate(item.date)}</span>
                          )}
                        </button>
                      );
                    })}
                    {remaining > 0 && (
                      <button
                        type="button"
                        className="us-see-all"
                        onClick={() => setExpanded(e => ({ ...e, [type]: true }))}
                      >
                        See all {items.length} →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="us-footer">
          <span className="us-footer-left">M365 + Bullhorn</span>
          <span className="us-footer-center">
            {hasQuery && !isLoading ? `${totalCount} result${totalCount === 1 ? '' : 's'} · ${durationMs}ms` : ''}
          </span>
          <span className="us-footer-right"><kbd>⌘K</kbd> open · <kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
