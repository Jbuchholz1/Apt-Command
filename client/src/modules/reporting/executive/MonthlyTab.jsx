import { useState, useEffect } from 'react';
import LiveTile from './components/LiveTile';
import PlaceholderTile from './components/PlaceholderTile';
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

export default function MonthlyTab({ startDate, endDate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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
  const activeClients = data?.activeClients?.count ?? null;
  const headcount = data?.headcountForecast?.active ?? null;
  const offboards = data?.headcountForecast?.offboards30d ?? null;
  const ytdGp = data?.ytdGp?.value ?? null;
  const ytdRangeStart = data?.ytdGp?.rangeStart;
  const newHires = data?.netHires?.newHires ?? null;
  const attrition = data?.netHires?.attrition ?? null;
  const netHires = data?.netHires?.net ?? null;
  const retentionRate = data?.retention?.rate ?? null;
  const retentionPriorClients = data?.retention?.priorPeriodClients ?? null;
  const retentionRetained = data?.retention?.retainedClients ?? null;

  return (
    <div className="exec-kpi-grid">
      <PlaceholderTile label="Gross Revenue (USD)" note="Pending accounting integration" />
      <PlaceholderTile label="Net Revenue / Gross Margin" note="Pending accounting + payroll integration" />
      <PlaceholderTile label="Accounts Receivable Aging" note="Pending accounting integration" />
      <LiveTile
        label="New Hires vs Attrition (Net)"
        value={fmtNet(netHires)}
        subtitle={newHires != null ? `${newHires} hired · ${attrition} attrition` : 'Net change in date range'}
        state={tileState(loading, netHires)}
      />
      <LiveTile
        label="Active Clients"
        value={fmtNum(activeClients)}
        subtitle="Distinct clients with active placements"
        state={tileState(loading, activeClients)}
      />
      <LiveTile
        label="New Clients Onboarded"
        value={fmtNum(newClients)}
        subtitle="Distinct clients with new reqs in range"
        state={tileState(loading, newClients)}
      />
      <LiveTile
        label="Client Retention Rate"
        value={fmtPct(retentionRate)}
        subtitle={retentionPriorClients != null ? `${retentionRetained}/${retentionPriorClients} retained from prior period` : 'Period over period'}
        state={tileState(loading, retentionRate)}
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
      />
      <LiveTile
        label="YTD New Input"
        value={fmtCurrency(ytdGp)}
        subtitle={ytdRangeStart ? `${ytdRangeStart} → today` : 'Year to date'}
        state={tileState(loading, ytdGp)}
      />
      <PlaceholderTile label="Cost-Saving Potential" note="Pending vendor benchmark data" />
    </div>
  );
}
