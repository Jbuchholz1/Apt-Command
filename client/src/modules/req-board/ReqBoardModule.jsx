import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './req-board.css';
import { getJobs, getStats, exportJobs } from '../../lib/api';
import { useUserRole } from '../../lib/UserRoleContext';
import AccessDenied from '../../components/AccessDenied';
import StatsStrip from './StatsStrip';
import FilterBar from './FilterBar';
import ReqBoard from './ReqBoard';
import { hasRedBox } from './lib/redBox';
import JobDetail from './JobDetail';
import SplashScreen from './SplashScreen';
import { EditingContext, useEditingState } from './EditingContext';
import ConflictDialog from './ConflictDialog';
import { subscribeEventStream } from '../../lib/eventStream';

const REFRESH_INTERVAL = 20 * 1000; // 20 seconds
const REFRESH_TICK_MS = 5 * 1000;        // how often the "updated Xs ago" label ticks

function formatRelative(lastRefreshMs, nowMs) {
  if (!lastRefreshMs) return 'never';
  const secs = Math.max(0, Math.round((nowMs - lastRefreshMs) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// Filled jobs stay on the board the day they were filled, then disappear the next day.
// The "On The Board" counter and modal still show them via the unfiltered jobs array.
function isFilledAndExpired(job) {
  if (job.status !== 'Filled') return false;
  if (!job.dateLastModified) return false;
  const now = new Date();
  const centralStr = now.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
  const startOfToday = new Date(centralStr + ' 00:00:00');
  return new Date(job.dateLastModified) < startOfToday;
}

// Override-derived fields. Must match the server-side mergeOverrides() set
// in server/routes/jobs.js. When an auto-refresh response returns a job
// whose overrideVersion is older than what we already have locally, we
// preserve these fields from the existing row instead of regressing them.
// This keeps just-saved edits visible while server caches catch up.
const OVERRIDE_FIELDS = [
  'notes', 'deadline', 'followUp',
  'coverageNeeded', 'calledShot', 'fortyEightHr', 'aptIndia',
  'trReassigned', 'trAssignedAt', 'statusChangedAt',
  'overrideVersion', 'overrideUpdatedBy', 'overrideUpdatedAt',
  'recruiter',
];

function isExistingOverrideNewer(existing, incoming) {
  if (!existing) return false;
  const ev = typeof existing.overrideVersion === 'number' ? existing.overrideVersion : null;
  const iv = typeof incoming.overrideVersion === 'number' ? incoming.overrideVersion : null;
  if (ev === null) return false;       // we have no local version → can't be newer
  if (iv === null) return true;        // we have a version, server says none → stale
  return ev > iv;
}

function mergeIncomingJobs(prev, incoming) {
  if (!Array.isArray(prev) || prev.length === 0) return incoming;
  const prevMap = new Map(prev.map(j => [j.id, j]));
  return incoming.map(inc => {
    const existing = prevMap.get(inc.id);
    if (!isExistingOverrideNewer(existing, inc)) return inc;
    const merged = { ...inc };
    for (const f of OVERRIDE_FIELDS) merged[f] = existing[f];
    return merged;
  });
}

// Apply a real-time override event from the SSE stream to a single job in
// the local jobs array. Idempotent by version: if the incoming row's
// version is older than or equal to what we already have, we skip — this
// is what prevents the editor's own SSE event (a fraction of a second
// after their save response) from clobbering already-applied state.
//
// Field names map snake_case (Supabase) → camelCase (client display).
function applyOverrideRowToJob(job, row) {
  const incomingVersion = typeof row.version === 'number' ? row.version : 0;
  const localVersion = typeof job.overrideVersion === 'number' ? job.overrideVersion : 0;
  if (incomingVersion <= localVersion) return job;

  const next = {
    ...job,
    notes: row.notes || '',
    followUp: row.follow_up || '',
    deadline: row.deadline || '',
    coverageNeeded: row.coverage_needed || '',
    calledShot: row.called_shot === true || row.called_shot === 'true',
    aptIndia: row.apt_india === true || row.apt_india === 'true',
    fortyEightHr: row.forty_eight_hr || '',
    trReassigned: row.tr_reassigned === '1',
    trAssignedAt: row.tr_assigned_at || null,
    statusChangedAt: row.status_changed_at || null,
    overrideVersion: row.version,
    overrideUpdatedBy: row.updated_by || null,
    overrideUpdatedAt: row.updated_at || null,
  };
  // Only override the recruiter when it's the local-only ZZ/* sentinel —
  // a normal Bullhorn assignment shows initials we don't want to replace
  // with whatever happens to be in the override row.
  if (row.recruiter === 'ZZ' || row.recruiter === '*') {
    next.recruiter = row.recruiter;
  }
  return next;
}

// The India Req Board reuses this module with different props:
//   title="India Req Board"  apiFilter={{ apt_india: true }}  permissionKey="india_req_board"
// All other behavior is identical, so the two boards stay 1:1 by construction.
export default function ReqBoardModule({
  title = 'Req Board',
  apiFilter = null,
  permissionKey = 'req_board',
} = {}) {
  const { hasAccess, loading: roleLoading } = useUserRole();
  const [showSplash, setShowSplash] = useState(true);

  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [conflict, setConflict] = useState(null); // { jobId, field, current }
  const [filters, setFilters] = useState({
    status: [],
    employmentType: [],
    owner: [],
    recruiter: [],
    client: [],
    remote: '',
    redBoxes: '',
  });

  const { isEditing, editingRef, editingApi } = useEditingState();

  // Keep the pause predicate in a ref so the interval closure always reads
  // the latest state without being re-created (which would reset the timer).
  const selectedJobIdRef = useRef(null);
  selectedJobIdRef.current = selectedJobId;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsRes, statsRes] = await Promise.all([getJobs(apiFilter), getStats(apiFilter)]);
      // Per-job version-aware merge: if our local row has a newer override
      // version than the incoming one (e.g. the server's caches haven't
      // caught up to a save we just made), preserve the local override
      // fields instead of regressing them. Bullhorn-derived fields still
      // come from the incoming row.
      setJobs(prev => mergeIncomingJobs(prev, jobsRes.data || []));
      setStats(statsRes);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Skip the auto-refresh while the user is actively editing a cell or
      // has the job detail panel open — we don't want to clobber an in-flight
      // draft or interrupt a focused task. The manual Refresh button still
      // works in both states.
      if (editingRef.current > 0) return;
      if (selectedJobIdRef.current) return;
      fetchData();
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData, editingRef]);

  // Real-time push: subscribe to the server's SSE stream of override + note
  // changes. Peers' edits land in our jobs array within ~500ms of being
  // saved, instead of waiting on the 20s poll. The poll stays as a safety
  // net for Bullhorn-only fields (status, owner, AM, etc.) and for catching
  // up after a transient disconnect.
  useEffect(() => {
    const unsubscribe = subscribeEventStream('/api/req-board/jobs/events', {
      onMessage: (event) => {
        if (!event || !event.type) return;
        if (event.type === 'override' && event.row) {
          const row = event.row;
          if (row.job_id === undefined) return;
          setJobs(prev => prev.map(j =>
            j.id === row.job_id ? applyOverrideRowToJob(j, row) : j,
          ));
        }
        // 'note' events are ignored at the board level — JobDetail re-fetches
        // on open, which is fine; cross-user note visibility through the
        // detail panel can be added later if needed.
      },
      onReconnect: () => {
        // While we were disconnected we may have missed events. A single
        // refresh re-syncs both jobs and stats.
        fetchData();
      },
      onError: (err) => {
        // Don't spam the console on every reconnect attempt.
        if (err && err.status && err.status !== 401) {
          console.warn('[req-board] event stream error:', err.message);
        }
      },
    });
    return unsubscribe;
  }, [fetchData]);

  // Ticker for the "Updated Xs ago" pill. Only runs while the page is mounted
  // and uses a generous 15s cadence so the UI doesn't cause re-renders every
  // second.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), REFRESH_TICK_MS);
    return () => clearInterval(t);
  }, []);

  const redBoxCount = useMemo(() => jobs.filter(hasRedBox).length, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      if (isFilledAndExpired(job)) return false;
      if (filters.status?.length && !filters.status.includes(job.status)) return false;
      if (filters.employmentType?.length && !filters.employmentType.includes(job.employmentType)) return false;
      if (filters.owner?.length && !filters.owner.includes(job.owner)) return false;
      if (filters.recruiter?.length && !filters.recruiter.includes(job.recruiter)) return false;
      if (filters.client?.length && !filters.client.includes(job.client)) return false;
      if (filters.remote) {
        const r = (job.remote || '').toLowerCase();
        if (r !== filters.remote.toLowerCase()) return false;
      }
      if (filters.calledShot === 'yes' && !job.calledShot) return false;
      if (filters.redBoxes === 'red' && !hasRedBox(job)) return false;
      return true;
    });
  }, [jobs, filters]);

  const handleJobUpdated = (jobId, field, value) => {
    setJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, [field]: value } : j
    ));
  };

  // Bumped every time the server returns a fresh version for a job's override
  // row (e.g. after a successful save). Keeps the in-memory jobs list in sync
  // with the concurrency token so subsequent saves send the right If-Match.
  const handleOverrideVersionUpdated = (jobId, serverData) => {
    if (!serverData) return;
    const nextVersion = typeof serverData.version === 'number' ? serverData.version : null;
    const nextBy = serverData.updated_by ?? null;
    const nextAt = serverData.updated_at ?? null;
    if (nextVersion === null) return;
    setJobs(prev => prev.map(j =>
      j.id === jobId
        ? { ...j, overrideVersion: nextVersion, overrideUpdatedBy: nextBy, overrideUpdatedAt: nextAt }
        : j,
    ));
  };

  const handleConflict = (info) => setConflict(info);
  const dismissConflict = () => setConflict(null);
  const reloadAfterConflict = async () => {
    setConflict(null);
    await fetchData();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportJobs();
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (roleLoading) return null;
  if (!hasAccess(permissionKey)) return <AccessDenied />;

  const refreshAge = lastRefresh ? formatRelative(lastRefresh.getTime(), now) : null;
  const pausedReason = isEditing
    ? 'Auto-refresh paused while editing'
    : selectedJobId
      ? 'Auto-refresh paused while detail panel is open'
      : null;

  return (
    <EditingContext.Provider value={editingApi}>
      <div className="req-board-module">
        <div className="req-board-toolbar">
          <div className="toolbar-left">
            <img src="/apt-logo.jpg" alt="APT" className="toolbar-logo" />
            <h2 className="toolbar-title">{title}</h2>
          </div>
          <div className="toolbar-right">
            {lastRefresh && (
              <span
                className={`last-refresh${pausedReason ? ' last-refresh-paused' : ''}`}
                title={pausedReason || 'Auto-refreshes every 5 minutes'}
              >
                Updated {refreshAge}
                {pausedReason && <span className="refresh-paused-dot" aria-hidden="true"> · paused</span>}
              </span>
            )}
            <button className="export-btn" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export Excel'}
            </button>
            <button className="refresh-btn" onClick={fetchData} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            Failed to load data: {error}
            <button onClick={fetchData}>Retry</button>
          </div>
        )}

        <StatsStrip stats={stats} jobs={jobs} loading={loading} onJobUpdated={handleJobUpdated} />

        <FilterBar filters={filters} onChange={setFilters} jobs={jobs} redBoxCount={redBoxCount} />

        <div className="board-info">
          <span>{filteredJobs.length} requisitions</span>
          {filteredJobs.length !== jobs.length && (
            <span className="filtered-note"> (filtered from {jobs.length})</span>
          )}
        </div>

        <ReqBoard
          jobs={filteredJobs}
          loading={loading}
          onSelectJob={setSelectedJobId}
          selectedJobId={selectedJobId}
          onJobUpdated={handleJobUpdated}
          onOverrideVersionUpdated={handleOverrideVersionUpdated}
          onConflict={handleConflict}
        />

        {selectedJobId && (
          <JobDetail
            jobId={selectedJobId}
            onClose={() => setSelectedJobId(null)}
          />
        )}

        {conflict && (
          <ConflictDialog
            conflict={conflict}
            onReload={reloadAfterConflict}
            onDismiss={dismissConflict}
          />
        )}
      </div>
    </EditingContext.Provider>
  );
}
