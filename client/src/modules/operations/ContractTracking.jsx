import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, FileText, Upload, FileDown, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import {
  getContracts,
  createContract,
  updateContract,
  deleteContract,
  exportContracts,
  importContracts,
} from '../../lib/api';
import { readExcelToJson, writeExcelFile } from '../../lib/excel';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function fmtDate(iso) {
  if (!iso) return '';
  // Postgres `date` columns come back as 'YYYY-MM-DD'. Parse without timezone shifts.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1].slice(-2)}`;
}

function fmtMoney(val) {
  if (val == null || val === '') return '';
  const n = Number(val);
  if (Number.isNaN(n)) return '';
  return currency.format(n);
}

function daysUntil(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000);
}

function isExpiringSoon(c) {
  if (c.cancelled) return false;
  const d = daysUntil(c.contract_end_date);
  return d != null && d >= 0 && d <= 90;
}

function emptyForm() {
  return {
    vendor_name: '',
    contract_start_date: '',
    contract_end_date: '',
    monthly_cost: '',
    yearly_cost: '',
    notice_period_days: '',
    auto_renewing: false,
    cancelled: false,
    contract_link: '',
  };
}

function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
}

export default function ContractTracking() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [importing, setImporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getContracts();
      setContracts(res?.data || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[ContractTracking] load error:', err);
      setError(err.message || 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setTimeout(() => setRefreshing(false), 400);
  }, [load]);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      await exportContracts();
    } catch (err) {
      console.error('[ContractTracking] export error:', err);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleExportPDF = useCallback(() => {
    try {
      setExportingPdf(true);

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const generatedAt = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });

      // Totals exclude cancelled contracts
      const active = contracts.filter(c => !c.cancelled);
      const totalMonthly = active.reduce((sum, c) => sum + (Number(c.monthly_cost) || 0), 0);
      const totalYearly = active.reduce((sum, c) => sum + (Number(c.yearly_cost) || 0), 0);
      const expiringCount = active.filter(c => isExpiringSoon(c)).length;

      // Title block — APT navy + gold
      doc.setFillColor(4, 20, 79);
      doc.rect(0, 0, pageWidth, 56, 'F');
      doc.setTextColor(211, 191, 48);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('APT Vendor Contracts', 36, 28);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generated ${generatedAt}`, 36, 44);

      // Summary bar
      doc.setTextColor(55, 65, 81);
      doc.setFontSize(10);
      const summaryY = 76;
      const summary = [
        `Total: ${contracts.length}`,
        `Active: ${active.length}`,
        `Cancelled: ${contracts.length - active.length}`,
        `Expiring (<=90d): ${expiringCount}`,
        `Total Monthly: ${currency.format(totalMonthly)}`,
        `Total Yearly: ${currency.format(totalYearly)}`,
      ].join('   |   ');
      doc.text(summary, 36, summaryY);

      // Table
      const head = [[
        'Vendor', 'Start', 'End', 'Monthly', 'Yearly',
        'Notice (days)', 'Auto-Renew', 'Cancelled', 'Link',
      ]];
      const body = contracts.map(c => [
        c.vendor_name || '',
        fmtDate(c.contract_start_date),
        fmtDate(c.contract_end_date),
        fmtMoney(c.monthly_cost),
        fmtMoney(c.yearly_cost),
        c.notice_period_days != null ? String(c.notice_period_days) : '',
        c.auto_renewing ? 'Yes' : 'No',
        c.cancelled ? 'Yes' : 'No',
        c.contract_link || '',
      ]);

      autoTable(doc, {
        startY: 92,
        head,
        body,
        margin: { left: 36, right: 36 },
        styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
        headStyles: { fillColor: [4, 20, 79], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 110, fontStyle: 'bold' },   // Vendor
          1: { cellWidth: 60 },                        // Start
          2: { cellWidth: 60 },                        // End
          3: { cellWidth: 65, halign: 'right' },       // Monthly
          4: { cellWidth: 70, halign: 'right' },       // Yearly
          5: { cellWidth: 60, halign: 'center' },      // Notice
          6: { cellWidth: 55, halign: 'center' },      // Auto-Renew
          7: { cellWidth: 55, halign: 'center' },      // Cancelled
          8: { cellWidth: 'auto' },                    // Link
        },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const c = contracts[data.row.index];
          if (!c) return;
          if (c.cancelled) {
            data.cell.styles.textColor = [156, 163, 175];
            data.cell.styles.fontStyle = 'italic';
          } else if (isExpiringSoon(c) && data.column.index === 2) {
            data.cell.styles.fillColor = [254, 215, 170];
            data.cell.styles.textColor = [154, 52, 18];
            data.cell.styles.fontStyle = 'bold';
          }
        },
        didDrawPage: (data) => {
          const pageNum = doc.internal.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          doc.text('APT Companies — Confidential', 36, pageHeight - 18);
          doc.text(`Page ${data.pageNumber} of ${pageNum}`, pageWidth - 36, pageHeight - 18, { align: 'right' });
        },
      });

      const today = new Date().toISOString().slice(0, 10);
      doc.save(`APT_Contracts_${today}.pdf`);
    } catch (err) {
      console.error('[ContractTracking] PDF export error:', err);
      window.alert(`PDF export failed: ${err.message || err}`);
    } finally {
      setExportingPdf(false);
    }
  }, [contracts]);

  const handleDownloadTemplate = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const oneYearOut = new Date();
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    const templateRows = [
      {
        'Vendor Name': 'Acme Cloud Inc.',
        'Start Date': today,
        'End Date': oneYearOut.toISOString().slice(0, 10),
        'Monthly Cost': 500,
        'Yearly Cost': 6000,
        'Notice Period (days)': 30,
        'Auto-Renewing': 'Yes',
        'Cancelled': 'No',
        'Contract Link': 'https://example.com/acme-msa.pdf',
      },
      {
        'Vendor Name': 'Globex Software',
        'Start Date': '',
        'End Date': '',
        'Monthly Cost': '',
        'Yearly Cost': 14400,
        'Notice Period (days)': 60,
        'Auto-Renewing': 'No',
        'Cancelled': 'No',
        'Contract Link': '',
      },
    ];
    await writeExcelFile(templateRows, 'Contracts', 'APT_Contracts_Template.xlsx');
  }, []);

  const handleImportClick = useCallback(() => {
    if (importing) return;
    fileInputRef.current?.click();
  }, [importing]);

  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const rows = await readExcelToJson(buffer);
      if (!rows || rows.length === 0) {
        window.alert('The file is empty or has no valid data.');
        return;
      }
      const result = await importContracts(rows);

      let message = `Imported ${result.inserted} contract(s).`;
      if (result.skippedRows?.length > 0) {
        message += `\n\nSkipped ${result.skippedRows.length} row(s):\n${result.skippedRows.slice(0, 5).join('\n')}`;
        if (result.skippedRows.length > 5) {
          message += `\n... and ${result.skippedRows.length - 5} more`;
        }
      }
      window.alert(message);
      await load();
    } catch (err) {
      console.error('[ContractTracking] import error:', err);
      window.alert(`Error importing file: ${err.message || err}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [load]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(c) {
    setEditing(c);
    setForm({
      vendor_name: c.vendor_name || '',
      contract_start_date: c.contract_start_date || '',
      contract_end_date: c.contract_end_date || '',
      monthly_cost: c.monthly_cost != null ? String(c.monthly_cost) : '',
      yearly_cost: c.yearly_cost != null ? String(c.yearly_cost) : '',
      notice_period_days: c.notice_period_days != null ? String(c.notice_period_days) : '',
      auto_renewing: !!c.auto_renewing,
      cancelled: !!c.cancelled,
      contract_link: c.contract_link || '',
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
  }

  function setField(name, value) {
    setForm(f => ({ ...f, [name]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.vendor_name.trim()) {
      setFormError('Vendor name is required');
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload = {
      vendor_name: form.vendor_name.trim(),
      contract_start_date: form.contract_start_date || null,
      contract_end_date: form.contract_end_date || null,
      monthly_cost: form.monthly_cost === '' ? null : Number(form.monthly_cost),
      yearly_cost: form.yearly_cost === '' ? null : Number(form.yearly_cost),
      notice_period_days: form.notice_period_days === '' ? null : parseInt(form.notice_period_days, 10),
      auto_renewing: !!form.auto_renewing,
      cancelled: !!form.cancelled,
      contract_link: form.contract_link.trim() || null,
    };

    try {
      if (editing) {
        const res = await updateContract(editing.id, payload);
        const row = res?.data;
        if (row) {
          setContracts(list => list.map(c => (c.id === row.id ? row : c)));
        }
      } else {
        const res = await createContract(payload);
        const row = res?.data;
        if (row) {
          setContracts(list => [row, ...list]);
        }
      }
      setModalOpen(false);
    } catch (err) {
      console.error('[ContractTracking] save error:', err);
      setFormError(err.message || 'Failed to save contract');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c) {
    if (!window.confirm(`Delete contract for "${c.vendor_name}"? This cannot be undone.`)) return;
    const prev = contracts;
    setContracts(list => list.filter(x => x.id !== c.id));
    try {
      await deleteContract(c.id);
    } catch (err) {
      console.error('[ContractTracking] delete error:', err);
      setContracts(prev);
      window.alert(`Failed to delete: ${err.message || 'unknown error'}`);
    }
  }

  return (
    <div className="operations-module">
      <div className="ops-toolbar">
        <div className="ops-toolbar-left">
          <Link to="/operations" className="ops-back-btn"><ArrowLeft size={14} /> Operations</Link>
          <img src="/apt-logo.jpg" alt="APT" className="ops-toolbar-logo" />
          <h1 className="ops-toolbar-title">Contract Tracking</h1>
        </div>
        <div className="ops-toolbar-right">
          {lastRefresh && (
            <span className="ops-last-refresh">
              Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button className="ops-export-btn" onClick={handleDownloadTemplate}>
            <FileDown size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            Template
          </button>
          <button className="ops-export-btn" onClick={handleImportClick} disabled={importing}>
            <Upload size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            {importing ? 'Importing...' : 'Import Excel'}
          </button>
          <button className="ops-export-btn" onClick={handleExport} disabled={exporting || loading}>
            <Download size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
          <button className="ops-export-btn" onClick={handleExportPDF} disabled={exportingPdf || loading || contracts.length === 0}>
            <FileText size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            {exportingPdf ? 'Exporting...' : 'Export PDF'}
          </button>
          <button className="ops-refresh-btn" onClick={handleRefresh} disabled={refreshing || loading}>
            <RefreshCw size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="ops-add-btn" onClick={openAdd}>
            <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
            Add Contract
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>
      </div>

      <div className="ops-section">
        <div className="ops-section-header">
          <h2 className="ops-section-title">Vendor Contracts</h2>
          <span className="ops-section-count">{contracts.length}</span>
        </div>

        {loading ? (
          <div className="ops-loading">Loading contracts…</div>
        ) : error ? (
          <div className="ops-error">
            <span>Error: {error}</span>
            <button onClick={load}>Retry</button>
          </div>
        ) : contracts.length === 0 ? (
          <div className="ops-empty">
            No contracts yet. Click <strong>+ Add Contract</strong> to create one.
          </div>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table ops-contract-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Monthly</th>
                  <th>Yearly</th>
                  <th>Notice (days)</th>
                  <th>Auto-Renew</th>
                  <th>Cancelled</th>
                  <th>Link</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {contracts.map(c => {
                  const expiring = isExpiringSoon(c);
                  return (
                    <tr key={c.id} className={c.cancelled ? 'ops-row-cancelled' : ''}>
                      <td>
                        <div className="ops-contract-vendor">
                          <span>{c.vendor_name}</span>
                          {expiring && <span className="ops-badge-warn">Expiring Soon</span>}
                        </div>
                      </td>
                      <td>{fmtDate(c.contract_start_date)}</td>
                      <td>{fmtDate(c.contract_end_date)}</td>
                      <td>{fmtMoney(c.monthly_cost)}</td>
                      <td>{fmtMoney(c.yearly_cost)}</td>
                      <td>{c.notice_period_days ?? ''}</td>
                      <td>{c.auto_renewing ? 'Yes' : 'No'}</td>
                      <td>{c.cancelled ? 'Yes' : 'No'}</td>
                      <td className="ops-contract-link-cell">
                        {c.contract_link ? (
                          isHttpUrl(c.contract_link) ? (
                            <a href={c.contract_link} target="_blank" rel="noopener noreferrer" className="ops-bh-link">
                              <ExternalLink size={12} style={{ verticalAlign: -1, marginRight: 3 }} />
                              Open
                            </a>
                          ) : (
                            <span title={c.contract_link}>{c.contract_link}</span>
                          )
                        ) : ''}
                      </td>
                      <td className="ops-table-actions">
                        <button className="ops-icon-btn" onClick={() => openEdit(c)} title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button className="ops-icon-btn ops-icon-btn-danger" onClick={() => handleDelete(c)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="ops-contract-modal-overlay" onClick={closeModal}>
          <div className="ops-contract-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="ops-contract-modal-title">
              {editing ? 'Edit Contract' : 'Add Contract'}
            </h3>
            <form onSubmit={handleSave} className="ops-contract-modal-form">
              <label className="ops-contract-field ops-contract-field-full">
                <span>Vendor Name *</span>
                <input
                  type="text"
                  value={form.vendor_name}
                  onChange={e => setField('vendor_name', e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label className="ops-contract-field">
                <span>Contract Start</span>
                <input
                  type="date"
                  value={form.contract_start_date}
                  onChange={e => setField('contract_start_date', e.target.value)}
                />
              </label>

              <label className="ops-contract-field">
                <span>Contract End</span>
                <input
                  type="date"
                  value={form.contract_end_date}
                  onChange={e => setField('contract_end_date', e.target.value)}
                />
              </label>

              <label className="ops-contract-field">
                <span>Monthly Cost ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.monthly_cost}
                  onChange={e => setField('monthly_cost', e.target.value)}
                />
              </label>

              <label className="ops-contract-field">
                <span>Yearly Cost ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.yearly_cost}
                  onChange={e => setField('yearly_cost', e.target.value)}
                />
              </label>

              <label className="ops-contract-field">
                <span>Notice Period (days)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.notice_period_days}
                  onChange={e => setField('notice_period_days', e.target.value)}
                />
              </label>

              <label className="ops-contract-field ops-contract-field-checkbox">
                <input
                  type="checkbox"
                  checked={form.auto_renewing}
                  onChange={e => setField('auto_renewing', e.target.checked)}
                />
                <span>Auto-Renewing</span>
              </label>

              <label className="ops-contract-field ops-contract-field-checkbox">
                <input
                  type="checkbox"
                  checked={form.cancelled}
                  onChange={e => setField('cancelled', e.target.checked)}
                />
                <span>Cancelled</span>
              </label>

              <label className="ops-contract-field ops-contract-field-full">
                <span>Contract Link</span>
                <input
                  type="text"
                  placeholder="https://..."
                  value={form.contract_link}
                  onChange={e => setField('contract_link', e.target.value)}
                />
              </label>

              {formError && <div className="ops-contract-modal-error">{formError}</div>}

              <div className="ops-contract-modal-actions">
                <button type="button" className="ops-contract-modal-cancel" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="ops-contract-modal-save" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
