import { useState, useCallback } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import ModuleSplash from '../../components/ModuleSplash';
import PlacementsTracker from './PlacementsTracker';
import { exportOperationsPlacements } from '../../lib/api';
import './operations.css';

export default function OperationsModule() {
  const [showSplash, setShowSplash] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
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
    // Small delay so the button shows the refreshing state
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  if (showSplash) {
    return (
      <ModuleSplash
        text="Operations"
        hashtag="#RunItRight"
        onComplete={() => { setShowSplash(false); setLastRefresh(new Date()); }}
      />
    );
  }

  return (
    <div className="operations-module">
      <div className="ops-toolbar">
        <div className="ops-toolbar-left">
          <img src="/apt-logo.jpg" alt="APT" className="ops-toolbar-logo" />
          <h1 className="ops-toolbar-title">Operations</h1>
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
