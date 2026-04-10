export default function MetricsTable({ recruiters, totals }) {
  if (!recruiters || recruiters.length === 0) return null;

  const rows = [
    { label: 'Interviews', key: 'interviews', source: 'metrics' },
    { label: 'Client Subs', key: 'clientSubs', source: 'metrics' },
    { label: 'Starts', key: 'starts', source: 'metrics' },
    { label: 'MAR', key: 'mar', source: 'metrics', bold: true },
    { label: 'New Input', key: 'newInput', source: 'metrics', format: 'currency' },
  ];

  const fmt = (val, format) => {
    if (format === 'currency') return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (typeof val === 'number' && !Number.isInteger(val)) return Math.round(val * 100) / 100;
    return val;
  };

  return (
    <div className="metrics-table-wrap">
      <h3 className="section-title">Metrics Summary</h3>
      <table className="metrics-table">
        <thead>
          <tr>
            <th>Activity</th>
            {recruiters.map(r => <th key={r.id}>{r.name}</th>)}
            <th className="total-col">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className={row.bold ? 'bold-row' : ''}>
              <td className="row-label">{row.label}</td>
              {recruiters.map(r => (
                <td key={r.id} className="metric-val">
                  {fmt(r[row.source][row.key], row.format)}
                </td>
              ))}
              <td className="metric-val total-col">
                {fmt(totals[row.key], row.format)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
