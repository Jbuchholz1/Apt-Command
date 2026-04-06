import { useState } from 'react';
import { getPlacements } from '../lib/api';
import { getFollowUpUrgency } from './ReqBoard';

export default function StatsStrip({ stats, jobs, loading }) {
  const [showContractors, setShowContractors] = useState(false);
  const [showCE, setShowCE] = useState(false);
  const [showPerm, setShowPerm] = useState(false);
  const [placements, setPlacements] = useState([]);
  const [placementsLoading, setPlacementsLoading] = useState(false);

  // Compute stats from jobs array
  const openReqs = stats?.openReqs ?? 0;
  const acceptingCandidates = stats?.acceptingCandidates ?? 0;
  const activeContractors = stats?.activeContractors ?? 0;

  // Missed follow-ups: no follow-up + past-due follow-ups (red urgency)
  const missedFollowUps = (jobs || []).filter(j => getFollowUpUrgency(j.followUp) === 'red').length;

  // A reqs
  const aReqs = (jobs || []).filter(j => j.priority === 'A');
  const aReqCount = aReqs.length;
  const aReqsNoTR = aReqs.filter(j => !(j.recruiter || '').trim()).length;

  // B + C reqs
  const bcReqCount = (jobs || []).filter(j => j.priority === 'B' || j.priority === 'C').length;

  // CE jobs: those with a ceSpread value
  const ceJobs = (jobs || []).filter(j => j.ceSpread);
  const totalCE = ceJobs.reduce((sum, j) => sum + j.ceSpread, 0);

  // Perm jobs: those with a permFee value
  const permJobs = (jobs || []).filter(j => j.permFee);
  const totalPerm = permJobs.reduce((sum, j) => sum + j.permFee, 0);

  const fmtCurrency = (val) => `$${Math.round(val).toLocaleString('en-US')}`;

  const handleContractorsClick = async () => {
    setShowContractors(true);
    setPlacementsLoading(true);
    try {
      const res = await getPlacements();
      setPlacements(res.data || []);
    } catch (err) {
      console.error('Failed to load placements:', err);
    } finally {
      setPlacementsLoading(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: '2-digit', timeZone: 'America/Chicago',
    });
  };

  const items = [
    { label: 'Open Reqs', value: openReqs, color: '#c9a227' },
    { label: 'Accepting', value: acceptingCandidates, color: '#16a34a' },
    { label: 'Missed Follow Ups', value: missedFollowUps, color: '#dc2626' },
    { label: 'A Reqs', value: `${aReqCount} / ${aReqsNoTR} no TR`, color: '#c9a227' },
    { label: 'B + C Reqs', value: bcReqCount, color: '#475569' },
    { label: 'Active Contractors', value: activeContractors, color: '#0d9488', onClick: handleContractorsClick },
    { label: 'Total CE Input', value: fmtCurrency(totalCE), color: '#2563eb', onClick: () => setShowCE(true) },
    { label: 'Total Perm Input', value: fmtCurrency(totalPerm), color: '#9333ea', onClick: () => setShowPerm(true) },
  ];

  return (
    <>
      <div className="stats-strip">
        {items.map(item => (
          <div
            key={item.label}
            className={`stat-card ${item.onClick ? 'stat-clickable' : ''}`}
            onClick={item.onClick || undefined}
          >
            <div className="stat-value" style={{ color: item.color }}>
              {loading ? '—' : (item.value ?? 0)}
            </div>
            <div className="stat-label">
              {item.label}
              {item.onClick && <span className="stat-link-icon"> ↗</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Active Contractors Modal */}
      {showContractors && (
        <div className="modal-overlay" onClick={() => setShowContractors(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Active Contractors ({placements.length})</h2>
              <button className="modal-close" onClick={() => setShowContractors(false)}>✕</button>
            </div>
            {placementsLoading ? (
              <div className="modal-loading">Loading contractors...</div>
            ) : (
              <table className="contractors-table">
                <thead>
                  <tr>
                    <th>Contractor</th>
                    <th>Job Title</th>
                    <th>Type</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Pay Rate</th>
                    <th>Bill Rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {placements.map(p => (
                    <tr key={p.id}>
                      <td>
                        {p.candidateId ? (
                          <a
                            href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=Candidate&id=${p.candidateId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bh-link"
                          >
                            {p.candidate || '—'}
                          </a>
                        ) : (p.candidate || '—')}
                      </td>
                      <td>{p.jobTitle || '—'}</td>
                      <td>{p.employmentType || '—'}</td>
                      <td>{formatDate(p.dateBegin)}</td>
                      <td>{formatDate(p.dateEnd)}</td>
                      <td>{p.payRate ? `$${p.payRate}` : '—'}</td>
                      <td>{p.billRate ? `$${p.billRate}` : '—'}</td>
                      <td>{p.status || '—'}</td>
                    </tr>
                  ))}
                  {placements.length === 0 && (
                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>No active contractors found</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* CE Input Breakdown Modal */}
      {showCE && (
        <div className="modal-overlay" onClick={() => setShowCE(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>CE Input Breakdown ({ceJobs.length} jobs — {fmtCurrency(totalCE)})</h2>
              <button className="modal-close" onClick={() => setShowCE(false)}>✕</button>
            </div>
            <table className="contractors-table">
              <thead>
                <tr>
                  <th>Req#</th>
                  <th>Job Title</th>
                  <th>Client</th>
                  <th>Owner</th>
                  <th>Pay Rate</th>
                  <th>Bill Rate</th>
                  <th>CE $</th>
                </tr>
              </thead>
              <tbody>
                {ceJobs.map(j => (
                  <tr key={j.id}>
                    <td>
                      <a
                        href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${j.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bh-link"
                      >
                        {j.id}
                      </a>
                    </td>
                    <td>{j.title || '—'}</td>
                    <td>{j.client || '—'}</td>
                    <td>{j.owner || '—'}</td>
                    <td>{j.payRate ? `$${j.payRate}` : '—'}</td>
                    <td>{j.billRate ? `$${j.billRate}` : '—'}</td>
                    <td className="cell-money">{fmtCurrency(j.ceSpread)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan="6" style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
                  <td className="cell-money" style={{ fontWeight: 700 }}>{fmtCurrency(totalCE)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Perm Input Breakdown Modal */}
      {showPerm && (
        <div className="modal-overlay" onClick={() => setShowPerm(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Perm Input Breakdown ({permJobs.length} jobs — {fmtCurrency(totalPerm)})</h2>
              <button className="modal-close" onClick={() => setShowPerm(false)}>✕</button>
            </div>
            <table className="contractors-table">
              <thead>
                <tr>
                  <th>Req#</th>
                  <th>Job Title</th>
                  <th>Client</th>
                  <th>Owner</th>
                  <th>Salary</th>
                  <th>Fee %</th>
                  <th>Perm $</th>
                </tr>
              </thead>
              <tbody>
                {permJobs.map(j => (
                  <tr key={j.id}>
                    <td>
                      <a
                        href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${j.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bh-link"
                      >
                        {j.id}
                      </a>
                    </td>
                    <td>{j.title || '—'}</td>
                    <td>{j.client || '—'}</td>
                    <td>{j.owner || '—'}</td>
                    <td>{j.salary ? `$${Number(j.salary).toLocaleString('en-US')}` : '—'}</td>
                    <td>{j.feePercent ? `${(j.feePercent * 100).toFixed(0)}%` : '—'}</td>
                    <td className="cell-money">{fmtCurrency(j.permFee)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan="6" style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
                  <td className="cell-money" style={{ fontWeight: 700 }}>{fmtCurrency(totalPerm)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
