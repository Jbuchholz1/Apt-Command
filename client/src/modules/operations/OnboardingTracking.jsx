import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Download, ArrowLeft } from 'lucide-react';
import PlacementsTracker from './PlacementsTracker';
import { exportOperationsPlacements } from '../../lib/api';

export default function OnboardingTracking() {
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      await exportOperationsPlacements();
    } catch (err) {
      console.error('[Operations] export error:', err);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
    setLastRefresh(new Date());
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  return (
    <div className="operations-module">
      <div className="ops-toolbar">
        <div className="ops-toolbar-left">
          <Link to="/operations" className="ops-back-btn"><ArrowLeft size={14} /> Operations</Link>
          <img src="/apt-logo.jpg" alt="APT" className="ops-toolbar-logo" />
          <h1 className="ops-toolbar-title">Onboarding Tracking</h1>
        </div>
        <div className="ops-toolbar-right">
          {lastRefresh && (
            <span className="ops-last-refresh">
              Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button
            className="ops-export-btn"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            className="ops-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <PlacementsTracker key={refreshKey} />
    </div>
  );
}
