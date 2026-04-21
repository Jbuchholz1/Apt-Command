import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './reporting.css';
import { getRecruiterDashboard, exportRecruiterDashboard } from '../../lib/api';
import DateRangePicker from './components/DateRangePicker';
import DashboardFilters from './components/DashboardFilters';
import TeamAlerts from './components/TeamAlerts';
import MetricsTable from './components/MetricsTable';
import InputVsGoalsChart from './components/InputVsGoalsChart';
import GoalPointsChart from './components/GoalPointsChart';
import LeadsSubmittedChart from './components/LeadsSubmittedChart';
import DetailTable from './components/DetailTable';
import { exportNodeToPdf } from './lib/pdfExport';

function getDefaultDates() {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  return {
    start: sunday.toISOString().slice(0, 10),
    end: today.toISOString().slice(0, 10),
  };
}

const INTERVIEW_COLS = [
  { key: 'recruiter', label: 'Recruiter' },
  { key: 'dateAdded', label: 'Date Added' },
  { key: 'jobId', label: 'Job ID', bhEntity: 'JobOrder' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'candidateId', label: 'Candidate ID', bhEntity: 'Candidate' },
  { key: 'candidateName', label: 'Name' },
];

const CLIENT_SUBS_COLS = [
  { key: 'submittedBy', label: 'Submitted By' },
  { key: 'jobId', label: 'Job ID', bhEntity: 'JobOrder' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'dateAdded', label: 'Date Added' },
  { key: 'companyName', label: 'Company' },
  { key: 'candidateId', label: 'Candidate ID', bhEntity: 'Candidate' },
  { key: 'candidateName', label: 'Candidate Name' },
];

const STARTS_COLS = [
  { key: 'recruiter', label: 'Recruiter' },
  { key: 'placementId', label: 'Placement ID', bhEntity: 'Placement' },
  { key: 'client', label: 'Client' },
  { key: 'candidateId', label: 'Candidate ID', bhEntity: 'Candidate' },
  { key: 'candidateName', label: 'Candidate Name' },
  { key: 'guarantee', label: 'Guarantee' },
  { key: 'date', label: 'Date' },
];

const NEW_INPUT_COLS = [
  { key: 'recruiter', label: 'Recruiter' },
  { key: 'placementId', label: 'Placement ID', bhEntity: 'Placement' },
  { key: 'employeeType', label: 'Employee Type' },
  { key: 'candidateName', label: 'Candidate Name' },
  { key: 'startDate', label: 'Start Date' },
  { key: 'scheduledEnd', label: 'Scheduled End' },
  { key: 'daysBetween', label: 'Days Between' },
  { key: 'guarantee', label: 'Guarantee' },
  { key: 'newInput', label: 'New Input', format: 'currency' },
];

export default function RecruiterDashboard() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ recruiters: [], clients: [] });
  const [exportingPdf, setExportingPdf] = useState(false);
  const exportRef = useRef(null);

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    try {
      setExportingPdf(true);
      const fname = `Recruiter_Dashboard_${startDate}_${endDate}.pdf`;
      await exportNodeToPdf(exportRef.current, fname, {
        title: 'Recruiter Dashboard',
        subtitle: formatRange(),
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF: ' + err.message);
    } finally {
      setExportingPdf(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getRecruiterDashboard(startDate, endDate);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derive filter options from data
  const recruiterOptions = useMemo(() => {
    if (!data) return [];
    return data.recruiters.map(r => r.name).sort();
  }, [data]);

  const clientOptions = useMemo(() => {
    if (!data?.details) return [];
    const clients = new Set();
    data.details.clientSubs.forEach(s => s.companyName && clients.add(s.companyName));
    data.details.starts.forEach(s => s.client && clients.add(s.client));
    data.details.newInput.forEach(s => s.client && clients.add(s.client));
    return [...clients].sort();
  }, [data]);

  // Apply filters
  const filtered = useMemo(() => {
    if (!data) return null;
    const rf = filters.recruiters;
    const cf = filters.clients;
    const hasRF = rf.length > 0;
    const hasCF = cf.length > 0;

    if (!hasRF && !hasCF) return data;

    const matchR = (name) => !hasRF || rf.includes(name);
    const matchC = (company) => !hasCF || cf.includes(company);

    const recruiters = data.recruiters.filter(r => matchR(r.name));

    const totals = { clientSubs: 0, interviews: 0, starts: 0, mar: 0, newInput: 0 };
    recruiters.forEach(r => {
      totals.clientSubs += r.metrics.clientSubs;
      totals.interviews += r.metrics.interviews;
      totals.starts += r.metrics.starts;
      totals.mar += r.metrics.mar;
      totals.newInput += r.metrics.newInput;
    });

    const filterDetail = (arr, recruiterField, clientField) => {
      return arr.filter(row => {
        if (hasRF && !rf.includes(row[recruiterField])) return false;
        if (hasCF && clientField && !matchC(row[clientField])) return false;
        return true;
      });
    };

    return {
      ...data,
      recruiters,
      totals,
      details: {
        interviews: filterDetail(data.details.interviews, 'recruiter', null),
        clientSubs: filterDetail(data.details.clientSubs, 'submittedBy', 'companyName'),
        starts: filterDetail(data.details.starts, 'recruiter', 'client'),
        newInput: filterDetail(data.details.newInput, 'recruiter', 'client'),
        leads: filterDetail(data.details.leads || [], 'recruiter', null),
      },
    };
  }, [data, filters]);

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
          <h2 className="toolbar-title">Recruiter Dashboard</h2>
          <span className="toolbar-date-range">{formatRange()}</span>
        </div>
        <div className="toolbar-right">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />
          <button className="export-btn" onClick={() => exportRecruiterDashboard(startDate, endDate)}>Export Excel</button>
          <button className="export-btn" onClick={handleExportPdf} disabled={exportingPdf || !data}>
            {exportingPdf ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div ref={exportRef}>
      {data && (
        <DashboardFilters
          filters={filters}
          onChange={setFilters}
          recruiterOptions={recruiterOptions}
          clientOptions={clientOptions}
        />
      )}

      {error && (
        <div className="error-banner">
          Failed to load data: {error}
          <button onClick={fetchData}>Retry</button>
        </div>
      )}

      {loading && !data && (
        <div className="reporting-loading">
          <div className="skeleton-shimmer skeleton-row" style={{ width: '60%' }}></div>
          <div style={{ display: 'flex', gap: 20, padding: '16px 24px' }}>
            <div className="skeleton-shimmer" style={{ flex: 1, height: 320, borderRadius: 8 }}></div>
            <div className="skeleton-shimmer" style={{ flex: 1, height: 320, borderRadius: 8 }}></div>
          </div>
          <div className="skeleton-shimmer skeleton-table"></div>
        </div>
      )}

      {filtered && (
        <>
          <MetricsTable recruiters={filtered.recruiters} totals={filtered.totals} />
          <div className="charts-row">
            <InputVsGoalsChart recruiters={filtered.recruiters} startDate={startDate} endDate={endDate} />
            <GoalPointsChart recruiters={filtered.recruiters} startDate={startDate} endDate={endDate} weeklyTarget={26} />
          </div>
          <div style={{ padding: '0 24px 24px' }}>
            <LeadsSubmittedChart recruiters={filtered.recruiters} />
          </div>
          <DetailTable title="Interviews" columns={INTERVIEW_COLS} data={filtered.details.interviews} />
          <DetailTable title="Client Submissions" columns={CLIENT_SUBS_COLS} data={filtered.details.clientSubs} />
          <DetailTable title="Starts" columns={STARTS_COLS} data={filtered.details.starts} />
          <DetailTable title="New Input" columns={NEW_INPUT_COLS} data={filtered.details.newInput} />
          <TeamAlerts team="recruiting" forceExpanded={exportingPdf} />
        </>
      )}
      </div>
    </div>
  );
}
