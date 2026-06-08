import { useState, useEffect } from 'react';
import LiveTile from './components/LiveTile';
import DrillDownModal from './components/DrillDownModal';
import { getExecutiveWeekly } from '../../../lib/api';

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US');
}
function fmtCurrency(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
function fmtSignedNum(n) {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '0';
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US')}`;
}
function fmtSignedCurrency(n) {
  if (n === null || n === undefined) return '—';
  const abs = `$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (n === 0) return abs;
  return `${n > 0 ? '+' : '−'}${abs}`;
}
function tileState(loading, value) {
  if (loading) return 'loading';
  if (value === null || value === undefined) return 'error';
  return 'ready';
}

const COLS = {
  headcount: [
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'client', label: 'Client' },
    { key: 'empType', label: 'Type' },
    { key: 'dateBegin', label: 'Begin', format: 'date' },
    { key: 'dateEnd', label: 'End', format: 'date' },
  ],
  newReqs: [
    { key: 'jobId', label: 'Job ID' },
    { key: 'title', label: 'Title' },
    { key: 'client', label: 'Client' },
    { key: 'owner', label: 'Owner' },
    { key: 'openings', label: 'Openings', align: 'num' },
  ],
  newPlacements: [
    { key: 'placementId', label: 'Placement ID' },
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'client', label: 'Client' },
    { key: 'dateBegin', label: 'Begin', format: 'date' },
  ],
  offers: [
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job' },
    { key: 'client', label: 'Client' },
    { key: 'date', label: 'Date', format: 'date' },
  ],
  spread: [
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'client', label: 'Client' },
    { key: 'empType', label: 'Type' },
    { key: 'spread', label: 'Weekly Spread', format: 'currency', align: 'num' },
  ],
  clientSubs: [
    { key: 'candidate', label: 'Candidate' },
    { key: 'client', label: 'Client' },
    { key: 'recruiter', label: 'Recruiter' },
    { key: 'date', label: 'Date', format: 'date' },
  ],
  attrition: [
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'client', label: 'Client' },
    { key: 'empType', label: 'Type' },
    { key: 'dateEnd', label: 'Ended', format: 'date' },
  ],
};

export default function WeeklyTab({ startDate, endDate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getExecutiveWeekly(startDate, endDate)
      .catch(() => null)
      .then((weekly) => {
        if (cancelled) return;
        setData(weekly);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  // 1. Headcount change
  const hc = data?.headcount;
  const headcountDelta = hc?.delta ?? null;
  const headcountRows = hc?.details || [];
  const headcountSub = hc
    ? `${fmtNum(hc.current)} now · ${fmtNum(hc.priorWeek)} prior week`
    : 'Active contractors vs prior week';

  // 2. New reqs (firm-wide)
  const newReqs = data?.newReqs?.count ?? null;
  const newReqsRows = data?.newReqs?.details || [];

  // 3. New placements (firm-wide)
  const newPlacements = data?.newPlacements?.count ?? null;
  const newPlacementsRows = data?.newPlacements?.details || [];

  // 4. Offers extended
  const offersExtended = data?.offersExtended?.count ?? null;
  const offersRows = data?.offersExtended?.details || [];

  // 5. Spread change vs prior week
  const sp = data?.spread;
  const spreadDelta = sp?.delta ?? null;
  const spreadRows = sp?.details || [];
  const spreadSub = sp
    ? `${fmtCurrency(sp.current)} now · ${fmtCurrency(sp.priorWeek)} prior${sp.feesMissingCount ? ` · ${sp.feesMissingCount} est.` : ''}`
    : 'Weekly spread vs prior week';

  // 6. Client submissions (firm-wide)
  const clientSubs = data?.clientSubmissions?.count ?? null;
  const clientSubRows = data?.clientSubmissions?.details || [];

  // 7. Attrition — placements that ended in range
  const attrition = data?.attrition?.count ?? null;
  const attritionRows = data?.attrition?.details || [];

  return (
    <>
      <div className="exec-kpi-grid">
        <LiveTile
          label="Headcount Change"
          value={fmtSignedNum(headcountDelta)}
          subtitle={headcountSub}
          state={tileState(loading, headcountDelta)}
          clickable={headcountRows.length > 0}
          onClick={() => setOpenModal('headcount')}
        />
        <LiveTile
          label="New Reqs / Jobs"
          value={fmtNum(newReqs)}
          subtitle="Jobs added in range (firm-wide)"
          state={tileState(loading, newReqs)}
          clickable={newReqsRows.length > 0}
          onClick={() => setOpenModal('newReqs')}
        />
        <LiveTile
          label="New Placements"
          value={fmtNum(newPlacements)}
          subtitle="Placements starting in range (firm-wide)"
          state={tileState(loading, newPlacements)}
          clickable={newPlacementsRows.length > 0}
          onClick={() => setOpenModal('newPlacements')}
        />
        <LiveTile
          label="Offers Extended"
          value={fmtNum(offersExtended)}
          subtitle="Candidates in Offer Extended"
          state={tileState(loading, offersExtended)}
          clickable={offersRows.length > 0}
          onClick={() => setOpenModal('offers')}
        />
        <LiveTile
          label="Spread Change vs Prior Week"
          value={fmtSignedCurrency(spreadDelta)}
          subtitle={spreadSub}
          state={tileState(loading, spreadDelta)}
          clickable={spreadRows.length > 0}
          onClick={() => setOpenModal('spread')}
        />
        <LiveTile
          label="Client Submissions"
          value={fmtNum(clientSubs)}
          subtitle="Sendouts in range (firm-wide)"
          state={tileState(loading, clientSubs)}
          clickable={clientSubRows.length > 0}
          onClick={() => setOpenModal('clientSubs')}
        />
        <LiveTile
          label="Attrition"
          value={fmtNum(attrition)}
          subtitle="Placements ended in range"
          state={tileState(loading, attrition)}
          clickable={attritionRows.length > 0}
          onClick={() => setOpenModal('attrition')}
        />
      </div>

      {openModal === 'headcount' && (
        <DrillDownModal title="Active Contractors" columns={COLS.headcount} rows={headcountRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'newReqs' && (
        <DrillDownModal title="New Reqs / Jobs" columns={COLS.newReqs} rows={newReqsRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'newPlacements' && (
        <DrillDownModal title="New Placements" columns={COLS.newPlacements} rows={newPlacementsRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'offers' && (
        <DrillDownModal title="Offers Extended" columns={COLS.offers} rows={offersRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'spread' && (
        <DrillDownModal title="Weekly Spread — Active Contractors" columns={COLS.spread} rows={spreadRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'clientSubs' && (
        <DrillDownModal title="Client Submissions" columns={COLS.clientSubs} rows={clientSubRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'attrition' && (
        <DrillDownModal title="Attrition — Placements Ended" columns={COLS.attrition} rows={attritionRows} onClose={() => setOpenModal(null)} />
      )}
    </>
  );
}
