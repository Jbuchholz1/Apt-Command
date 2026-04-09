const BH_BASE = 'https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm';

function BhLink({ entity, id, children }) {
  if (!id) return <span>{children || '—'}</span>;
  const url = `${BH_BASE}?Entity=${entity}&id=${id}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="bh-detail-link">
      {children || id}
    </a>
  );
}

export default function DetailTable({ title, columns, data }) {
  if (!data) return null;

  return (
    <div className="detail-table-section">
      <h3 className="section-title">{title} <span className="detail-count">({data.length})</span></h3>
      {data.length === 0 ? (
        <p className="detail-empty">No records for this date range.</p>
      ) : (
        <div className="detail-table-wrap">
          <table className="detail-table">
            <thead>
              <tr>
                {columns.map(col => <th key={col.key}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col.key}>
                      {col.bhEntity ? (
                        <BhLink entity={col.bhEntity} id={row[col.key]}>
                          {row[col.key]}
                        </BhLink>
                      ) : col.format === 'currency' ? (
                        `$${Number(row[col.key] || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      ) : (
                        row[col.key] || '—'
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
