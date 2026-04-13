import { useState, useEffect } from 'react';
import { getPlacements, updateJobInBullhorn, updateJobOverrides, getRecruiters, getOpportunities } from '../../lib/api';
import { getFollowUpUrgency } from './lib/urgency';
import EditableDate from './EditableDate';
import EditableSelect from './EditableSelect';
import EditableCell from './EditableCell';

export default function StatsStrip({ stats, jobs, loading, onJobUpdated }) {
  const [showContractors, setShowContractors] = useState(false);
  const [showCE, setShowCE] = useState(false);
  const [showPerm, setShowPerm] = useState(false);
  const [showMissedFollowUps, setShowMissedFollowUps] = useState(false);
  const [showFilled, setShowFilled] = useState(false);
  const [showAB, setShowAB] = useState(false);
  const [showC, setShowC] = useState(false);
  const [showOpenReqs, setShowOpenReqs] = useState(false);
  const [showAccepting, setShowAccepting] = useState(false);
  const [placements, setPlacements] = useState([]);
  const [placementsLoading, setPlacementsLoading] = useState(false);
  const [showOpportunities, setShowOpportunities] = useState(false);
  const [opportunities, setOpportunities] = useState([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);
  const [recruiters, setRecruiters] = useState([]);

  useEffect(() => {
    getRecruiters().then(res => setRecruiters(res.data || [])).catch(() => {});
  }, []);

  // Compute stats from jobs array
  const openReqs = stats?.openReqs ?? 0;
  const acceptingCandidates = stats?.acceptingCandidates ?? 0;
  const activeContractors = stats?.activeContractors ?? 0;
  const filledCount = stats?.filled ?? 0;
  const totalOpportunities = stats?.totalOpportunities ?? 0;

  // Accepting candidates jobs
  const acceptingJobs = (jobs || []).filter(j => j.status === 'Accepting Candidates');

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
  const cReqs = (jobs || []).filter(j => j.priority === 'C');
  const cReqCount = cReqs.length;

  // Potential Spread: Accepting Candidates or Filled jobs with a ceSpread value
  const ceJobs = (jobs || []).filter(j => j.ceSpread && (j.status === 'Accepting Candidates' || j.status === 'Filled') && (j.priority === 'A' || j.priority === 'B'));
  const totalCE = ceJobs.reduce((sum, j) => sum + j.ceSpread, 0);

  // Perm jobs: Accepting Candidates or Filled with a permFee value
  const permJobs = (jobs || []).filter(j => j.permFee && (j.status === 'Accepting Candidates' || j.status === 'Filled'));
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

  const trOptions = [
    ...recruiters.map(u => ({ value: String(u.id), label: u.initials })),
    { value: 'ZZ', label: 'ZZ' },
    { value: '*', label: '*' },
  ];

  const handleTrSave = async (job, rawValue) => {
    const hadPrevious = !!(job.recruiter && job.recruiter.trim() && job.recruiter !== 'ZZ' && job.recruiter !== '*');
    const now = new Date().toISOString();

    if (rawValue === 'ZZ' || rawValue === '*') {
      try {
        await updateJobOverrides(job.id, { recruiter: rawValue, tr_reassigned: hadPrevious ? '1' : undefined, tr_assigned_at: now });
        if (onJobUpdated) {
          onJobUpdated(job.id, 'recruiter', rawValue);
          onJobUpdated(job.id, 'trAssignedAt', now);
          if (hadPrevious) onJobUpdated(job.id, 'trReassigned', true);
        }
      } catch (err) { console.error('Failed to save TR:', err); }
      return;
    }

    const userId = parseInt(rawValue, 10);
    const user = recruiters.find(u => u.id === userId);
    try {
      await updateJobInBullhorn(job.id, { assignedUsers: { replaceAll: [userId] } });
      if (onJobUpdated) {
        onJobUpdated(job.id, 'recruiter', user?.initials || '');
        onJobUpdated(job.id, 'assignedUserIds', [userId]);
        onJobUpdated(job.id, 'trAssignedAt', now);
        if (hadPrevious) onJobUpdated(job.id, 'trReassigned', true);
      }
      if (hadPrevious) {
        updateJobOverrides(job.id, { recruiter: '', tr_reassigned: '1', tr_assigned_at: now }).catch(() => {});
      } else {
        updateJobOverrides(job.id, { recruiter: '', tr_reassigned: '', tr_assigned_at: now }).catch(() => {});
      }
    } catch (err) { console.error('Failed to update TR in Bullhorn:', err); }
  };

  const renderTrCell = (job) => {
    const firstAssigned = (job.assignedUserIds || [])[0];
    const currentValue = (job.recruiter === 'ZZ' || job.recruiter === '*') ? job.recruiter : (firstAssigned ? String(firstAssigned) : '');
    return (
      <EditableSelect
        value={currentValue}
        displayValue={job.recruiter || '—'}
        options={trOptions}
        onSave={(val) => handleTrSave(job, val)}
        className="cell-editable"
      />
    );
  };

  const handleFollowUpSave = async (jobId, value) => {
    try {
      await updateJobOverrides(jobId, { follow_up: value });
      if (onJobUpdated) onJobUpdated(jobId, 'followUp', value);
    } catch (err) {
      console.error('Failed to save follow up:', err);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: '2-digit', timeZone: 'America/Chicago',
    });
  };

  const items = [
    { label: 'Open Reqs', value: openReqs, color: '#c9a227', onClick: () => setShowOpenReqs(true) },
    { label: 'Accepting Candidates', value: acceptingCandidates, color: '#16a34a', onClick: () => setShowAccepting(true) },
    { label: 'Missed Follow Ups', value: missedFollowUps, color: '#dc2626', onClick: () => setShowMissedFollowUps(true) },
    { label: 'A/B Covered', value: `${abCovered} / ${abTotal}`, color: '#c9a227', onClick: () => setShowAB(true) },
    { label: 'C Reqs', value: cReqCount, color: '#94a3b8', onClick: () => setShowC(true) },
    { label: 'On The Board', value: filledCount, color: '#7c3aed', tooltip: 'The number of Jobs with a status of Filled', onClick: () => setShowFilled(true) },
    { label: 'Total Opportunities', value: totalOpportunities, color: '#0369a1', onClick: handleOpportunitiesClick },
    { label: 'Active Contractors', value: activeContractors, color: '#0d9488', onClick: handleContractorsClick },
    { label: 'Total Potential CE Spread', value: fmtCurrency(totalCE), color: '#2563eb', onClick: () => setShowCE(true), tooltip: 'W2: (Bill Rate - Pay Rate × 1.25) × 40 | C2C: (Bill Rate - Pay Rate × 1.05) × 40 | A/B priority, Accepting Candidates & Filled jobs only' },
    { label: 'Total Potential Perm Spread', value: fmtCurrency(totalPerm), color: '#9333ea', onClick: () => setShowPerm(true), tooltip: '(Salary Low × Fee %) ÷ 26 for Accepting Candidates & Filled jobs' },
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
                    <th>Spread</th>
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
                      <td className="cell-money">
                        {p.employmentType === 'Direct Hire'
                          ? (p.payRate ? `Perm` : '—')
                          : (p.billRate && p.payRate
                            ? `$${Math.round(((p.payRate * 1.25 - p.billRate) * 40 * -1)).toLocaleString('en-US')} CE`
                            : '—')}
                      </td>
                      <td>{p.status || '—'}</td>
                    </tr>
                  ))}
                  {placements.length === 0 && (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No active contractors found</td></tr>
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
                    <th>Exp Close</th>
                    <th>Deal Value</th>
                    <th>Weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map(o => (
                    <tr key={o.id}>
                      <td><a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=Opportunity&id=${o.id}`} target="_blank" rel="noopener noreferrer" className="bh-link">{o.id}</a></td>
                      <td>{o.title || '—'}</td>
                      <td>{o.client || '—'}</td>
                      <td>{o.owner || '—'}</td>
                      <td>{o.status || '—'}</td>
                      <td>{formatDate(o.expectedCloseDate)}</td>
                      <td className="cell-money">{o.dealValue ? fmtCurrency(o.dealValue) : '—'}</td>
                      <td className="cell-money">{o.weightedDealValue ? fmtCurrency(o.weightedDealValue) : '—'}</td>
                    </tr>
                  ))}
                  {opportunities.length > 0 && (
                    <tr className="total-row">
                      <td colSpan="6" style={{ textAlign: 'right', fontWeight: 700 }}>Totals</td>
                      <td className="cell-money" style={{ fontWeight: 700 }}>{fmtCurrency(opportunities.reduce((s, o) => s + (o.dealValue || 0), 0))}</td>
                      <td className="cell-money" style={{ fontWeight: 700 }}>{fmtCurrency(opportunities.reduce((s, o) => s + (o.weightedDealValue || 0), 0))}</td>
                    </tr>
                  )}
                  {opportunities.length === 0 && (
                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>No open opportunities found</td></tr>
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
                    {renderTrCell(j)}
                    <EditableCell
                      value={j.followUp}
                      placeholder="Follow Up"
                      onSave={(val) => handleFollowUpSave(j.id, val)}
                      className="cell-editable"
                      cellStyle={{ backgroundColor: '#dc2626', color: '#fff' }}
                      defaultText="No Follow Up"
                    />
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

      {/* A & B Reqs Modal */}
      {showAB && (
        <div className="modal-overlay" onClick={() => setShowAB(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>A & B Reqs ({abTotal}) — {abCovered} Covered</h2>
              <button className="modal-close" onClick={() => setShowAB(false)}>✕</button>
            </div>
            <table className="contractors-table">
              <thead>
                <tr>
                  <th>Pri</th>
                  <th>Req#</th>
                  <th>Job Title</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>TR</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {abReqs.map(j => (
                  <tr key={j.id}>
                    <td><span style={{ fontWeight: 700, color: j.priority === 'A' ? '#16a34a' : '#eab308' }}>{j.priority}</span></td>
                    <td>
                      <a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${j.id}`} target="_blank" rel="noopener noreferrer" className="bh-link">{j.id}</a>
                    </td>
                    <td>{j.title || '—'}</td>
                    <td>{j.client || '—'}</td>
                    <td>{j.status || '—'}</td>
                    <td>{j.owner || '—'}</td>
                    {renderTrCell(j)}
                    <td>{j.employmentType || '—'}</td>
                  </tr>
                ))}
                {abReqs.length === 0 && (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>No A or B reqs</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* C Reqs Modal */}
      {showC && (
        <div className="modal-overlay" onClick={() => setShowC(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>C Reqs ({cReqCount})</h2>
              <button className="modal-close" onClick={() => setShowC(false)}>✕</button>
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
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {cReqs.map(j => (
                  <tr key={j.id}>
                    <td>
                      <a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${j.id}`} target="_blank" rel="noopener noreferrer" className="bh-link">{j.id}</a>
                    </td>
                    <td>{j.title || '—'}</td>
                    <td>{j.client || '—'}</td>
                    <td>{j.status || '—'}</td>
                    <td>{j.owner || '—'}</td>
                    {renderTrCell(j)}
                    <td>{j.employmentType || '—'}</td>
                  </tr>
                ))}
                {cReqs.length === 0 && (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No C reqs</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Open Reqs Modal */}
      {showOpenReqs && (
        <div className="modal-overlay" onClick={() => setShowOpenReqs(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Open Reqs ({(jobs || []).length})</h2>
              <button className="modal-close" onClick={() => setShowOpenReqs(false)}>✕</button>
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
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {(jobs || []).map(j => (
                  <tr key={j.id}>
                    <td><a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${j.id}`} target="_blank" rel="noopener noreferrer" className="bh-link">{j.id}</a></td>
                    <td>{j.title || '—'}</td>
                    <td>{j.client || '—'}</td>
                    <td>{j.status || '—'}</td>
                    <td>{j.owner || '—'}</td>
                    <td>{j.recruiter || '—'}</td>
                    <td>{j.employmentType || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Accepting Candidates Modal */}
      {showAccepting && (
        <div className="modal-overlay" onClick={() => setShowAccepting(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Accepting Candidates ({acceptingJobs.length})</h2>
              <button className="modal-close" onClick={() => setShowAccepting(false)}>✕</button>
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
                  <th>Remote</th>
                </tr>
              </thead>
              <tbody>
                {acceptingJobs.map(j => (
                  <tr key={j.id}>
                    <td><a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${j.id}`} target="_blank" rel="noopener noreferrer" className="bh-link">{j.id}</a></td>
                    <td>{j.title || '—'}</td>
                    <td>{j.client || '—'}</td>
                    <td>{j.owner || '—'}</td>
                    <td>{j.recruiter || '—'}</td>
                    <td>{j.employmentType || '—'}</td>
                    <td>{j.remote || '—'}</td>
                  </tr>
                ))}
                {acceptingJobs.length === 0 && (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No jobs accepting candidates</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
