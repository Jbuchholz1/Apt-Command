import { useState, useEffect, useCallback } from 'react';
import { getOpportunities, updateOpportunityInBullhorn } from '../../lib/api';
import EditableDate from '../req-board/EditableDate';

const BH_BASE = 'https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit', timeZone: 'America/Chicago',
  });
}

function fmtCurrency(val) {
  return `$${Math.round(val).toLocaleString('en-US')}`;
}

export default function OpportunityPipeline() {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({ status: '', owner: '', client: '' });
  const [sort, setSort] = useState({ key: 'dateAdded', dir: 'desc' });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getOpportunities();
      setOpportunities(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const statuses = [...new Set(opportunities.map(o => o.status).filter(Boolean))].sort();
  const owners = [...new Set(opportunities.map(o => o.owner).filter(Boolean))].sort();
  const clients = [...new Set(opportunities.map(o => o.client).filter(Boolean))].sort();

  const filtered = opportunities
    .filter(o => {
      if (filter.status && o.status !== filter.status) return false;
      if (filter.owner && o.owner !== filter.owner) return false;
      if (filter.client && o.client !== filter.client) return false;
      return true;
    })
    .sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });

  const toggleSort = (key) => setSort(prev =>
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  );
  const sortIcon = (key) => sort.key !== key ? ' ↕' : sort.dir === 'asc' ? ' ↑' : ' ↓';

  const totalDeal = filtered.reduce((s, o) => s + (o.dealValue || 0), 0);
  const totalWeighted = filtered.reduce((s, o) => s + (o.weightedDealValue || 0), 0);

  return (
    <div className="pipeline-module">
      <div className="pipeline-toolbar">
        <div className="toolbar-left">
          <h2 className="toolbar-title">Opportunity Pipeline</h2>
          <span className="pipeline-count">{filtered.length} opportunities</span>
        </div>
        <div className="toolbar-right">
          <button className="pipeline-refresh-btn" onClick={fetchData}>Refresh</button>
        </div>
      </div>

      {error && (
        <div className="pipeline-error">
          Failed to load opportunities: {error}
          <button onClick={fetchData}>Retry</button>
        </div>
      )}

      <div className="pipeline-content">
        {/* Summary cards */}
        <div className="pipeline-summary">
          <div className="pipeline-stat">
            <div className="pipeline-stat-value">{filtered.length}</div>
            <div className="pipeline-stat-label">Total Opportunities</div>
          </div>
          <div className="pipeline-stat">
            <div className="pipeline-stat-value">{fmtCurrency(totalDeal)}</div>
            <div className="pipeline-stat-label">Total Deal Value</div>
          </div>
          <div className="pipeline-stat">
            <div className="pipeline-stat-value">{fmtCurrency(totalWeighted)}</div>
            <div className="pipeline-stat-label">Weighted Value</div>
          </div>
        </div>

        {/* Filters */}
        <div className="pipeline-filters">
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} className="pipeline-filter-select">
            <option value="">All Statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filter.owner} onChange={e => setFilter(f => ({ ...f, owner: e.target.value }))} className="pipeline-filter-select">
            <option value="">All Owners</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={filter.client} onChange={e => setFilter(f => ({ ...f, client: e.target.value }))} className="pipeline-filter-select">
            <option value="">All Clients</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(filter.status || filter.owner || filter.client) && (
            <button onClick={() => setFilter({ status: '', owner: '', client: '' })} className="pipeline-filter-clear">Clear</button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="pipeline-loading">Loading opportunities...</div>
        ) : (
          <div className="pipeline-table-wrap">
            <table className="pipeline-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('id')}>ID{sortIcon('id')}</th>
                  <th onClick={() => toggleSort('title')}>Title{sortIcon('title')}</th>
                  <th onClick={() => toggleSort('client')}>Client{sortIcon('client')}</th>
                  <th onClick={() => toggleSort('owner')}>Owner{sortIcon('owner')}</th>
                  <th onClick={() => toggleSort('status')}>Status{sortIcon('status')}</th>
                  <th onClick={() => toggleSort('expectedCloseDate')}>Exp Close{sortIcon('expectedCloseDate')}</th>
                  <th onClick={() => toggleSort('dealValue')}>Deal Value{sortIcon('dealValue')}</th>
                  <th onClick={() => toggleSort('weightedDealValue')}>Weighted{sortIcon('weightedDealValue')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id}>
                    <td><a href={`${BH_BASE}?Entity=Opportunity&id=${o.id}`} target="_blank" rel="noopener noreferrer" className="pipeline-bh-link">{o.id}</a></td>
                    <td>{o.title || '—'}</td>
                    <td>{o.client || '—'}</td>
                    <td>{o.owner || '—'}</td>
                    <td>{o.status || '—'}</td>
                    <EditableDate
                      value={o.expectedCloseDate}
                      onSave={async (tsValue) => {
                        try {
                          await updateOpportunityInBullhorn(o.id, { expectedCloseDate: tsValue });
                          setOpportunities(prev => prev.map(op =>
                            op.id === o.id ? { ...op, expectedCloseDate: tsValue ? new Date(tsValue).toISOString() : null } : op
                          ));
                        } catch (err) {
                          console.error('Failed to update expected close date:', err);
                        }
                      }}
                    />
                    <td className="pipeline-money">{o.dealValue ? fmtCurrency(o.dealValue) : '—'}</td>
                    <td className="pipeline-money">{o.weightedDealValue ? fmtCurrency(o.weightedDealValue) : '—'}</td>
                  </tr>
                ))}
                {filtered.length > 0 && (
                  <tr className="pipeline-total-row">
                    <td colSpan="6" style={{ textAlign: 'right', fontWeight: 700 }}>Totals</td>
                    <td className="pipeline-money" style={{ fontWeight: 700 }}>{fmtCurrency(totalDeal)}</td>
                    <td className="pipeline-money" style={{ fontWeight: 700 }}>{fmtCurrency(totalWeighted)}</td>
                  </tr>
                )}
                {filtered.length === 0 && (
                  <tr><td colSpan="8" className="pipeline-empty">No opportunities found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
