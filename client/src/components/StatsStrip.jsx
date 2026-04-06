import { useState } from 'react';
import { getPlacements } from '../lib/api';
import { getFollowUpUrgency } from './ReqBoard';

export default function StatsStrip({ stats, jobs, loading }) {
  const [showContractors, setShowContractors] = useState(false);
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
    { label: 'Active Contractors', value: activeContractors, color: '#0d9488', clickable: true },
  ];

  return (
    <>
      <div className="stats-strip">
        {items.map(item => (
          <div
            key={item.label}
            className={`stat-card ${item.clickable ? 'stat-clickable' : ''}`}
            onClick={item.clickable ? handleContractorsClick : undefined}
          >
            <div className="stat-value" style={{ color: item.color }}>
              {loading ? '—' : (item.value ?? 0)}
            </div>
            <div className="stat-label">
              {item.label}
              {item.clickable && <span className="stat-link-icon"> ↗</span>}
            </div>
          </div>
        ))}
      </div>

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
                      <td>{formatDate(p.dateBegin)}</td>
                      <td>{formatDate(p.dateEnd)}</td>
                      <td>{p.payRate ? `$${p.payRate}` : '—'}</td>
                      <td>{p.billRate ? `$${p.billRate}` : '—'}</td>
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
    </>
  );
}
