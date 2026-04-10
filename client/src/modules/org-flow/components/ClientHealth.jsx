import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, AlertCircle, Building2, User, ArrowLeft } from 'lucide-react';

export default function ClientHealth({ onBack }) {
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [filterBy, setFilterBy] = useState('all');
  const [selectedFilter, setSelectedFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [previousWeekHealth, setPreviousWeekHealth] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    calculateMetrics();
  }, [clients, employees, filterBy, selectedFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const [clientsRes, employeesRes, todaySnapshotRes, previousSnapshotRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('employees').select('*'),
        supabase
          .from('health_snapshots')
          .select('health_percentage, snapshot_date')
          .eq('snapshot_date', today)
          .maybeSingle(),
        supabase
          .from('health_snapshots')
          .select('health_percentage')
          .lt('snapshot_date', today)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (clientsRes.data) setClients(clientsRes.data);
      if (employeesRes.data) setEmployees(employeesRes.data);
      if (previousSnapshotRes.data) setPreviousWeekHealth(previousSnapshotRes.data.health_percentage);

      if (!todaySnapshotRes.data) {
        await createCurrentSnapshot();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createCurrentSnapshot = async () => {
    try {
      await supabase.rpc('create_health_snapshot');
    } catch (error) {
      console.error('Error creating snapshot:', error);
    }
  };

  const calculateMetrics = () => {
    const metricsMap = new Map();

    clients.forEach((client) => {
      const clientEmployees = employees.filter((e) => e.client_id === client.id);

      if (clientEmployees.length === 0) return;

      const healthy = clientEmployees.filter((e) => e.health_status === 'healthy').length;
      const needsAttention = clientEmployees.filter((e) => e.health_status === 'needs_attention').length;
      const unhealthy = clientEmployees.filter((e) => e.health_status === 'unhealthy').length;
      const totalPeople = clientEmployees.length;
      const healthyPercentage = totalPeople > 0 ? (healthy / totalPeople) * 100 : 0;

      metricsMap.set(client.id, {
        clientId: client.id,
        clientName: client.name,
        accountManager: client.account_manager || 'Unassigned',
        totalPeople,
        healthy,
        needsAttention,
        unhealthy,
        healthyPercentage,
        previousHealthPercentage: client.previous_health_percentage,
      });
    });

    let filteredMetrics = Array.from(metricsMap.values());

    if (filterBy === 'client' && selectedFilter) {
      filteredMetrics = filteredMetrics.filter((m) => m.clientId === selectedFilter);
    } else if (filterBy === 'manager' && selectedFilter) {
      filteredMetrics = filteredMetrics.filter((m) => m.accountManager === selectedFilter);
    }

    filteredMetrics.sort((a, b) => b.healthyPercentage - a.healthyPercentage);

    setMetrics(filteredMetrics);
  };

  const getAccountManagers = () => {
    const managers = new Set(clients.map((c) => c.account_manager || 'Unassigned'));
    return Array.from(managers).sort();
  };

  const getOverallMetrics = () => {
    const total = metrics.reduce((sum, m) => sum + m.totalPeople, 0);
    const healthy = metrics.reduce((sum, m) => sum + m.healthy, 0);
    const needsAttention = metrics.reduce((sum, m) => sum + m.needsAttention, 0);
    const unhealthy = metrics.reduce((sum, m) => sum + m.unhealthy, 0);
    const healthyPercentage = total > 0 ? (healthy / total) * 100 : 0;

    return { total, healthy, needsAttention, unhealthy, healthyPercentage };
  };

  const getHealthColorClass = (percentage) => {
    if (percentage >= 80) return 'of-health-good';
    if (percentage >= 60) return 'of-health-warning';
    return 'of-health-danger';
  };

  const getHealthIcon = (percentage) => {
    if (percentage >= 80) return <TrendingUp className="of-icon-sm" />;
    if (percentage >= 60) return <AlertCircle className="of-icon-sm" />;
    return <TrendingDown className="of-icon-sm" />;
  };

  const getTrendArrow = (current, previous) => {
    if (previous === null) return null;
    if (current > previous) return <TrendingUp className="of-icon-sm" />;
    if (current < previous) return <TrendingDown className="of-icon-sm" />;
    return null;
  };

  const overall = getOverallMetrics();

  if (loading) {
    return (
      <div className="of-loading-container">
        <div className="of-loading-text">Loading client health data...</div>
      </div>
    );
  }

  return (
    <div className="of-page">
      <header className="of-header-light">
        <div className="of-container of-header-inner">
          <div className="of-header-nav">
            <button
              onClick={onBack}
              className="of-back-btn"
            >
              <ArrowLeft className="of-icon-sm" />
              <span className="of-back-label">Back to Dashboard</span>
            </button>
          </div>
        </div>
      </header>

      <main className="of-container of-main-content">
        <div className="of-page-title-row">
          <h1 className="of-page-title">Client Health Dashboard</h1>
        </div>

        <div className="of-card">
          <h2 className="of-card-title">Overall Health</h2>
          <div className="of-stats-grid of-stats-grid--5">
            <div className="of-stat-card of-stat-card--blue">
              <div className="of-stat-label">Total People</div>
              <div className="of-stat-value">{overall.total}</div>
              <div className="of-stat-sublabel">All individuals tracked</div>
            </div>
            <div className="of-stat-card of-stat-card--green">
              <div className="of-stat-label">Healthy</div>
              <div className="of-stat-value">{overall.healthy}</div>
              <div className="of-stat-sublabel">{overall.healthyPercentage.toFixed(1)}%</div>
            </div>
            <div className="of-stat-card of-stat-card--yellow">
              <div className="of-stat-label">Needs Attention</div>
              <div className="of-stat-value">{overall.needsAttention}</div>
              <div className="of-stat-sublabel">
                {overall.total > 0 ? ((overall.needsAttention / overall.total) * 100).toFixed(1) : 0}%
              </div>
            </div>
            <div className="of-stat-card of-stat-card--red">
              <div className="of-stat-label">Unhealthy</div>
              <div className="of-stat-value">{overall.unhealthy}</div>
              <div className="of-stat-sublabel">
                {overall.total > 0 ? ((overall.unhealthy / overall.total) * 100).toFixed(1) : 0}%
              </div>
            </div>
            <div className={`of-stat-card ${getHealthColorClass(overall.healthyPercentage)}`}>
              <div className="of-stat-label-with-icon">
                {getTrendArrow(overall.healthyPercentage, previousWeekHealth)}
                <div className="of-stat-label">Health Score</div>
              </div>
              <div className="of-stat-value">{overall.healthyPercentage.toFixed(1)}%</div>
              <div className="of-stat-sublabel">
                {previousWeekHealth !== null
                  ? `Day over day trend`
                  : 'Overall healthy rate'}
              </div>
            </div>
          </div>
        </div>

        <div className="of-card">
          <div className="of-filter-row">
            <label className="of-filter-label">Filter by:</label>
            <select
              value={filterBy}
              onChange={(e) => {
                setFilterBy(e.target.value);
                setSelectedFilter('');
              }}
              className="of-select"
            >
              <option value="all">All Clients</option>
              <option value="client">Specific Client</option>
              <option value="manager">Account Manager</option>
            </select>

            {filterBy === 'client' && (
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="of-select"
              >
                <option value="">Select Client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            )}

            {filterBy === 'manager' && (
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="of-select"
              >
                <option value="">Select Manager</option>
                {getAccountManagers().map((manager) => (
                  <option key={manager} value={manager}>
                    {manager}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="of-client-list">
            {metrics.length === 0 ? (
              <div className="of-empty-state">
                <AlertCircle className="of-empty-icon" />
                <p>No health data available for the selected filter.</p>
                <p className="of-empty-hint">All individuals on the org chart are tracked.</p>
              </div>
            ) : (
              metrics.map((metric) => (
                <div
                  key={metric.clientId}
                  className="of-client-row"
                >
                  <div className="of-client-row-content">
                    <div className="of-client-info">
                      <div className="of-client-name-row">
                        <Building2 className="of-icon-muted" />
                        <h3 className="of-client-name">{metric.clientName}</h3>
                      </div>
                      <div className="of-client-manager">
                        <User className="of-icon-xs" />
                        <span>Account Manager: {metric.accountManager}</span>
                      </div>
                      <div className="of-client-metrics-grid">
                        <div>
                          <span className="of-metric-label">Total People:</span>
                          <span className="of-metric-value">{metric.totalPeople}</span>
                        </div>
                        <div>
                          <span className="of-metric-label of-metric-label--green">Healthy:</span>
                          <span className="of-metric-value of-metric-value--green">{metric.healthy}</span>
                        </div>
                        <div>
                          <span className="of-metric-label of-metric-label--yellow">Needs Attention:</span>
                          <span className="of-metric-value of-metric-value--yellow">{metric.needsAttention}</span>
                        </div>
                        <div>
                          <span className="of-metric-label of-metric-label--red">Unhealthy:</span>
                          <span className="of-metric-value of-metric-value--red">{metric.unhealthy}</span>
                        </div>
                      </div>
                    </div>
                    <div className={`of-health-badge ${getHealthColorClass(metric.healthyPercentage)}`}>
                      {getTrendArrow(metric.healthyPercentage, metric.previousHealthPercentage)}
                      <div className="of-health-badge-text">
                        <div className="of-health-badge-value">{metric.healthyPercentage.toFixed(1)}%</div>
                        <div className="of-health-badge-label">Healthy</div>
                      </div>
                    </div>
                  </div>
                  <div className="of-health-bar">
                    <div className="of-health-bar-inner">
                      <div
                        className="of-health-bar-segment of-health-bar-segment--green"
                        style={{ width: `${(metric.healthy / metric.totalPeople) * 100}%` }}
                      />
                      <div
                        className="of-health-bar-segment of-health-bar-segment--yellow"
                        style={{ width: `${(metric.needsAttention / metric.totalPeople) * 100}%` }}
                      />
                      <div
                        className="of-health-bar-segment of-health-bar-segment--red"
                        style={{ width: `${(metric.unhealthy / metric.totalPeople) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
