import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { TicketIcon, Clock, CheckCircle2, UserCircle } from 'lucide-react';

const CATEGORY_LABEL = {
  issue: 'Issue',
  bug: 'Issue',           // legacy
  feature: 'Feature',
  feedback: 'General Question',
  it_support: 'Issue',    // legacy
};

const CATEGORY_COLOR = {
  issue: '#dc2626',
  feature: '#7c3aed',
  feedback: '#0891b2',
};

const STATUS_LABEL = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_COLOR = {
  open: '#16a34a',
  in_progress: '#2563eb',
  resolved: '#6b7280',
  closed: '#374151',
};

function formatHours(ms) {
  if (ms == null) return '—';
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day;
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SupportReporting({ tickets }) {
  // --- Top-level KPIs ---
  const kpis = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;
    const resolvedOrClosed = tickets.filter(t => t.resolved_at && t.created_at);
    const avgMs = resolvedOrClosed.length > 0
      ? resolvedOrClosed.reduce((sum, t) => sum + (new Date(t.resolved_at) - new Date(t.created_at)), 0) / resolvedOrClosed.length
      : null;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = tickets.filter(t => new Date(t.created_at) >= startOfMonth).length;

    return { total, open, avgMs, thisMonth };
  }, [tickets]);

  // --- Tickets by Tool (Issue tickets only) ---
  const byTool = useMemo(() => {
    const counts = {};
    for (const t of tickets) {
      if (!t.tool) continue;
      counts[t.tool] = (counts[t.tool] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count);
  }, [tickets]);

  // --- Tickets by Submitter (top 10) ---
  const bySubmitter = useMemo(() => {
    const counts = {};
    for (const t of tickets) {
      const key = t.submitted_by_name || t.submitted_by || 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [tickets]);

  // --- Tickets by Status (donut) ---
  const byStatus = useMemo(() => {
    const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const t of tickets) {
      if (counts[t.status] != null) counts[t.status] += 1;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([status, count]) => ({
        status,
        label: STATUS_LABEL[status],
        count,
        color: STATUS_COLOR[status],
      }));
  }, [tickets]);

  // --- Avg Time to Close by Category ---
  const avgCloseByCategory = useMemo(() => {
    const buckets = { issue: [], feature: [], feedback: [] };
    for (const t of tickets) {
      if (!t.resolved_at || !t.created_at) continue;
      const bucket = t.category === 'bug' || t.category === 'it_support' ? 'issue' : t.category;
      if (buckets[bucket]) {
        buckets[bucket].push(new Date(t.resolved_at) - new Date(t.created_at));
      }
    }
    return Object.entries(buckets).map(([cat, arr]) => ({
      category: CATEGORY_LABEL[cat] || cat,
      key: cat,
      hours: arr.length > 0
        ? (arr.reduce((a, b) => a + b, 0) / arr.length) / (1000 * 60 * 60)
        : 0,
      count: arr.length,
      color: CATEGORY_COLOR[cat],
    }));
  }, [tickets]);

  // --- Avg Time to Close by Tool ---
  const avgCloseByTool = useMemo(() => {
    const buckets = {};
    for (const t of tickets) {
      if (!t.tool || !t.resolved_at || !t.created_at) continue;
      if (!buckets[t.tool]) buckets[t.tool] = [];
      buckets[t.tool].push(new Date(t.resolved_at) - new Date(t.created_at));
    }
    return Object.entries(buckets)
      .map(([tool, arr]) => ({
        tool,
        hours: (arr.reduce((a, b) => a + b, 0) / arr.length) / (1000 * 60 * 60),
        count: arr.length,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [tickets]);

  // --- Volume over time (last 12 weeks) ---
  const volumeByWeek = useMemo(() => {
    const now = new Date();
    const twelveWeeksAgo = startOfWeek(new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000));
    const weeks = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(twelveWeeksAgo);
      d.setDate(d.getDate() + i * 7);
      weeks[d.toISOString()] = { week: weekLabel(d), count: 0 };
    }
    for (const t of tickets) {
      if (!t.created_at) continue;
      const ws = startOfWeek(new Date(t.created_at));
      if (ws < twelveWeeksAgo) continue;
      const key = ws.toISOString();
      if (weeks[key]) weeks[key].count += 1;
    }
    return Object.values(weeks);
  }, [tickets]);

  // --- Tickets by Assignee (open/in_progress workload) ---
  const openByAssignee = useMemo(() => {
    const counts = {};
    for (const t of tickets) {
      if (t.status !== 'open' && t.status !== 'in_progress') continue;
      const key = t.assigned_to_name || t.assigned_to || 'Unassigned';
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [tickets]);

  if (tickets.length === 0) {
    return (
      <div className="support-reporting">
        <p className="support-muted">No tickets yet — charts will appear once tickets are submitted.</p>
      </div>
    );
  }

  return (
    <div className="support-reporting">
      {/* Top KPIs */}
      <div className="support-kpi-row">
        <div className="support-kpi-card">
          <TicketIcon size={18} className="support-kpi-icon" />
          <div>
            <div className="support-kpi-label">Total Tickets</div>
            <div className="support-kpi-value">{kpis.total}</div>
          </div>
        </div>
        <div className="support-kpi-card">
          <Clock size={18} className="support-kpi-icon" style={{ color: '#16a34a' }} />
          <div>
            <div className="support-kpi-label">Open</div>
            <div className="support-kpi-value">{kpis.open}</div>
          </div>
        </div>
        <div className="support-kpi-card">
          <CheckCircle2 size={18} className="support-kpi-icon" style={{ color: '#2563eb' }} />
          <div>
            <div className="support-kpi-label">Avg Time to Close</div>
            <div className="support-kpi-value">{kpis.avgMs != null ? formatDuration(kpis.avgMs) : '—'}</div>
          </div>
        </div>
        <div className="support-kpi-card">
          <UserCircle size={18} className="support-kpi-icon" style={{ color: '#D3BF30' }} />
          <div>
            <div className="support-kpi-label">This Month</div>
            <div className="support-kpi-value">{kpis.thisMonth}</div>
          </div>
        </div>
      </div>

      {/* Charts grid */}
      <div className="support-charts-grid">
        {/* Tickets by Tool */}
        <div className="support-chart-card">
          <h4 className="support-chart-title">Tickets by Tool</h4>
          {byTool.length === 0 ? (
            <p className="support-chart-empty">No issue tickets with a tool yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byTool} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="tool" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="#04144F" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tickets by Submitter (top 10) */}
        <div className="support-chart-card">
          <h4 className="support-chart-title">Top Submitters</h4>
          {bySubmitter.length === 0 ? (
            <p className="support-chart-empty">No tickets submitted yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bySubmitter} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="count" fill="#D3BF30" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tickets by Status (donut) */}
        <div className="support-chart-card">
          <h4 className="support-chart-title">Tickets by Status</h4>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={byStatus}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                label={(entry) => `${entry.label}: ${entry.count}`}
                labelLine={false}
              >
                {byStatus.map((entry) => (
                  <Cell key={entry.status} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Avg Time to Close by Category */}
        <div className="support-chart-card">
          <h4 className="support-chart-title">Avg Time to Close · Category</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={avgCloseByCategory} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
              <Tooltip formatter={(value) => [`${value.toFixed(1)} hrs`, 'Avg']} />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                {avgCloseByCategory.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Avg Time to Close by Tool */}
        <div className="support-chart-card">
          <h4 className="support-chart-title">Avg Time to Close · Tool</h4>
          {avgCloseByTool.length === 0 ? (
            <p className="support-chart-empty">No resolved issue tickets yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={avgCloseByTool} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} label={{ value: 'Hours', position: 'insideBottom', offset: -2, style: { fontSize: 11 } }} />
                <YAxis dataKey="tool" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(value) => [`${value.toFixed(1)} hrs`, 'Avg']} />
                <Bar dataKey="hours" fill="#0e2468" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Open tickets by Assignee */}
        <div className="support-chart-card">
          <h4 className="support-chart-title">Open Workload · Assignee</h4>
          {openByAssignee.length === 0 ? (
            <p className="support-chart-empty">No open tickets right now.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={openByAssignee} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="count" fill="#14b8a6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Volume over time */}
        <div className="support-chart-card support-chart-wide">
          <h4 className="support-chart-title">Ticket Volume · Last 12 Weeks</h4>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={volumeByWeek} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#04144F" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
