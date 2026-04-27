import { useState, useEffect } from 'react';
import LiveTile from './components/LiveTile';
import PlaceholderTile from './components/PlaceholderTile';
import DrillDownModal from './components/DrillDownModal';
import { getExecutiveMonthly } from '../../../lib/api';

function fmtCurrency(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US');
}
function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${n}%`;
}
function fmtNet(n) {
  if (n === null || n === undefined) return '—';
  return `${n > 0 ? '+' : ''}${n}`;
}
function tileState(loading, value) {
  if (loading) return 'loading';
  if (value === null || value === undefined) return 'error';
  return 'ready';
}

const COLS = {
  netHires: [
    { key: 'type', label: 'Type' },
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job/Target' },
    { key: 'client', label: 'Client' },
    { key: 'date', label: 'Date', format: 'date' },
  ],
  activeClients: [
    { key: 'name', label: 'Client' },
    { key: 'placementCount', label: 'Active Placements', align: 'num' },
  ],
  newClients: [
    { key: 'name', label: 'Client' },
    { key: 'reqCount', label: 'New Reqs', align: 'num' },
    { key: 'firstReqDate', label: 'First Req', format: 'date' },
  ],
  retention: [
    { key: 'name', label: 'Client' },
    { key: 'retained', label: 'Still Active' },
  ],
  offboards: [
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'client', label: 'Client' },
    { key: 'empType', label: 'Type' },
    { key: 'dateEnd', label: 'End Date', format: 'date' },
  ],
  ytdGp: [
    { key: 'candidate', label: 'Candidate' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'client', label: 'Client' },
    { key: 'dateBegin', label: 'Begin', format: 'date' },
    { key: 'input', label: 'Input', format: 'currency2', align: 'num' },
  ],
};

export default function MonthlyTab({ startDate, endDate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getExecutiveMonthly(startDate, endDate)
      .catch(() => null)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const newClients = data?.newClients?.count ?? null;
  const newClientsRows = data?.newClients?.details || [];
  const activeClients = data?.activeClients?.count ?? null;
  const activeClientsRows = data?.activeClients?.details || [];
  const headcount = data?.headcountForecast?.active ?? null;
  const offboards = data?.headcountForecast?.offboards30d ?? null;
  const offboardRows = data?.headcountForecast?.offboardDetails || [];
  const ytdGp = data?.ytdGp?.value ?? null;
  const ytdRangeStart = data?.ytdGp?.rangeStart;
  const ytdRows = data?.ytdGp?.details || [];
  const newHires = data?.netHires?.newHires ?? null;
  const attrition = data?.netHires?.attrition ?? null;
  const netHires = data?.netHires?.net ?? null;
  const netHiresRows = data?.netHires?.details || [];
  const retentionRate = data?.retention?.rate ?? null;
  const retentionPriorClients = data?.retention?.priorPeriodClients ?? null;
  const retentionRetained = data?.retention?.retainedClients ?? null;
  const retentionRows = data?.retention?.details || [];

  return (
    <>
      <div className="exec-kpi-grid">
        <PlaceholderTile label="Gross Revenue (USD)" note="Pending accounting integration" />
        <PlaceholderTile label="Net Revenue / Gross Margin" note="Pending accounting + payroll integration" />
        <PlaceholderTile label="Accounts Receivable Aging" note="Pending accounting integration" />
        <LiveTile
          label="New Hires vs Attrition (Net)"
          value={fmtNet(netHires)}
          subtitle={newHires != null ? `${newHires} hired · ${attrition} attrition` : 'Net change in date range'}
          state={tileState(loading, netHires)}
          clickable={netHiresRows.length > 0}
          onClick={() => setOpenModal('netHires')}
        />
        <LiveTile
          label="Active Clients"
          value={fmtNum(activeClients)}
          subtitle="Distinct clients with active placements"
          state={tileState(loading, activeClients)}
          clickable={activeClientsRows.length > 0}
          onClick={() => setOpenModal('activeClients')}
        />
        <LiveTile
          label="New Clients Onboarded"
          value={fmtNum(newClients)}
          subtitle="Distinct clients with new reqs in range"
          state={tileState(loading, newClients)}
          clickable={newClientsRows.length > 0}
          onClick={() => setOpenModal('newClients')}
        />
        <LiveTile
          label="Client Retention Rate"
          value={fmtPct(retentionRate)}
          subtitle={retentionPriorClients != null ? `${retentionRetained}/${retentionPriorClients} retained from prior period` : 'Period over period'}
          state={tileState(loading, retentionRate)}
          clickable={retentionRows.length > 0}
          onClick={() => setOpenModal('retention')}
        />
        <PlaceholderTile label="Payroll & Benefits Cost" note="Pending HR/payroll integration (ADP/Gusto)" />
        <PlaceholderTile label="Compliance & Legal Updates" note="Pending compliance system integration" />
        <PlaceholderTile label="P&L Statement" note="Pending accounting integration" />
        <PlaceholderTile label="GP vs Budget / Earnout Tracker" note="Pending accounting + budget setup" />
        <LiveTile
          label="Contractor Headcount + Off-boards Next Month"
          value={fmtNum(headcount)}
          subtitle={offboards != null ? `${offboards} placements ending in next 30 days` : 'Active count'}
          state={tileState(loading, headcount)}
          clickable={offboardRows.length > 0}
          onClick={() => setOpenModal('offboards')}
        />
        <LiveTile
          label="YTD New Input"
          value={fmtCurrency(ytdGp)}
          subtitle={ytdRangeStart ? `${ytdRangeStart} → today` : 'Year to date'}
          state={tileState(loading, ytdGp)}
          clickable={ytdRows.length > 0}
          onClick={() => setOpenModal('ytdGp')}
        />
        <PlaceholderTile label="Cost-Saving Potential" note="Pending vendor benchmark data" />
      </div>

      {openModal === 'netHires' && (
        <DrillDownModal title="New Hires vs Attrition" columns={COLS.netHires} rows={netHiresRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'activeClients' && (
        <DrillDownModal title="Active Clients" columns={COLS.activeClients} rows={activeClientsRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'newClients' && (
        <DrillDownModal title="New Clients Onboarded" columns={COLS.newClients} rows={newClientsRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'retention' && (
        <DrillDownModal title="Client Retention — Prior Period Cohort" columns={COLS.retention} rows={retentionRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'offboards' && (
        <DrillDownModal title="Off-boards Next 30 Days" columns={COLS.offboards} rows={offboardRows} onClose={() => setOpenModal(null)} />
      )}
      {openModal === 'ytdGp' && (
        <DrillDownModal title="YTD New Input" columns={COLS.ytdGp} rows={ytdRows} onClose={() => setOpenModal(null)} />
      )}
    </>
  );
}
