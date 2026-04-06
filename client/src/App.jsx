import { useState, useEffect, useCallback, useMemo } from 'react';
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { getJobs, getStats, exportJobs } from './lib/api';
import StatsStrip from './components/StatsStrip';
import FilterBar from './components/FilterBar';
import ReqBoard from './components/ReqBoard';
import JobDetail from './components/JobDetail';
import LoginPage from './components/LoginPage';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SPLASH_DURATION = 10000; // 10 seconds

function SplashScreen({ onComplete }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadeOut(true), SPLASH_DURATION - 600);
    const doneTimer = setTimeout(onComplete, SPLASH_DURATION);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onComplete]);

  return (
    <div className={`splash-screen ${fadeOut ? 'fade-out' : ''}`}>
      <p className="splash-text">This is to close business and move forward together as quickly as possible</p>
      <p className="splash-hashtag">#BringHomeTheLion</p>

    </div>
  );
}

function Dashboard() {
  const [showSplash, setShowSplash] = useState(true);

  const { instance, accounts } = useMsal();
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    employmentType: '',
    owner: '',
    remote: '',
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobsRes, statsRes] = await Promise.all([getJobs(), getStats()]);
      setJobs(jobsRes.data || []);
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
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      if (filters.status && job.status !== filters.status) return false;
      if (filters.employmentType && job.employmentType !== filters.employmentType) return false;
      if (filters.owner && job.owner !== filters.owner) return false;
      if (filters.remote) {
        const r = (job.remote || '').toLowerCase();
        if (r !== filters.remote.toLowerCase()) return false;
      }
      return true;
    });
  }, [jobs, filters]);

  // Optimistic update when an editable field is saved
  const handleJobUpdated = (jobId, field, value) => {
    setJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, [field]: value } : j
    ));
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

  const userName = accounts[0]?.name || accounts[0]?.username || '';

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
  };

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1 className="header-title">APT Req Board</h1>
          <span className="header-subtitle">Digital Requisition Dashboard</span>
        </div>
        <div className="header-right">
          {lastRefresh && (
            <span className="last-refresh">
              Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button className="export-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
          <button className="refresh-btn" onClick={fetchData} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <span className="user-name">{userName}</span>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          Failed to load data: {error}
          <button onClick={fetchData}>Retry</button>
        </div>
      )}

      <StatsStrip stats={stats} jobs={jobs} loading={loading} />

      <FilterBar filters={filters} onChange={setFilters} jobs={jobs} />

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
      />

      {selectedJobId && (
        <JobDetail
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <>
      <AuthenticatedTemplate>
        <Dashboard />
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <LoginPage />
      </UnauthenticatedTemplate>
    </>
  );
}
