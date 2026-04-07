import { useState } from 'react';
import { getPlacements, updateJobInBullhorn, getOpportunities } from '../lib/api';
import { getFollowUpUrgency } from './ReqBoard';
import EditableDate from './EditableDate';

export default function StatsStrip({ stats, jobs, loading }) {
  const [showContractors, setShowContractors] = useState(false);
  const [showCE, setShowCE] = useState(false);
  const [showPerm, setShowPerm] = useState(false);
  const [showOpportunities, setShowOpportunities] = useState(false);
  const [showMissedFollowUps, setShowMissedFollowUps] = useState(false);
  const [showFilled, setShowFilled] = useState(false);
  const [placements, setPlacements] = useState([]);
  const [placementsLoading, setPlacementsLoading] = useState(false);
  const [opportunities, setOpportunities] = useState([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);

  // Compute stats from jobs array
  const openReqs = stats?.openReqs ?? 0;
  const acceptingCandidates = stats?.acceptingCandidates ?? 0;
  const activeContractors = stats?.activeContractors ?? 0;
  const filledCount = stats?.filled ?? 0;
  const totalOpportunities = stats?.totalOpportunities ?? 0;

  // Missed follow-ups: no follow-up + past-due follow-ups (red urgency)
  const missedFollowUpJobs = (jobs || []).filter(j => getFollowUpUrgency(j.followUp) === 'red');

  // Filled jobs (On The Board)
  const filledJobs = (jobs || []).filter(j => j.status === 'Filled');
  const missedFollowUps = missedFollowUpJobs.length;

  // A + B reqs combined: covered = has an assigned TR
  const abReqs = (jobs || []).filter(j => j.priority === 'A' || j.priority === 'B');
  const abTotal = abReqs.length;
  const abCovered = abReqs.filter(j => (j.recruiter || '').trim()).length;

  // C reqs only
  const cReqCount = (jobs || []).filter(j => j.priority === 'C').length;

  // Potential Spread: Accepting Candidates or Filled jobs with a ceSpread value
  const ceJobs = (jobs || []).filter(j => j.ceSpread && (j.status === 'Accepting Candidates' || j.status === 'Filled'));
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

  const handleOpportunitiesClick = async () => {
    setShowOpportunities(true);
    setOpportunitiesLoading(true);
    try {
      const res = await getOpportunities();
      setOpportunities(res.data || []);
    } catch (err) {
      console.error('Failed to load opportunities:', err);
    } finally {
      setOpportunitiesLoading(false);
    }
  };

  const handlePlacementDateSave = async (placementIndex, field, tsValue) => {
    const p = placements[placementIndex];
    if (!p || !p.jobOrderId) return;
    const bhField = field === 'dateBegin' ? 'startDate' : 'estimatedEndDate';
    try {
      await updateJobInBullhorn(p.jobOrderId, { [bhField]: tsValue });
      // Update local state
      setPlacements(prev => prev.map((pl, i) =>
        i === placementIndex ? { ...pl, [field]: tsValue ? new Date(tsValue).toISOString() : null } : pl
      ));
    } catch (err) {
      console.error('Failed to update placement date:', err);
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
    { label: 'Accepting Candidates', value: acceptingCandidates, color: '#16a34a' },
    { label: 'Missed Follow Ups', value: missedFollowUps, color: '#dc2626', onClick: () => setShowMissedFollowUps(true) },
    { label: 'A & B Reqs Covered', value: `${abCovered} / ${abTotal}`, color: '#c9a227' },
    { label: 'C Reqs', value: cReqCount, color: '#94a3b8' },
    { label: 'On The Board', value: filledCount, color: '#7c3aed', tooltip: 'The number of Jobs with a status of Filled', onClick: () => setShowFilled(true) },
    { label: 'Total Opportunities', value: totalOpportunities, color: '#0369a1', onClick: handleOpportunitiesClick },
    { label: 'Active Contractors', value: activeContractors, color: '#0d9488', onClick: handleContractorsClick },
    { label: 'Total Potential Spread', value: fmtCurrency(totalCE), color: '#2563eb', onClick: () => setShowCE(true), tooltip: '(Bill Rate - Pay Rate) × 40 for Accepting Candidates & Filled jobs' },
    { label: 'Total Perm Spread', value: fmtCurrency(totalPerm), color: '#9333ea', onClick: () => setShowPerm(true), tooltip: 'Sum of (Salary Low × Fee %) ÷ 26 for each perm job' },
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
              {item.tooltip && (
                <span className="stat-tooltip-wrap">
                  <span className="stat-tooltip-icon">&#9432;</span>
                  <span className="stat-tooltip-text">{item.tooltip}</span>
                </span>
              )}
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
                  {placements.map((p, idx) => (
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
                      <EditableDate
                        value={p.dateBegin}
                        onSave={(val) => handlePlacementDateSave(idx, 'dateBegin', val)}
                        className="cell-editable cell-date"
                      />
                      <EditableDate
                        value={p.dateEnd}
                        onSave={(val) => handlePlacementDateSave(idx, 'dateEnd', val)}
                        className="cell-editable cell-date"
                      />
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

      {/* Potential Spread Breakdown Modal */}
      {showCE && (
        <div className="modal-overlay" onClick={() => setShowCE(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Potential Spread Breakdown ({ceJobs.length} jobs — {fmtCurrency(totalCE)})</h2>
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
              <h2>Perm Spread Breakdown ({permJobs.length} jobs — {fmtCurrency(totalPerm)})</h2>
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

      {/* Opportunities Modal */}
      {showOpportunities && (
        <div className="modal-overlay" onClick={() => setShowOpportunities(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Open Opportunities ({opportunities.length})</h2>
              <button className="modal-close" onClick={() => setShowOpportunities(false)}>✕</button>
            </div>
            {opportunitiesLoading ? (
              <div className="modal-loading">Loading opportunities...</div>
            ) : (
              <table className="contractors-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Client</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th>Date Added</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map(o => (
                    <tr key={o.id}>
                      <td>
                        <a
                          href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=Opportunity&id=${o.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bh-link"
                        >
                          {o.id}
                        </a>
                      </td>
                      <td>{o.title || '—'}</td>
                      <td>{o.client || '—'}</td>
                      <td>{o.owner || '—'}</td>
                      <td>{o.status || '—'}</td>
                      <td>{formatDate(o.dateAdded)}</td>
                    </tr>
                  ))}
                  {opportunities.length === 0 && (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>No open opportunities found</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Missed Follow Ups Modal */}
      {showMissedFollowUps && (
        <div className="modal-overlay" onClick={() => setShowMissedFollowUps(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Missed Follow Ups ({missedFollowUpJobs.length})</h2>
              <button className="modal-close" onClick={() => setShowMissedFollowUps(false)}>✕</button>
            </div>
            <table className="contractors-table">
              <thead>
                <tr>
                  <th>Req#</th>
                  <th>Job Title</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>TR</th>
                  <th>Follow Up</th>
                </tr>
              </thead>
              <tbody>
                {missedFollowUpJobs.map(j => (
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
                    <td>{j.status || '—'}</td>
                    <td>{j.owner || '—'}</td>
                    <td>{j.recruiter || '—'}</td>
                    <td style={{ color: '#dc2626', fontWeight: 600 }}>{j.followUp || 'No Follow Up'}</td>
                  </tr>
                ))}
                {missedFollowUpJobs.length === 0 && (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No missed follow ups</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* On The Board (Filled) Modal */}
      {showFilled && (
        <div className="modal-overlay" onClick={() => setShowFilled(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>On The Board — Filled ({filledJobs.length})</h2>
              <button className="modal-close" onClick={() => setShowFilled(false)}>✕</button>
            </div>
            <table className="contractors-table">
              <thead>
                <tr>
                  <th>Req#</th>
                  <th>Job Title</th>
                  <th>Client</th>
                  <th>Owner</th>
                  <th>TR</th>
                  <th>Type</th>
                  <th>Start</th>
                </tr>
              </thead>
              <tbody>
                {filledJobs.map(j => (
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
                    <td>{j.recruiter || '—'}</td>
                    <td>{j.employmentType || '—'}</td>
                    <td>{formatDate(j.startDate)}</td>
                  </tr>
                ))}
                {filledJobs.length === 0 && (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No filled jobs</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
