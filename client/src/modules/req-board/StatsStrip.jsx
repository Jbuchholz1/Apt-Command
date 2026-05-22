import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getPlacements, getOfferOutCandidates, updateJobInBullhorn, updateJobOverrides, getOpportunities, updateOpportunityInBullhorn, updateSubmissionInBullhorn, updatePlacementInBullhorn } from '../../lib/api';
import { useUserLookups } from '../../lib/useUserLookups';
import { saveWithToast } from '../../lib/saveWithToast';
import { getFollowUpUrgency } from './lib/urgency';
import EditableDate from './EditableDate';
import EditableSelect from './EditableSelect';
import EditableCell from './EditableCell';

const TYPE_OPTIONS = [
  'Direct Hire', 'Contract', 'Contract To Hire', 'Project',
].map(s => ({ value: s, label: s }));

const TYPE_ABBREV = {
  'Contract': 'CON',
  'Direct Hire': 'DR',
  'Contract To Hire': 'C2H',
  'Project': 'SOW',
};

const REMOTE_OPTIONS = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'Hybrid', label: 'Hybrid' },
];

const STATUS_OPTIONS = [
  'Accepting Candidates', 'Covered', 'Offer Out', 'Placed', 'Filled', 'Lost', 'Wash', 'Archive',
].map(s => ({ value: s, label: s }));

// JobSubmission status options for the On The Board modal's per-candidate
// status edit. Mirrors the SUBMISSION_STATUS_OPTIONS in JobDetail.jsx.
const SUB_STATUS_OPTIONS = [
  'Client Submission', 'Internally Submitted', 'Candidate Interested',
  'Phone Interview', 'Interview Scheduled', 'In Person Interview',
  'Second Interview', 'Final Interview', 'Interview Feedback',
  'Client Feedback', 'Offer Extended', 'Backout', 'Placed',
].map(s => ({ value: s, label: s }));

// Terminal/closed statuses — excluded from all alert and rollup counters
const CLOSED_STATUSES = new Set(['Archive', 'Placed', 'Lost', 'Wash', 'Filled']);

function ContractorMultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const display = selected.length === 0 ? `All ${label}s` : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <div className="contractor-multiselect" ref={ref}>
      <label style={{ fontWeight: 600, fontSize: '13px', marginRight: 4 }}>{label}:</label>
      <button className="contractor-filter-btn" onClick={() => setOpen(!open)}>
        {display} <span style={{ float: 'right', marginLeft: 6 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="contractor-multiselect-dropdown">
          {options.map(opt => (
            <label key={opt} className="contractor-multiselect-option">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              {opt}
            </label>
          ))}
          {selected.length > 0 && (
            <button className="contractor-multiselect-clear" onClick={() => onChange([])}>Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

// Inline editor for the On the Board "PrBr/Salary LH" cell. Writes to the
// underlying placement (Pending/Submitted) or submission (Offer Extended)
// record rather than the JobOrder, so per-candidate negotiated rates land
// on the right entity in Bullhorn.
function EditableRates({ job, cand, onSave, fallbackClick }) {
  const isDirectHire = job.employmentType === 'Direct Hire';
  const [editing, setEditing] = useState(false);
  const [pay, setPay] = useState('');
  const [bill, setBill] = useState('');
  const [salary, setSalary] = useState('');
  const firstInputRef = useRef(null);
  const blurTimerRef = useRef(null);

  useEffect(() => {
    if (editing) {
      setPay(job.payRate != null ? String(job.payRate) : '');
      setBill(job.billRate != null ? String(job.billRate) : '');
      setSalary(job.salary != null ? String(job.salary) : '');
      const t = setTimeout(() => {
        firstInputRef.current?.focus();
        firstInputRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editing, job.payRate, job.billRate, job.salary]);

  const targetId = cand.placementId || cand.submissionId;
  const editable = !!targetId;

  const commit = () => {
    setEditing(false);
    if (isDirectHire) {
      const s = parseFloat(salary);
      if (Number.isNaN(s) || s === (job.salary || 0)) return;
      onSave({ salary: s });
    } else {
      const p = parseFloat(pay);
      const b = parseFloat(bill);
      if (Number.isNaN(p) || Number.isNaN(b)) return;
      if (p === (job.payRate || 0) && b === (job.billRate || 0)) return;
      onSave({ payRate: p, billRate: b });
    }
  };

  // Use a deferred blur so clicking between the two inputs doesn't fire commit.
  const handleBlur = () => {
    blurTimerRef.current = setTimeout(commit, 100);
  };
  const cancelBlur = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = null;
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { setEditing(false); }
  };

  if (editing) {
    return (
      <td className="cell-money" onClick={e => e.stopPropagation()}>
        {isDirectHire ? (
          <input
            ref={firstInputRef}
            type="number"
            step="0.01"
            value={salary}
            onChange={e => setSalary(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKey}
            style={{ width: '90px', padding: '2px 4px', fontSize: '13px' }}
          />
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            <span>$</span>
            <input
              ref={firstInputRef}
              type="number"
              step="0.01"
              value={pay}
              onChange={e => setPay(e.target.value)}
              onBlur={handleBlur}
              onFocus={cancelBlur}
              onKeyDown={handleKey}
              style={{ width: '55px', padding: '2px 4px', fontSize: '13px' }}
            />
            <span>/$</span>
            <input
              type="number"
              step="0.01"
              value={bill}
              onChange={e => setBill(e.target.value)}
              onBlur={handleBlur}
              onFocus={cancelBlur}
              onKeyDown={handleKey}
              style={{ width: '55px', padding: '2px 4px', fontSize: '13px' }}
            />
          </span>
        )}
      </td>
    );
  }

  const title = editable
    ? `Click to edit ${cand.placementId ? 'placement' : 'submission'} rates for ${cand.name}`
    : 'Click to edit PrBr / Salary in the job detail panel';

  return (
    <td
      className="cell-money cell-prbr-clickable"
      title={title}
      style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
      onClick={(e) => {
        e.stopPropagation();
        if (editable) setEditing(true);
        else if (fallbackClick) fallbackClick();
      }}
    >
      {job.brSalary || '—'}
    </td>
  );
}

export default function StatsStrip({ stats, jobs, loading, onJobUpdated, onSelectJob, hideOpportunities = false, indiaMode = false, placements: placementsProp = null }) {
  const [showContractors, setShowContractors] = useState(false);
  const [showCE, setShowCE] = useState(false);
  const [showPerm, setShowPerm] = useState(false);
  const [showMissedFollowUps, setShowMissedFollowUps] = useState(false);
  const [showFilled, setShowFilled] = useState(false);
  const [showAB, setShowAB] = useState(false);
  const [showC, setShowC] = useState(false);
  const [showCalledShots, setShowCalledShots] = useState(false);
  const [csOwnerFilter, setCsOwnerFilter] = useState([]);
  const [csTrFilter, setCsTrFilter] = useState([]);
  const [csSort, setCsSort] = useState({ key: 'id', dir: 'desc' });
  const [showAccepting, setShowAccepting] = useState(false);
  const [placements, setPlacements] = useState([]);
  const [placementsLoading, setPlacementsLoading] = useState(false);
  const [contractorSort, setContractorSort] = useState({ key: 'candidate', dir: 'asc' });
  const [contractorAmFilter, setContractorAmFilter] = useState([]);
  const [contractorTrFilter, setContractorTrFilter] = useState([]);
  const [contractorTypeFilter, setContractorTypeFilter] = useState([]);
  const [showOpportunities, setShowOpportunities] = useState(false);
  const [opportunities, setOpportunities] = useState([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);
  const { recruiters } = useUserLookups();
  const [oppOwnerFilter, setOppOwnerFilter] = useState('');
  const [oppSort, setOppSort] = useState({ key: 'id', dir: 'desc' });
  const [accOwnerFilter, setAccOwnerFilter] = useState('');
  const [accSort, setAccSort] = useState({ key: 'id', dir: 'desc' });
  const [abOwnerFilter, setAbOwnerFilter] = useState('');
  const [abSort, setAbSort] = useState({ key: 'id', dir: 'desc' });
  const [cOwnerFilter, setCOwnerFilter] = useState('');
  const [cSort, setCSort] = useState({ key: 'id', dir: 'desc' });
  const [filledOwnerFilter, setFilledOwnerFilter] = useState('');
  const [filledSort, setFilledSort] = useState({ key: 'id', dir: 'desc' });
  const [ceSort, setCeSort] = useState({ key: 'id', dir: 'desc' });
  const [permSort, setPermSort] = useState({ key: 'id', dir: 'desc' });
  const [missedSort, setMissedSort] = useState({ key: 'id', dir: 'desc' });

  // Keep the On The Board rows fresh: load on mount and re-load whenever the
  // parent refreshes jobs (auto-refresh ticks every 5 min). Rows are
  // self-contained (server hydrates the job payload), so this counter is
  // independent of the board's current filter/visibility state.
  useEffect(() => {
    let cancelled = false;
    getOfferOutCandidates()
      .then(res => { if (!cancelled) setFilledRows(res.data || []); })
      .catch(err => console.error('Failed to load offer-out candidates:', err));
    return () => { cancelled = true; };
  }, [jobs]);

  // Compute stats from jobs array
  const acceptingCandidates = stats?.acceptingCandidates ?? 0;
  const activeContractors = stats?.activeContractors ?? 0;
  const filledCount = stats?.filled ?? 0;
  const totalOpportunities = stats?.totalOpportunities ?? 0;

  // Accepting candidates jobs
  const acceptingJobs = (jobs || []).filter(j => j.status === 'Accepting Candidates');

  // Missed follow-ups: no follow-up + past-due follow-ups (red urgency).
  // Exclude closed-status jobs — they don't need follow-up.
  const missedFollowUpJobs = (jobs || []).filter(j =>
    !CLOSED_STATUSES.has(j.status) && getFollowUpUrgency(j.followUp) === 'red'
  );

  // On The Board: candidates in the offer / pending-placement pipeline. Includes:
  //   1. JobSubmission.status = 'Offer Extended' (offer pending acceptance)
  //   2. Placement.status = 'Pending' (offer accepted, awaiting final approval)
  // Source of truth is filledRows from the server, NOT JobOrder.status or the
  // board's visible jobs array — so candidates don't disappear when their job
  // falls off the board, and board filters don't shrink the count.
  // Row shape: { job: <formatted+overrides>, cand: { id, name, submissionId,
  // submissionStatus, placementId, placementStatus, source } }.
  const [filledRows, setFilledRows] = useState([]);
  const totalOfferExtended = filledRows.length;
  const missedFollowUps = missedFollowUpJobs.length;

  // Called Shots — jobs with one or more shots called in overrides
  const calledShotJobs = (jobs || []).filter(j => (j.calledShotCount || 0) > 0);

  // Total spread across Called Shots: weekly CE spread + perm fee × count.
  // ceSpread/permFee are per-opening (see server/routes/jobs.js:1072-1084),
  // so a 2-shot call on a $1,200 spread job contributes $2,400.
  const calledShotSpreadTotal = calledShotJobs.reduce(
    (sum, j) => sum + (j.calledShotCount || 0) * ((j.ceSpread || 0) + (j.permFee || 0)),
    0
  );

  // Called Shots: owner + TR options, sort, filter
  const csOwners = useMemo(() => {
    const set = new Set();
    calledShotJobs.forEach(j => { if (j.owner) set.add(j.owner); });
    return [...set].sort();
  }, [calledShotJobs]);

  const csTRs = useMemo(() => {
    const set = new Set();
    calledShotJobs.forEach(j => { if (j.recruiter) set.add(j.recruiter); });
    return [...set].sort();
  }, [calledShotJobs]);

  const handleCsSort = (key) => {
    setCsSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const csSortIcon = (key) => {
    if (csSort.key !== key) return ' \u2195';
    return csSort.dir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const filteredCalledShots = useMemo(() => {
    let result = calledShotJobs;
    if (csOwnerFilter.length > 0) result = result.filter(j => csOwnerFilter.includes(j.owner));
    if (csTrFilter.length > 0) result = result.filter(j => csTrFilter.includes(j.recruiter));
    // Attach per-job spread so the column can both display and sort on it.
    const arr = result.map(j => ({
      ...j,
      csSpread: (j.calledShotCount || 0) * ((j.ceSpread || 0) + (j.permFee || 0)),
    }));
    arr.sort((a, b) => {
      let av = a[csSort.key];
      let bv = b[csSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return csSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return csSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [calledShotJobs, csOwnerFilter, csTrFilter, csSort]);

  // A + B reqs combined: covered = has an assigned TR. Closed jobs are excluded.
  const abReqs = (jobs || []).filter(j =>
    !CLOSED_STATUSES.has(j.status) && (j.priority === 'A' || j.priority === 'B')
  );
  const abTotal = abReqs.length;
  const abCovered = abReqs.filter(j => { const r = (j.recruiter || '').trim(); return r && r !== '*'; }).length;

  // C reqs only. Closed jobs are excluded.
  const cReqs = (jobs || []).filter(j =>
    !CLOSED_STATUSES.has(j.status) && j.priority === 'C'
  );
  const cReqCount = cReqs.length;

  // Potential Spread: Accepting Candidates or Filled jobs with a ceSpread value
  const ceJobs = (jobs || []).filter(j => j.ceSpread && (j.status === 'Accepting Candidates' || j.status === 'Filled') && (j.priority === 'A' || j.priority === 'B'));
  const totalCE = ceJobs.reduce((sum, j) => sum + j.ceSpread, 0);

  // Perm jobs: Accepting Candidates or Filled with a permFee value
  const permJobs = (jobs || []).filter(j => j.permFee && (j.status === 'Accepting Candidates' || j.status === 'Filled'));
  const totalPerm = permJobs.reduce((sum, j) => sum + j.permFee, 0);

  const fmtCurrency = (val) => `$${Math.round(val).toLocaleString('en-US')}`;

  // Opportunities: owner filter + sortable columns
  const oppOwners = useMemo(() => {
    const set = new Set();
    opportunities.forEach(o => { if (o.owner) set.add(o.owner); });
    return [...set].sort();
  }, [opportunities]);

  const handleOppSort = (key) => {
    setOppSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const oppSortIcon = (key) => {
    if (oppSort.key !== key) return ' ↕';
    return oppSort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  const filteredOpps = useMemo(() => {
    let result = opportunities;
    if (oppOwnerFilter) {
      result = result.filter(o => o.owner === oppOwnerFilter);
    }
    const arr = [...result];
    arr.sort((a, b) => {
      let av = a[oppSort.key];
      let bv = b[oppSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return oppSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return oppSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [opportunities, oppOwnerFilter, oppSort]);

  // Accepting Candidates: owner filter + sortable columns
  const accOwners = useMemo(() => {
    const set = new Set();
    acceptingJobs.forEach(j => { if (j.owner) set.add(j.owner); });
    return [...set].sort();
  }, [acceptingJobs]);

  const handleAccSort = (key) => {
    setAccSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const accSortIcon = (key) => {
    if (accSort.key !== key) return ' ↕';
    return accSort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  const filteredAccepting = useMemo(() => {
    let result = acceptingJobs;
    if (accOwnerFilter) {
      result = result.filter(j => j.owner === accOwnerFilter);
    }
    const arr = [...result];
    arr.sort((a, b) => {
      let av = a[accSort.key];
      let bv = b[accSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return accSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return accSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [acceptingJobs, accOwnerFilter, accSort]);

  const handleRemoteSave = async (job, rawValue) => {
    try {
      await updateJobInBullhorn(job.id, { customText1: rawValue });
      if (onJobUpdated) onJobUpdated(job.id, 'remote', rawValue);
    } catch (err) {
      console.error('Failed to update remote:', err);
    }
  };

  const handleStatusSave = async (job, rawValue) => {
    try {
      await updateJobInBullhorn(job.id, { status: rawValue });
      if (onJobUpdated) onJobUpdated(job.id, 'status', rawValue);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // A/B Reqs: owner filter + sortable columns
  const abOwners = useMemo(() => {
    const set = new Set();
    abReqs.forEach(j => { if (j.owner) set.add(j.owner); });
    return [...set].sort();
  }, [abReqs]);

  const handleAbSort = (key) => {
    setAbSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const abSortIcon = (key) => {
    if (abSort.key !== key) return ' ↕';
    return abSort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  const filteredAB = useMemo(() => {
    let result = abReqs;
    if (abOwnerFilter) {
      result = result.filter(j => j.owner === abOwnerFilter);
    }
    const arr = [...result];
    arr.sort((a, b) => {
      let av = a[abSort.key];
      let bv = b[abSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return abSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return abSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [abReqs, abOwnerFilter, abSort]);

  // C Reqs: owner filter + sortable columns
  const cOwners = useMemo(() => {
    const set = new Set();
    cReqs.forEach(j => { if (j.owner) set.add(j.owner); });
    return [...set].sort();
  }, [cReqs]);

  const handleCSort = (key) => {
    setCSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const cSortIcon = (key) => {
    if (cSort.key !== key) return ' ↕';
    return cSort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  const filteredC = useMemo(() => {
    let result = cReqs;
    if (cOwnerFilter) {
      result = result.filter(j => j.owner === cOwnerFilter);
    }
    const arr = [...result];
    arr.sort((a, b) => {
      let av = a[cSort.key];
      let bv = b[cSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return cSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return cSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [cReqs, cOwnerFilter, cSort]);

  const handleFilledClick = async () => {
    setFilledOwnerFilter('');
    setShowFilled(true);
    // Defensive refresh on open so the modal is current between auto-refresh ticks.
    try {
      const res = await getOfferOutCandidates();
      setFilledRows(res.data || []);
    } catch (err) {
      console.error('Failed to load offer-out candidates:', err);
    }
  };

  const filledOwners = useMemo(() => {
    const set = new Set();
    filledRows.forEach(r => { if (r.job?.owner) set.add(r.job.owner); });
    return [...set].sort();
  }, [filledRows]);

  const handleFilledSort = (key) => {
    setFilledSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const filledSortIcon = (key) => {
    if (filledSort.key !== key) return ' ↕';
    return filledSort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  // One row per candidate (each row is already {job, cand} from the server).
  const filteredFilled = useMemo(() => {
    let rows = filledRows;
    if (filledOwnerFilter) {
      rows = rows.filter(r => r.job?.owner === filledOwnerFilter);
    }
    rows = [...rows];
    rows.sort((a, b) => {
      const candKeys = { candidate: 'name', candidateStatus: 'submissionStatus' };
      const candField = candKeys[filledSort.key];
      let av = candField ? a.cand[candField] : a.job[filledSort.key];
      let bv = candField ? b.cand[candField] : b.job[filledSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return filledSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return filledSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filledRows, filledOwnerFilter, filledSort]);

  // Sum of weekly CE spread + perm fee across visible (filtered) On The Board rows.
  // Server delivers each row's ceSpread/permFee as the per-candidate amount —
  // placement/submission rates when set, else job rates ÷ numOpenings — so the
  // sum is a straight reduce without any per-row division here.
  const filledSpreadTotal = useMemo(
    () => filteredFilled.reduce((sum, r) => sum + (r.job.ceSpread || 0) + (r.job.permFee || 0), 0),
    [filteredFilled]
  );

  // CE Spread sorting
  const handleCeSort = (key) => {
    setCeSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const ceSortIcon = (key) => {
    if (ceSort.key !== key) return ' ↕';
    return ceSort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  const sortedCeJobs = useMemo(() => {
    const arr = [...ceJobs];
    arr.sort((a, b) => {
      let av = a[ceSort.key];
      let bv = b[ceSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return ceSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return ceSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [ceJobs, ceSort]);

  // Perm Spread sorting
  const handlePermSort = (key) => {
    setPermSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const permSortIcon = (key) => {
    if (permSort.key !== key) return ' ↕';
    return permSort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  const sortedPermJobs = useMemo(() => {
    const arr = [...permJobs];
    arr.sort((a, b) => {
      let av = a[permSort.key];
      let bv = b[permSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return permSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return permSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [permJobs, permSort]);

  // Missed Follow Ups sorting
  const handleMissedSort = (key) => {
    setMissedSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const missedSortIcon = (key) => {
    if (missedSort.key !== key) return ' ↕';
    return missedSort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  const sortedMissedFollowUps = useMemo(() => {
    const arr = [...missedFollowUpJobs];
    arr.sort((a, b) => {
      let av = a[missedSort.key];
      let bv = b[missedSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return missedSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return missedSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [missedFollowUpJobs, missedSort]);

  const handleContractorsClick = async () => {
    setShowContractors(true);
    setPlacementsLoading(true);
    setContractorAmFilter([]);
    setContractorTrFilter([]);
    setContractorTypeFilter([]);
    setContractorSort({ key: 'candidate', dir: 'asc' });
    try {
      const res = await getPlacements();
      setPlacements(res.data || []);
    } catch (err) {
      console.error('Failed to load placements:', err);
    } finally {
      setPlacementsLoading(false);
    }
  };

  const contractorAMs = useMemo(() => {
    const set = new Set();
    placements.forEach(p => { if (p.am) set.add(p.am); });
    return [...set].sort();
  }, [placements]);

  const contractorTRs = useMemo(() => {
    const set = new Set();
    placements.forEach(p => { if (p.tr) set.add(p.tr); });
    return [...set].sort();
  }, [placements]);

  const contractorTypes = useMemo(() => {
    const set = new Set();
    placements.forEach(p => { if (p.employmentType) set.add(p.employmentType); });
    return [...set].sort();
  }, [placements]);

  const handleContractorSort = (key) => {
    setContractorSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const contractorSortIcon = (key) => {
    if (contractorSort.key !== key) return ' \u2195';
    return contractorSort.dir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const filteredPlacements = useMemo(() => {
    let result = placements;
    if (contractorAmFilter.length > 0) {
      result = result.filter(p => contractorAmFilter.includes(p.am));
    }
    if (contractorTrFilter.length > 0) {
      result = result.filter(p => contractorTrFilter.includes(p.tr));
    }
    if (contractorTypeFilter.length > 0) {
      result = result.filter(p => contractorTypeFilter.includes(p.employmentType));
    }
    const arr = [...result];
    // (spread sum uses this filtered list — computed in memo below)
    arr.sort((a, b) => {
      let av = a[contractorSort.key];
      let bv = b[contractorSort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return contractorSort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return contractorSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [placements, contractorAmFilter, contractorTrFilter, contractorTypeFilter, contractorSort]);

  // Sum of weekly spread: contractors use (BillRate - PayRate×1.25) × 40;
  // Direct Hire placements add amortized perm fee = (Salary × Fee) / 26
  // (canonical divisor matches formatJob() in server/routes/jobs.js).
  // Sabatical contractors still appear in the list but don't count toward
  // the total since they aren't actively billing.
  const filteredSpreadTotal = useMemo(() => {
    return filteredPlacements.reduce((sum, p) => {
      if (p.status === 'Sabatical') return sum;
      if (p.employmentType === 'Direct Hire') {
        if (!p.salary || !p.fee) return sum;
        const perm = Math.round((p.salary * p.fee) / 26);
        return sum + perm;
      }
      if (!p.billRate || !p.payRate) return sum;
      const spread = Math.round((p.payRate * 1.25 - p.billRate) * 40 * -1);
      return sum + spread;
    }, 0);
  }, [filteredPlacements]);

  const handleOpportunitiesClick = async () => {
    setShowOpportunities(true);
    setOpportunitiesLoading(true);
    setOppOwnerFilter('');
    setOppSort({ key: 'id', dir: 'desc' });
    try {
      const res = await getOpportunities();
      setOpportunities(res.data || []);
    } catch (err) {
      console.error('Failed to load opportunities:', err);
    } finally {
      setOpportunitiesLoading(false);
    }
  };

  // Edit dates on the Placement record directly (dateBegin/dateEnd) instead of
  // proxying through the JobOrder's startDate/estimatedEndDate. Writing to the
  // job worked once but the next refetch read the unchanged Placement back,
  // so the edit visibly reverted. Match by placement.id, not by row index —
  // filteredPlacements sorts/filters, so the row's index doesn't line up with
  // the unfiltered placements array and edits would land on the wrong record.
  const handlePlacementDateSave = async (placement, field, tsValue) => {
    if (!placement || !placement.id) return;
    const previousValue = placement[field];
    setPlacements(prev => prev.map(pl =>
      pl.id === placement.id ? { ...pl, [field]: tsValue ? new Date(tsValue).toISOString() : null } : pl
    ));
    await saveWithToast(
      () => updatePlacementInBullhorn(placement.id, { [field]: tsValue }),
      {
        failureMessage: 'Could not update placement date',
        onRollback: () => {
          setPlacements(prev => prev.map(pl =>
            pl.id === placement.id ? { ...pl, [field]: previousValue } : pl
          ));
        },
      },
    );
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

  const handleTypeSave = async (job, rawValue) => {
    try {
      await updateJobInBullhorn(job.id, { employmentType: rawValue });
      if (onJobUpdated) onJobUpdated(job.id, 'employmentType', rawValue);
    } catch (err) {
      console.error('Failed to update employment type:', err);
    }
  };

  const handleStartDateSave = async (job, tsValue) => {
    try {
      await updateJobInBullhorn(job.id, { startDate: tsValue });
      if (onJobUpdated) onJobUpdated(job.id, 'startDate', tsValue ? new Date(tsValue).toISOString() : null);
    } catch (err) {
      console.error('Failed to update start date:', err);
    }
  };

  // Update the candidate's JobSubmission status from inside the On The Board modal.
  // If the new status moves the candidate out of the offer pipeline (anything
  // other than 'Offer Extended' or 'Placed'), optimistically remove the row so
  // it disappears immediately rather than waiting for the next refresh. 'Placed'
  // is kept because Bullhorn typically creates a Pending Placement on that
  // transition, which means the candidate should stay visible until the
  // placement is approved.
  // Save per-candidate rates from the On the Board modal. Routes to the
  // placement record when the row is backed by one (Pending/Submitted), else
  // to the submission record (Offer Extended). The displayed ceSpread and
  // brSalary are recomputed optimistically with the same multipliers the
  // server uses, so the row updates in-frame.
  const handleRatesSave = async (job, cand, fields) => {
    const isPlacement = !!cand.placementId;
    const targetId = isPlacement ? cand.placementId : cand.submissionId;
    if (!targetId) return;

    const matchRow = (r) => isPlacement
      ? r.cand.placementId === cand.placementId
      : r.cand.submissionId === cand.submissionId;
    const prevJobSnapshot = { ...job };
    const prevCandSnapshot = { ...cand };

    const newPay = fields.payRate != null ? fields.payRate : job.payRate;
    const newBill = fields.billRate != null ? fields.billRate : job.billRate;
    const newSalary = fields.salary != null ? fields.salary : job.salary;
    const empType = (job.employmentType || '').toLowerCase();
    const isDirectHire = empType === 'direct hire';
    const multiplier = empType === 'corp-to-corp' ? 1.05 : 1.25;

    let newBrSalary = null;
    if (isDirectHire) {
      if ((newSalary || 0) > 0) newBrSalary = `$${Number(newSalary).toLocaleString('en-US')}`;
    } else if ((newPay || 0) > 0 && (newBill || 0) > 0) {
      newBrSalary = `$${newPay}/$${newBill}`;
    }

    let newCe = null;
    if ((newPay || 0) > 1 && (newBill || 0) > 1) {
      const ce = Math.round((newBill - newPay * multiplier) * 40 * 100) / 100;
      newCe = ce > 0 ? ce : null;
    }

    setFilledRows(prev => prev.map(r => matchRow(r)
      ? {
          ...r,
          job: { ...r.job, payRate: newPay, billRate: newBill, salary: newSalary, brSalary: newBrSalary, ceSpread: newCe },
          cand: { ...r.cand, recordPayRate: newPay, recordBillRate: newBill, recordSalary: newSalary },
        }
      : r,
    ));

    const payload = {};
    if (isPlacement) {
      if (fields.payRate != null) payload.payRate = fields.payRate;
      if (fields.billRate != null) payload.clientBillRate = fields.billRate;
      if (fields.salary != null) payload.salary = fields.salary;
    } else {
      if (fields.payRate != null) payload.payRate = fields.payRate;
      if (fields.billRate != null) payload.billRate = fields.billRate;
      if (fields.salary != null) payload.salary = fields.salary;
    }

    await saveWithToast(
      () => isPlacement
        ? updatePlacementInBullhorn(targetId, payload)
        : updateSubmissionInBullhorn(targetId, payload),
      {
        failureMessage: 'Could not update candidate rates',
        onRollback: () => {
          setFilledRows(prev => prev.map(r => matchRow(r)
            ? { ...r, job: prevJobSnapshot, cand: prevCandSnapshot }
            : r,
          ));
        },
      },
    );
  };

  const handleCandStatusSave = async (job, cand, newStatus) => {
    if (!cand?.submissionId) return;
    const previousStatus = cand.submissionStatus;
    const keepsRow = newStatus === 'Offer Extended' || newStatus === 'Placed';

    setFilledRows(prev => {
      const idx = prev.findIndex(r => r.cand.submissionId === cand.submissionId);
      if (idx === -1) return prev;
      if (keepsRow) {
        const next = prev.slice();
        next[idx] = { ...next[idx], cand: { ...next[idx].cand, submissionStatus: newStatus } };
        return next;
      }
      return prev.filter((_, i) => i !== idx);
    });

    await saveWithToast(
      () => updateSubmissionInBullhorn(cand.submissionId, { status: newStatus }),
      {
        failureMessage: 'Could not update candidate status',
        onRollback: () => {
          setFilledRows(prev => {
            const idx = prev.findIndex(r => r.cand.submissionId === cand.submissionId);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = { ...next[idx], cand: { ...next[idx].cand, submissionStatus: previousStatus } };
              return next;
            }
            // Row was removed optimistically — put it back.
            return [...prev, { job, cand: { ...cand, submissionStatus: previousStatus } }];
          });
        },
      },
    );
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

  // India Req Board funnel counters. Strict 'Client Submission' status only
  // (not the full client-pipeline `clientSubs` used by the # CS column).
  // Interviews use the same status set as the JobDetail Interviews section.
  // Placements are sourced from the parent's already-loaded firm-wide
  // placements array and filtered to India jobs by jobOrderId.
  const indiaJobIds = useMemo(() => new Set((jobs || []).map(j => j.id)), [jobs]);
  const indiaTotalClientSubs = useMemo(
    () => (jobs || []).reduce((s, j) => s + (j.clientSubsStrict || 0), 0),
    [jobs],
  );
  const indiaTotalInterviews = useMemo(
    () => (jobs || []).reduce((s, j) => s + (j.interviewSubs || 0), 0),
    [jobs],
  );
  const indiaTotalPlacements = useMemo(() => {
    if (!Array.isArray(placementsProp)) return 0;
    return placementsProp.filter(p => p?.jobOrderId && indiaJobIds.has(p.jobOrderId)).length;
  }, [placementsProp, indiaJobIds]);

  const items = indiaMode ? [
    { label: 'Accepting Candidates', value: acceptingCandidates, color: '#16a34a', onClick: () => { setAccOwnerFilter(''); setAccSort({ key: 'id', dir: 'desc' }); setShowAccepting(true); } },
    { label: 'Missed Follow Ups', value: missedFollowUps, color: '#dc2626', onClick: () => setShowMissedFollowUps(true) },
    { label: 'Total Client Submissions', value: indiaTotalClientSubs, color: '#2563eb', tooltip: "Sum of candidates currently in 'Client Submission' status across all India reqs." },
    { label: 'Total Interviews', value: indiaTotalInterviews, color: '#7c3aed', tooltip: "Sum of candidates in 'Interview Scheduled' or 'Interview Feedback' across all India reqs." },
    { label: 'Total Placements', value: indiaTotalPlacements, color: '#0d9488', tooltip: 'Active contractors currently placed on India reqs.' },
  ] : [
    { label: 'Accepting Candidates', value: acceptingCandidates, color: '#16a34a', onClick: () => { setAccOwnerFilter(''); setAccSort({ key: 'id', dir: 'desc' }); setShowAccepting(true); } },
    { label: 'Missed Follow Ups', value: missedFollowUps, color: '#dc2626', onClick: () => setShowMissedFollowUps(true) },
    { label: 'A/B Covered', value: `${abCovered} / ${abTotal}`, color: '#c9a227', onClick: () => { setAbOwnerFilter(''); setAbSort({ key: 'id', dir: 'desc' }); setShowAB(true); } },
    { label: 'C Reqs', value: cReqCount, color: '#94a3b8', onClick: () => { setCOwnerFilter(''); setCSort({ key: 'id', dir: 'desc' }); setShowC(true); } },
    { label: 'On The Board', value: totalOfferExtended, color: '#7c3aed', tooltip: 'Candidates in Offer Extended or with a Pending placement awaiting approval. Counts firm-wide regardless of board filters.', onClick: handleFilledClick },
    { label: 'Called Shots', value: fmtCurrency(calledShotSpreadTotal), color: '#ea580c', tooltip: `Total spread across ${calledShotJobs.length} Called Shot job(s): (weekly CE spread + perm fee) × # of shots called per job. Click to see the list.`, onClick: () => { setCsOwnerFilter([]); setCsTrFilter([]); setCsSort({ key: 'id', dir: 'desc' }); setShowCalledShots(true); } },
    // Opportunities is hidden on the India Req Board — opportunities are
    // pre-job and don't have an apt_india concept, so showing firm-wide
    // numbers there would be misleading.
    ...(hideOpportunities ? [] : [{ label: 'Opportunities', value: totalOpportunities, color: '#0369a1', onClick: handleOpportunitiesClick }]),
    { label: 'Active Contractors', value: activeContractors, color: '#0d9488', onClick: handleContractorsClick },
    { label: 'Potential CE Spread', value: fmtCurrency(totalCE), color: '#2563eb', onClick: () => setShowCE(true), tooltip: 'W2: (Bill Rate - Pay Rate × 1.25) × 40 | C2C: (Bill Rate - Pay Rate × 1.05) × 40 | A/B priority, Accepting Candidates & Filled jobs only' },
    { label: 'Potential Perm Spread', value: fmtCurrency(totalPerm), color: '#9333ea', onClick: () => setShowPerm(true), tooltip: '(Salary Low × Fee %) ÷ 26 for Accepting Candidates & Filled jobs' },
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
              <h2>Active Contractors ({filteredPlacements.length}{(contractorAmFilter.length || contractorTrFilter.length || contractorTypeFilter.length) ? ` of ${placements.length}` : ''})</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0d9488' }}>
                    Total Spread: {fmtCurrency(filteredSpreadTotal)}/wk
                    <span className="stat-tooltip-wrap stat-tooltip-below">
                      <span className="stat-tooltip-icon">&#9432;</span>
                      <span className="stat-tooltip-text">
                        Contract: (Pay Rate × 1.25 − Bill Rate) × 40 × −1. Direct Hire: (Salary × Fee %) ÷ 26. Sum of all visible (filtered) contractors.
                      </span>
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626' }}>
                    Total spread does not factor in VMS or Referral Fees
                  </div>
                </div>
                <button className="modal-close" onClick={() => setShowContractors(false)}>✕</button>
              </div>
            </div>
            {placementsLoading ? (
              <div className="modal-loading">Loading contractors...</div>
            ) : (
              <>
                <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <ContractorMultiSelect label="AM" options={contractorAMs} selected={contractorAmFilter} onChange={setContractorAmFilter} />
                  <ContractorMultiSelect label="TR" options={contractorTRs} selected={contractorTrFilter} onChange={setContractorTrFilter} />
                  <ContractorMultiSelect label="Type" options={contractorTypes} selected={contractorTypeFilter} onChange={setContractorTypeFilter} />
                </div>
                <table className="contractors-table">
                  <thead>
                    <tr>
                      {[
                        { key: 'candidate', label: 'Contractor' },
                        { key: 'jobTitle', label: 'Job Title' },
                        { key: 'am', label: 'AM' },
                        { key: 'tr', label: 'TR' },
                        { key: 'employmentType', label: 'Type' },
                        { key: 'dateBegin', label: 'Start' },
                        { key: 'dateEnd', label: 'End' },
                        { key: 'spread', label: 'Spread' },
                        { key: 'status', label: 'Status' },
                      ].map(col => (
                        <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => handleContractorSort(col.key)}>
                          {col.label}<span className="sort-icon">{contractorSortIcon(col.key)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlacements.map((p, idx) => (
                      <tr key={p.id} style={p.status === 'Sabatical' ? { opacity: 0.5, color: '#6b7280' } : undefined}>
                        <td>
                          {p.id ? (
                            <a
                              href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=Placement&id=${p.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bh-link"
                            >
                              {p.candidate || '—'}
                            </a>
                          ) : (p.candidate || '—')}
                        </td>
                        <td>{p.jobTitle || '—'}</td>
                        <td>{p.am || '—'}</td>
                        <td>{p.tr || '—'}</td>
                        <td>{p.employmentType || '—'}</td>
                        <td className="cell-date">
                          {p.dateBegin
                            ? new Date(p.dateBegin).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
                            : '—'}
                        </td>
                        <EditableDate
                          value={p.dateEnd}
                          onSave={(val) => handlePlacementDateSave(p, 'dateEnd', val)}
                          className={`cell-editable cell-date${p.dateEnd && new Date(p.dateEnd) < new Date() ? ' cell-date-expired' : ''}`}
                        />
                        <td className="cell-money">
                          {p.employmentType === 'Direct Hire'
                            ? (p.salary && p.fee
                              ? `$${Math.round(p.salary * p.fee / 26).toLocaleString('en-US')} Perm`
                              : '—')
                            : (p.billRate && p.payRate
                              ? `$${Math.round(((p.payRate * 1.25 - p.billRate) * 40 * -1)).toLocaleString('en-US')} CE`
                              : '—')}
                        </td>
                        <td>{p.status || '—'}</td>
                      </tr>
                    ))}
                    {filteredPlacements.length === 0 && (
                      <tr><td colSpan="9" style={{ textAlign: 'center', padding: '20px' }}>No active contractors found</td></tr>
                    )}
                  </tbody>
                </table>
              </>
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
                  {[
                    { key: 'id', label: 'Req#' },
                    { key: 'title', label: 'Job Title' },
                    { key: 'client', label: 'Client' },
                    { key: 'owner', label: 'Owner' },
                    { key: 'payRate', label: 'Pay Rate' },
                    { key: 'billRate', label: 'Bill Rate' },
                    { key: 'ceSpread', label: 'CE $' },
                  ].map(col => (
                    <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => handleCeSort(col.key)}>
                      {col.label}<span className="sort-icon">{ceSortIcon(col.key)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCeJobs.map(j => (
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
                  {[
                    { key: 'id', label: 'Req#' },
                    { key: 'title', label: 'Job Title' },
                    { key: 'client', label: 'Client' },
                    { key: 'owner', label: 'Owner' },
                    { key: 'salary', label: 'Salary' },
                    { key: 'feePercent', label: 'Fee %' },
                    { key: 'permFee', label: 'Perm $' },
                  ].map(col => (
                    <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => handlePermSort(col.key)}>
                      {col.label}<span className="sort-icon">{permSortIcon(col.key)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPermJobs.map(j => (
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
              <h2>Open Opportunities ({filteredOpps.length}{oppOwnerFilter ? ` of ${opportunities.length}` : ''})</h2>
              <button className="modal-close" onClick={() => setShowOpportunities(false)}>✕</button>
            </div>
            <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontWeight: 600, fontSize: '13px' }}>Owner:</label>
              <select
                value={oppOwnerFilter}
                onChange={e => setOppOwnerFilter(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              >
                <option value="">All</option>
                {oppOwners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {opportunitiesLoading ? (
              <div className="modal-loading">Loading opportunities...</div>
            ) : (
              <table className="contractors-table">
                <thead>
                  <tr>
                    {[
                      { key: 'id', label: 'ID' },
                      { key: 'title', label: 'Title' },
                      { key: 'client', label: 'Client' },
                      { key: 'owner', label: 'Owner' },
                      { key: 'status', label: 'Status' },
                      { key: 'expectedCloseDate', label: 'Exp Close' },
                      { key: 'dealValue', label: 'Deal Value' },
                      { key: 'weightedDealValue', label: 'Weighted' },
                    ].map(col => (
                      <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => handleOppSort(col.key)}>
                        {col.label}<span className="sort-icon">{oppSortIcon(col.key)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOpps.map(o => (
                    <tr key={o.id}>
                      <td><a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=Opportunity&id=${o.id}`} target="_blank" rel="noopener noreferrer" className="bh-link">{o.id}</a></td>
                      <td>{o.title || '—'}</td>
                      <td>{o.client || '—'}</td>
                      <td>{o.owner || '—'}</td>
                      <EditableSelect
                        value={o.status || ''}
                        options={[
                          { value: 'Open', label: 'Open' },
                          { value: 'Qualifying', label: 'Qualifying' },
                          { value: 'Negotiating', label: 'Negotiating' },
                          { value: 'Closed-Won', label: 'Closed-Won' },
                          { value: 'Closed-Lost', label: 'Closed-Lost' },
                        ]}
                        onSave={async (newStatus) => {
                          try {
                            await updateOpportunityInBullhorn(o.id, { status: newStatus });
                            setOpportunities(prev => prev.map(op =>
                              op.id === o.id ? { ...op, status: newStatus } : op
                            ));
                          } catch (err) {
                            console.error('Failed to update opportunity status:', err);
                          }
                        }}
                      />
                      <EditableDate
                        value={o.expectedCloseDate}
                        onSave={async (tsValue) => {
                          try {
                            await updateOpportunityInBullhorn(o.id, { expectedCloseDate: tsValue });
                            setOpportunities(prev => prev.map(op =>
                              op.id === o.id ? { ...op, expectedCloseDate: tsValue ? new Date(tsValue).toISOString() : null } : op
                            ));
                          } catch (err) {
                            console.error('Failed to update expected close date:', err);
                          }
                        }}
                      />
                      <td className="cell-money">{o.dealValue ? fmtCurrency(o.dealValue) : '—'}</td>
                      <td className="cell-money">{o.weightedDealValue ? fmtCurrency(o.weightedDealValue) : '—'}</td>
                    </tr>
                  ))}
                  {filteredOpps.length > 0 && (
                    <tr className="total-row">
                      <td colSpan="6" style={{ textAlign: 'right', fontWeight: 700 }}>Totals</td>
                      <td className="cell-money" style={{ fontWeight: 700 }}>{fmtCurrency(filteredOpps.reduce((s, o) => s + (o.dealValue || 0), 0))}</td>
                      <td className="cell-money" style={{ fontWeight: 700 }}>{fmtCurrency(filteredOpps.reduce((s, o) => s + (o.weightedDealValue || 0), 0))}</td>
                    </tr>
                  )}
                  {filteredOpps.length === 0 && (
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
                  {[
                    { key: 'id', label: 'Req#' },
                    { key: 'title', label: 'Job Title' },
                    { key: 'client', label: 'Client' },
                    { key: 'status', label: 'Status' },
                    { key: 'owner', label: 'Owner' },
                    { key: 'recruiter', label: 'TR' },
                    { key: 'followUp', label: 'Follow Up' },
                  ].map(col => (
                    <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => handleMissedSort(col.key)}>
                      {col.label}<span className="sort-icon">{missedSortIcon(col.key)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedMissedFollowUps.map(j => (
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
      {showFilled && createPortal(
        <div className="modal-overlay" onClick={() => setShowFilled(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>On The Board ({filteredFilled.length}{filledOwnerFilter ? ` of ${totalOfferExtended}` : ''})</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: 'auto' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#7c3aed' }}>
                  Total Spread: {fmtCurrency(filledSpreadTotal)}/wk
                  <span className="stat-tooltip-wrap stat-tooltip-below">
                    <span className="stat-tooltip-icon">&#9432;</span>
                    <span className="stat-tooltip-text">
                      Sum of weekly CE spread + perm fee across all candidates shown.
                    </span>
                  </span>
                </div>
                <button className="modal-close" onClick={() => setShowFilled(false)}>✕</button>
              </div>
            </div>
            <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontWeight: 600, fontSize: '13px' }}>Owner:</label>
              <select
                value={filledOwnerFilter}
                onChange={e => setFilledOwnerFilter(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              >
                <option value="">All</option>
                {filledOwners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <table className="contractors-table">
              <thead>
                <tr>
                  {[
                    { key: 'id', label: 'Req#' },
                    { key: 'title', label: 'Job Title' },
                    { key: 'client', label: 'Client' },
                    { key: 'candidate', label: 'Candidate' },
                    { key: 'owner', label: 'Owner' },
                    { key: 'status', label: 'Status' },
                    { key: 'recruiter', label: 'TR' },
                    { key: 'employmentType', label: 'Type' },
                    { key: 'startDate', label: 'Start' },
                    { key: 'brSalary', label: 'PrBr/Salary LH' },
                    { key: 'ceSpread', label: 'CE $' },
                    { key: 'permFee', label: 'Perm $' },
                    { key: 'candidateStatus', label: 'Cand Status' },
                  ].map(col => (
                    <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => handleFilledSort(col.key)}>
                      {col.label}<span className="sort-icon">{filledSortIcon(col.key)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredFilled.map(({ job: j, cand }) => (
                  <tr key={`${j.id}-${cand.id ?? cand.name}`}>
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
                    <td>{cand.name || '—'}</td>
                    <td>{j.owner || '—'}</td>
                    <EditableSelect
                      value={j.status || ''}
                      displayValue={j.status || '—'}
                      options={STATUS_OPTIONS}
                      onSave={(val) => handleStatusSave(j, val)}
                      className="cell-editable"
                    />
                    {renderTrCell(j)}
                    <EditableSelect
                      value={j.employmentType || ''}
                      displayValue={TYPE_ABBREV[j.employmentType] || j.employmentType || '—'}
                      options={TYPE_OPTIONS}
                      onSave={(val) => handleTypeSave(j, val)}
                      className="cell-editable"
                    />
                    <EditableDate
                      value={j.startDate}
                      onSave={(val) => handleStartDateSave(j, val)}
                      className="cell-editable cell-date"
                    />
                    <EditableRates
                      job={j}
                      cand={cand}
                      onSave={(fields) => handleRatesSave(j, cand, fields)}
                      fallbackClick={onSelectJob ? () => { setShowFilled(false); onSelectJob(j.id); } : null}
                    />
                    <td className="cell-money">{j.ceSpread ? fmtCurrency(j.ceSpread) : '—'}</td>
                    <td className="cell-money">{j.permFee ? fmtCurrency(j.permFee) : '—'}</td>
                    {cand.submissionId ? (
                      <EditableSelect
                        value={cand.submissionStatus || ''}
                        displayValue={cand.submissionStatus || '—'}
                        options={SUB_STATUS_OPTIONS}
                        onSave={(val) => handleCandStatusSave(j, cand, val)}
                        className="cell-editable"
                      />
                    ) : (
                      <td>{cand.placementStatus ? `Placed (${cand.placementStatus})` : '—'}</td>
                    )}
                  </tr>
                ))}
                {filteredFilled.length === 0 && (
                  <tr><td colSpan="13" style={{ textAlign: 'center', padding: '20px' }}>No candidates on the board</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>,
        document.body
      )}

      {/* A & B Reqs Modal */}
      {showAB && (
        <div className="modal-overlay" onClick={() => setShowAB(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>A & B Reqs ({filteredAB.length}{abOwnerFilter ? ` of ${abTotal}` : ''}) — {abCovered} Covered</h2>
              <button className="modal-close" onClick={() => setShowAB(false)}>✕</button>
            </div>
            <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontWeight: 600, fontSize: '13px' }}>Owner:</label>
              <select
                value={abOwnerFilter}
                onChange={e => setAbOwnerFilter(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              >
                <option value="">All</option>
                {abOwners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <table className="contractors-table">
              <thead>
                <tr>
                  {[
                    { key: 'priority', label: 'Pri' },
                    { key: 'id', label: 'Req#' },
                    { key: 'title', label: 'Job Title' },
                    { key: 'client', label: 'Client' },
                    { key: 'status', label: 'Status' },
                    { key: 'owner', label: 'Owner' },
                    { key: 'recruiter', label: 'TR' },
                    { key: 'employmentType', label: 'Type' },
                  ].map(col => (
                    <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => handleAbSort(col.key)}>
                      {col.label}<span className="sort-icon">{abSortIcon(col.key)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAB.map(j => (
                  <tr key={j.id}>
                    <td><span style={{ fontWeight: 700, color: j.priority === 'A' ? '#16a34a' : '#eab308' }}>{j.priority}</span></td>
                    <td>
                      <a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${j.id}`} target="_blank" rel="noopener noreferrer" className="bh-link">{j.id}</a>
                    </td>
                    <td>{j.title || '—'}</td>
                    <td>{j.client || '—'}</td>
                    <EditableSelect
                      value={j.status || ''}
                      displayValue={j.status || '—'}
                      options={STATUS_OPTIONS}
                      onSave={(val) => handleStatusSave(j, val)}
                      className="cell-editable"
                    />
                    <td>{j.owner || '—'}</td>
                    {renderTrCell(j)}
                    <EditableSelect
                      value={j.employmentType || ''}
                      displayValue={TYPE_ABBREV[j.employmentType] || j.employmentType || '—'}
                      options={TYPE_OPTIONS}
                      onSave={(val) => handleTypeSave(j, val)}
                      className="cell-editable"
                    />
                  </tr>
                ))}
                {filteredAB.length === 0 && (
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
              <h2>C Reqs ({filteredC.length}{cOwnerFilter ? ` of ${cReqCount}` : ''})</h2>
              <button className="modal-close" onClick={() => setShowC(false)}>✕</button>
            </div>
            <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontWeight: 600, fontSize: '13px' }}>Owner:</label>
              <select
                value={cOwnerFilter}
                onChange={e => setCOwnerFilter(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              >
                <option value="">All</option>
                {cOwners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <table className="contractors-table">
              <thead>
                <tr>
                  {[
                    { key: 'id', label: 'Req#' },
                    { key: 'title', label: 'Job Title' },
                    { key: 'client', label: 'Client' },
                    { key: 'status', label: 'Status' },
                    { key: 'owner', label: 'Owner' },
                    { key: 'recruiter', label: 'TR' },
                    { key: 'employmentType', label: 'Type' },
                  ].map(col => (
                    <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => handleCSort(col.key)}>
                      {col.label}<span className="sort-icon">{cSortIcon(col.key)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredC.map(j => (
                  <tr key={j.id}>
                    <td>
                      <a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${j.id}`} target="_blank" rel="noopener noreferrer" className="bh-link">{j.id}</a>
                    </td>
                    <td>{j.title || '—'}</td>
                    <td>{j.client || '—'}</td>
                    <EditableSelect
                      value={j.status || ''}
                      displayValue={j.status || '—'}
                      options={STATUS_OPTIONS}
                      onSave={(val) => handleStatusSave(j, val)}
                      className="cell-editable"
                    />
                    <td>{j.owner || '—'}</td>
                    {renderTrCell(j)}
                    <EditableSelect
                      value={j.employmentType || ''}
                      displayValue={TYPE_ABBREV[j.employmentType] || j.employmentType || '—'}
                      options={TYPE_OPTIONS}
                      onSave={(val) => handleTypeSave(j, val)}
                      className="cell-editable"
                    />
                  </tr>
                ))}
                {filteredC.length === 0 && (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>No C reqs</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Called Shots Modal */}
      {showCalledShots && (
        <div className="modal-overlay" onClick={() => setShowCalledShots(false)}>
          <div className="modal-content contractors-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Called Shots ({filteredCalledShots.length}{(csOwnerFilter.length || csTrFilter.length) ? ` of ${calledShotJobs.length}` : ''})</h2>
              <button className="modal-close" onClick={() => setShowCalledShots(false)}>✕</button>
            </div>
            <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <ContractorMultiSelect label="Owner" options={csOwners} selected={csOwnerFilter} onChange={setCsOwnerFilter} />
              <ContractorMultiSelect label="TR" options={csTRs} selected={csTrFilter} onChange={setCsTrFilter} />
            </div>
            <table className="contractors-table">
              <thead>
                <tr>
                  {[
                    { key: 'id', label: 'Req#' },
                    { key: 'title', label: 'Job Title' },
                    { key: 'client', label: 'Client' },
                    { key: 'status', label: 'Status' },
                    { key: 'owner', label: 'Owner' },
                    { key: 'recruiter', label: 'TR' },
                    { key: 'employmentType', label: 'Type' },
                    { key: 'calledShotCount', label: '# Shots' },
                    { key: 'csSpread', label: 'Spread' },
                    { key: 'notes', label: 'Notes' },
                  ].map(col => (
                    <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => handleCsSort(col.key)}>
                      {col.label}<span className="sort-icon">{csSortIcon(col.key)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCalledShots.map(j => (
                  <tr key={j.id}>
                    <td><a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${j.id}`} target="_blank" rel="noopener noreferrer" className="bh-link">{j.id}</a></td>
                    <td>{j.title || '—'}</td>
                    <td>{j.client || '—'}</td>
                    <EditableSelect
                      value={j.status || ''}
                      displayValue={j.status || '—'}
                      options={STATUS_OPTIONS}
                      onSave={(val) => handleStatusSave(j, val)}
                      className="cell-editable"
                    />
                    <td>{j.owner || '—'}</td>
                    {renderTrCell(j)}
                    <EditableSelect
                      value={j.employmentType || ''}
                      displayValue={TYPE_ABBREV[j.employmentType] || j.employmentType || '—'}
                      options={TYPE_OPTIONS}
                      onSave={(val) => handleTypeSave(j, val)}
                      className="cell-editable"
                    />
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{j.calledShotCount || 0}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{j.csSpread > 0 ? fmtCurrency(j.csSpread) : '—'}</td>
                    <td style={{ maxWidth: '320px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: j.notes ? '#1f2937' : '#9ca3af' }} title={j.notes || ''}>{j.notes || '—'}</td>
                  </tr>
                ))}
                {filteredCalledShots.length === 0 && (
                  <tr><td colSpan="10" style={{ textAlign: 'center', padding: '20px' }}>No called shots</td></tr>
                )}
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
              <h2>Accepting Candidates ({filteredAccepting.length}{accOwnerFilter ? ` of ${acceptingJobs.length}` : ''})</h2>
              <button className="modal-close" onClick={() => setShowAccepting(false)}>✕</button>
            </div>
            <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontWeight: 600, fontSize: '13px' }}>Owner:</label>
              <select
                value={accOwnerFilter}
                onChange={e => setAccOwnerFilter(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              >
                <option value="">All</option>
                {accOwners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <table className="contractors-table">
              <thead>
                <tr>
                  {[
                    { key: 'id', label: 'Req#' },
                    { key: 'title', label: 'Job Title' },
                    { key: 'client', label: 'Client' },
                    { key: 'owner', label: 'Owner' },
                    { key: 'recruiter', label: 'TR' },
                    { key: 'employmentType', label: 'Type' },
                    { key: 'remote', label: 'Remote' },
                  ].map(col => (
                    <th key={col.key} className="sortable" style={{ cursor: 'pointer' }} onClick={() => handleAccSort(col.key)}>
                      {col.label}<span className="sort-icon">{accSortIcon(col.key)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAccepting.map(j => (
                  <tr key={j.id}>
                    <td><a href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${j.id}`} target="_blank" rel="noopener noreferrer" className="bh-link">{j.id}</a></td>
                    <td>{j.title || '—'}</td>
                    <td>{j.client || '—'}</td>
                    <td>{j.owner || '—'}</td>
                    {renderTrCell(j)}
                    <EditableSelect
                      value={j.employmentType || ''}
                      displayValue={TYPE_ABBREV[j.employmentType] || j.employmentType || '—'}
                      options={TYPE_OPTIONS}
                      onSave={(val) => handleTypeSave(j, val)}
                      className="cell-editable"
                    />
                    <EditableSelect
                      value={j.remote || ''}
                      displayValue={j.remote || '—'}
                      options={REMOTE_OPTIONS}
                      onSave={(val) => handleRemoteSave(j, val)}
                      className="cell-editable"
                    />
                  </tr>
                ))}
                {filteredAccepting.length === 0 && (
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
