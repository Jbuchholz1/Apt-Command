import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './reporting.css';
import { getExecutiveDashboard } from '../../lib/api';
import DateRangePicker from './components/DateRangePicker';
import TabNav from './executive/components/TabNav';
import WeeklyTab from './executive/WeeklyTab';
import MonthlyTab from './executive/MonthlyTab';
import QuarterlyTab from './executive/QuarterlyTab';

function getDefaultDates() {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  return {
    start: sunday.toISOString().slice(0, 10),
    end: today.toISOString().slice(0, 10),
  };
}

function formatCurrency(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyShort(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function KpiCard({ label, value, subtitle, tooltip, onClick, clickable }) {
  return (
    <div className={`exec-kpi-card ${clickable ? 'clickable' : ''}`} onClick={clickable ? onClick : undefined}>
      <div className="exec-kpi-header">
        <span className="exec-kpi-label">{label}</span>
        {tooltip && <span className="exec-kpi-tooltip" title={tooltip}>{'\u24D8'}</span>}
      </div>
      <div className="exec-kpi-value">{formatCurrency(value)}</div>
      {subtitle && <div className="exec-kpi-subtitle">{subtitle}</div>}
      {clickable && <div className="exec-kpi-hint">Click for details</div>}
    </div>
  );
}

function CurrentInputModal({ details, onClose }) {
  return createPortal(
    <div className="exec-modal-overlay" onClick={onClose}>
      <div className="exec-modal" onClick={(e) => e.stopPropagation()}>
        <div className="exec-modal-header">
          <h3>Current New Input — Breakdown</h3>
          <button className="exec-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="exec-modal-body">
          <table className="exec-modal-table">
            <thead>
              <tr>
                <th>Placement ID</th>
                <th>Client</th>
                <th>Job Title</th>
                <th>Emp Type</th>
                <th>AM</th>
                <th className="num">Input</th>
              </tr>
            </thead>
            <tbody>
              {details.length === 0 && (
                <tr><td colSpan={6} className="exec-empty">No placements in range.</td></tr>
              )}
              {details.map((d, i) => (
                <tr key={`${d.placementId}-${i}`}>
                  <td>{d.placementId}</td>
                  <td>{d.client}</td>
                  <td>{d.jobTitle}</td>
                  <td>{d.empType}</td>
                  <td>{d.am}</td>
                  <td className="num">{formatCurrency(d.input)}</td>
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

function PotentialInputModal({ details, onClose }) {
  return createPortal(
    <div className="exec-modal-overlay" onClick={onClose}>
      <div className="exec-modal" onClick={(e) => e.stopPropagation()}>
        <div className="exec-modal-header">
          <h3>Potential New Input — Breakdown ({details.length} open reqs)</h3>
          <button className="exec-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="exec-modal-body">
          <table className="exec-modal-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Client</th>
                <th>Job Title</th>
                <th>Owner</th>
                <th>Type</th>
                <th>Rate / Salary</th>
                <th className="num">Openings</th>
                <th className="num">Per Opening / Wk</th>
                <th className="num">Total / Wk</th>
              </tr>
            </thead>
            <tbody>
              {details.length === 0 && (
                <tr><td colSpan={9} className="exec-empty">No open reqs with bill+pay or salary+fee set.</td></tr>
              )}
              {details.map((d) => (
                <tr key={d.jobId}>
                  <td>{d.jobId}</td>
                  <td>{d.client}</td>
                  <td>{d.title}</td>
                  <td>{d.owner}</td>
                  <td>{d.kind || d.employmentType || '—'}</td>
                  <td>{d.rateDetail || '—'}</td>
                  <td className="num">{d.numOpenings}</td>
                  <td className="num">{formatCurrency(d.perOpening)}</td>
                  <td className="num">{formatCurrency(d.total)}</td>
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

export default function ExecutiveDashboard() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openModal, setOpenModal] = useState(null); // 'current' | 'potential' | null
  const [activeTab, setActiveTab] = useState('weekly');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getExecutiveDashboard(startDate, endDate);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatRange = () => {
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', opts)}`;
  };

  return (
    <div className="reporting-module">
      <div className="reporting-toolbar">
        <div className="toolbar-left">
          <h2 className="toolbar-title">Executive Reporting</h2>
          <span className="toolbar-date-range">{formatRange()}</span>
        </div>
        <div className="toolbar-right">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />
        </div>
      </div>

      {error && (
        <div className="error-banner">
          Failed to load data: {error}
          <button onClick={fetchData}>Retry</button>
        </div>
      )}

      {loading && !data && (
        <div className="reporting-loading">
          <div style={{ display: 'flex', gap: 20, padding: '24px' }}>
            <div className="skeleton-shimmer" style={{ flex: 1, height: 180, borderRadius: 8 }}></div>
            <div className="skeleton-shimmer" style={{ flex: 1, height: 180, borderRadius: 8 }}></div>
          </div>
        </div>
      )}

      {data && (
        <section className="exec-pinned-strip">
          <div className="exec-pinned-label">New Input — Live</div>
          <div className="exec-kpi-grid">
            <KpiCard
              label="Current New Input"
              value={data.currentNewInput.value}
              subtitle={`In range: ${formatRange()}`}
              tooltip={data.currentNewInput.formula}
              clickable={data.currentNewInput.details?.length > 0}
              onClick={() => setOpenModal('current')}
            />
            <KpiCard
              label="Potential New Input"
              value={data.potentialNewInput.value}
              subtitle={`${data.potentialNewInput.openReqCount} open reqs (weekly spread + perm fee)`}
              tooltip={data.potentialNewInput.formula}
              clickable={data.potentialNewInput.details?.length > 0}
              onClick={() => setOpenModal('potential')}
            />
          </div>
        </section>
      )}

      <TabNav active={activeTab} onChange={setActiveTab} rightSlot={formatRange()} />
      {activeTab === 'weekly' && <WeeklyTab startDate={startDate} endDate={endDate} />}
      {activeTab === 'monthly' && <MonthlyTab startDate={startDate} endDate={endDate} />}
      {activeTab === 'quarterly' && <QuarterlyTab startDate={startDate} endDate={endDate} />}

      {openModal === 'current' && data && (
        <CurrentInputModal details={data.currentNewInput.details} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'potential' && data && (
        <PotentialInputModal details={data.potentialNewInput.details} onClose={() => setOpenModal(null)} />
      )}
    </div>
  );
}
