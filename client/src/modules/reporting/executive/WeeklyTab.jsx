import { useState, useEffect } from 'react';
import LiveTile from './components/LiveTile';
import PlaceholderTile from './components/PlaceholderTile';
import DrillDownModal from './components/DrillDownModal';
import {
  getSalesDashboard,
  getRecruiterDashboard,
  getStats,
  getExecutiveDashboard,
  getExecutiveWeekly,
} from '../../../lib/api';

function fmtCurrency(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US');
}
function fmtDelta(n) {
  if (n === null || n === undefined) return '';
  if (n === 0) return 'no change vs prior week';
  return `${n > 0 ? '+' : ''}${n} vs prior week`;
}
function tileState(loading, value) {
  if (loading) return 'loading';
  if (value === null || value === undefined) return 'error';
  return 'ready';
}

const COLS = {
  newReqs: [
    { key: 'id', label: 'Job ID' },
    { key: 'title', label: 'Title' },
    { key: 'client', label: 'Client' },
    { key: 'owner', label: 'Owner' },
    { key: 'numOpenings', label: 'Openings', align: 'num' },
  ],
  newPlacements: [
    { key: 'placementId', label: 'Placement ID' },
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'client', label: 'Client' },
  ],
  subs: [
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'client', label: 'Client' },
    { key: 'recruiter', label: 'Recruiter' },
    { key: 'date', label: 'Date', format: 'date' },
  ],
  offers: [
    { key: 'type', label: 'Type' },
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job' },
    { key: 'client', label: 'Client' },
    { key: 'date', label: 'Date', format: 'date' },
  ],
  headcount: [
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'client', label: 'Client' },
    { key: 'empType', label: 'Type' },
    { key: 'dateBegin', label: 'Begin', format: 'date' },
    { key: 'dateEnd', label: 'End', format: 'date' },
  ],
  attrition: [
    { key: 'candidate', label: 'Candidate' },
    { key: 'target', label: 'Target' },
    { key: 'comment', label: 'Note Comment' },
  ],
  newInput: [
    { key: 'placementId', label: 'Placement ID' },
    { key: 'client', label: 'Client' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'empType', label: 'Type' },
    { key: 'am', label: 'AM' },
    { key: 'input', label: 'Input', format: 'currency2', align: 'num' },
  ],
};

export default function WeeklyTab({ startDate, endDate }) {
  const [data, setData] = useState({ sales: null, recruiter: null, stats: null, exec: null, weekly: null });
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getSalesDashboard(startDate, endDate).catch(() => null),
      getRecruiterDashboard(startDate, endDate).catch(() => null),
      getStats().catch(() => null),
      getExecutiveDashboard(startDate, endDate).catch(() => null),
      getExecutiveWeekly(startDate, endDate).catch(() => null),
    ]).then(([sales, recruiter, stats, exec, weekly]) => {
      if (cancelled) return;
      setData({ sales, recruiter, stats, exec, weekly });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const newReqsRows = data.sales?.ams
    ? data.sales.ams.flatMap(am => (am.jobDetails?.newReqs || []).map(j => ({ ...j, owner: am.name })))
    : [];
  const newReqs = newReqsRows.length || (data.sales ? 0 : null);

  const newPlacementsRows = data.sales?.ams
    ? data.sales.ams.flatMap(am => (am.jobDetails?.newPlacements || []).map(p => ({ ...p, am: am.name })))
    : [];
  const newPlacements = newPlacementsRows.length || (data.sales ? 0 : null);

  const subsRows = data.recruiter?.details?.clientSubs || [];
  const candidateSubs = data.recruiter?.totals?.clientSubs ?? null;

  const offersRows = data.weekly?.offers?.details || [];
  const offersTotal = data.weekly?.offers?.total ?? null;
  const offersExtended = data.weekly?.offers?.extended ?? null;
  const offersAccepted = data.weekly?.offers?.accepted ?? null;

  const headcountRows = data.weekly?.headcount?.details || [];
  const activeContractors = data.weekly?.headcount?.current
    ?? data.stats?.activeContractors
    ?? null;
  const headcountDelta = data.weekly?.headcount?.delta ?? null;

  const attritionRows = data.weekly?.attrition?.details || [];
  const attritionCount = data.weekly?.attrition?.count ?? null;

  const newInputRows = data.exec?.currentNewInput?.details || [];
  const newInput = data.exec?.currentNewInput?.value ?? null;

  return (
    <>
      <div className="exec-kpi-grid">
        <LiveTile
          label="New Reqs"
          value={fmtNum(newReqs)}
          subtitle="JobOrders added in date range"
          state={tileState(loading, newReqs)}
          clickable={newReqsRows.length > 0}
          onClick={() => setOpenModal('newReqs')}
        />
        <LiveTile
          label="New Placements This Week"
          value={fmtNum(newPlacements)}
          subtitle="Placements approved in date range"
          state={tileState(loading, newPlacements)}
          clickable={newPlacementsRows.length > 0}
          onClick={() => setOpenModal('newPlacements')}
        />
        <LiveTile
          label="Candidate Submissions"
          value={fmtNum(candidateSubs)}
          subtitle="Client subs in date range"
          state={tileState(loading, candidateSubs)}
          clickable={subsRows.length > 0}
          onClick={() => setOpenModal('subs')}
        />
        <LiveTile
          label="Offers Extended & Accepted"
          value={fmtNum(offersTotal)}
          subtitle={offersExtended != null ? `${offersExtended} extended · ${offersAccepted} accepted` : 'In date range'}
          state={tileState(loading, offersTotal)}
          clickable={offersRows.length > 0}
          onClick={() => setOpenModal('offers')}
        />
        <LiveTile
          label="Active Contractor Headcount"
          value={fmtNum(activeContractors)}
          subtitle={headcountDelta != null ? fmtDelta(headcountDelta) : 'Current count'}
          state={tileState(loading, activeContractors)}
          clickable={headcountRows.length > 0}
          onClick={() => setOpenModal('headcount')}
        />
        <LiveTile
          label="Attrition / Dropouts This Week"
          value={fmtNum(attritionCount)}
          subtitle="Backout notes logged in range"
          state={tileState(loading, attritionCount)}
          clickable={attritionRows.length > 0}
          onClick={() => setOpenModal('attrition')}
        />
        <PlaceholderTile
          label="Client Escalations / Issues"
          note="Pending intake source (Slack channel or custom field)"
        />
        <LiveTile
          label="Revenue / Spread / Pipeline (weekly movement)"
          value={fmtCurrency(newInput)}
          subtitle="Current new input in date range"
          state={tileState(loading, newInput)}
          clickable={newInputRows.length > 0}
          onClick={() => setOpenModal('newInput')}
        />
        <PlaceholderTile
          label="Collections & Payments Received"
          note="Pending accounting integration"
        />
      </div>

      {openModal === 'newReqs' && (
        <DrillDownModal title="New Reqs" columns={COLS.newReqs} rows={newReqsRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'newPlacements' && (
        <DrillDownModal title="New Placements" columns={COLS.newPlacements} rows={newPlacementsRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'subs' && (
        <DrillDownModal title="Candidate Submissions" columns={COLS.subs} rows={subsRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'offers' && (
        <DrillDownModal title="Offers Extended & Accepted" columns={COLS.offers} rows={offersRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'headcount' && (
        <DrillDownModal title="Active Contractors" columns={COLS.headcount} rows={headcountRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'attrition' && (
        <DrillDownModal title="Attrition / Dropouts" columns={COLS.attrition} rows={attritionRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'newInput' && (
        <DrillDownModal title="Revenue / Spread / Pipeline" columns={COLS.newInput} rows={newInputRows} onClose={() => setOpenModal(null)} />
      )}
    </>
  );
}
