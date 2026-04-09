export default function MetricsTable({ recruiters, totals }) {
  if (!recruiters || recruiters.length === 0) return null;

  const rows = [
    { label: 'Interviews (3 pts)', key: 'interviewPoints', source: 'points' },
    { label: 'Client Subs (1 pt)', key: 'subsPoints', source: 'points' },
    { label: 'Starts (10 pts)', key: 'startsPoints', source: 'points' },
    { label: 'MAR Total', key: 'total', source: 'points', bold: true },
    { label: 'New Input', key: 'newInput', source: 'metrics', format: 'currency' },
  ];

  const fmt = (val, format) => {
    if (format === 'currency') return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return val;
  };

  const getTotal = (row) => {
    if (row.key === 'total') return totals.mar;
    if (row.key === 'newInput') return totals.newInput;
    if (row.key === 'interviewPoints') return totals.interviews * 3;
    if (row.key === 'subsPoints') return totals.clientSubs * 1;
    if (row.key === 'startsPoints') return totals.starts * 10;
    return 0;
  };

  return (
    <div className="metrics-table-wrap">
      <h3 className="section-title">Metrics Summary (Points)</h3>
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
                {fmt(getTotal(row), row.format)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
