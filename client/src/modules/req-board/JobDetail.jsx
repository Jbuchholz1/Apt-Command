import { useState, useEffect, useRef } from 'react';
import { getJobDetail, addJobNote, updateSubmissionInBullhorn, updateJobInBullhorn, updateSubmissionOverride } from '../../lib/api';
import { saveWithToast } from '../../lib/saveWithToast';
import { useEditingSignal } from './EditingContext';
import StatusBadge from './StatusBadge';
import EditableSelect from './EditableSelect';

const SUBMISSION_STATUS_OPTIONS = [
  'Client Submission', 'Internally Submitted', 'Candidate Interested',
  'Phone Interview', 'Interview Scheduled', 'In Person Interview',
  'Second Interview', 'Final Interview', 'Interview Feedback',
  'Client Feedback', 'Offer Extended', 'Backout', 'Placed',
].map(s => ({ value: s, label: s }));

// Mirrors INTERVIEW_STATUSES on the server (server/routes/jobs.js). Keep
// both in sync when a new interview-flavor status is added in Bullhorn.
const INTERVIEW_STATUS_SET = new Set([
  'Phone Interview',
  'Interview Scheduled',
  'Interview Feedback',
  'In Person Interview',
  'Final Interview',
  'Second Interview',
  'AI Interview Complete',
]);

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago',
  });
}

function formatCurrency(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

export default function JobDetail({ jobId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSuccess, setNoteSuccess] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    setNoteText('');
    setNoteSuccess(false);
    getJobDetail(jobId)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [jobId]);

  // Save a numeric compensation field back to Bullhorn and update local display
  const handleCompSave = async (bullhornField, displayKey, rawValue) => {
    // Accept "" or "—" as clear-to-null; otherwise coerce
    const trimmed = (rawValue ?? '').toString().trim();
    const payload = trimmed === '' ? null : Number(trimmed.replace(/[$,]/g, ''));
    if (payload !== null && Number.isNaN(payload)) {
      console.error(`Invalid number for ${bullhornField}:`, rawValue);
      return;
    }
    // Optimistic: show the new value immediately. If the save fails, revert.
    const previousValue = data?.job ? data.job[displayKey] : null;
    setData(prev => ({ ...prev, job: { ...prev.job, [displayKey]: payload } }));
    await saveWithToast(
      () => updateJobInBullhorn(jobId, { [bullhornField]: payload }),
      {
        failureMessage: `Could not save ${bullhornField}`,
        onRollback: () => {
          setData(prev => ({ ...prev, job: { ...prev.job, [displayKey]: previousValue } }));
        },
      },
    );
  };

  // Save a non-negative integer count field back to Bullhorn.
  // asString=true serializes the payload as a String for Bullhorn customText* fields.
  const handleIntSave = async (bullhornField, displayKey, rawValue, { asString = false } = {}) => {
    const trimmed = (rawValue ?? '').toString().trim();
    let payload;
    if (trimmed === '') {
      payload = asString ? '' : null;
    } else {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) return; // ignore invalid draft
      payload = asString ? String(n) : n;
    }
    const previousValue = data?.job ? data.job[displayKey] : null;
    setData(prev => ({ ...prev, job: { ...prev.job, [displayKey]: payload } }));
    await saveWithToast(
      () => updateJobInBullhorn(jobId, { [bullhornField]: payload }),
      {
        failureMessage: `Could not save ${bullhornField}`,
        onRollback: () => {
          setData(prev => ({ ...prev, job: { ...prev.job, [displayKey]: previousValue } }));
        },
      },
    );
  };

  // Toggle the Bullhorn isOpen boolean. Closing causes the row to vanish from
  // the main board on next refresh, since /api/req-board/jobs filters on isOpen=true.
  const handleOpenClosedSave = async (nextIsOpen) => {
    const previous = data?.job?.isOpen;
    setData(prev => ({ ...prev, job: { ...prev.job, isOpen: nextIsOpen } }));
    await saveWithToast(
      () => updateJobInBullhorn(jobId, { isOpen: nextIsOpen }),
      {
        failureMessage: 'Could not change Open/Closed',
        onRollback: () => {
          setData(prev => ({ ...prev, job: { ...prev.job, isOpen: previous } }));
        },
      },
    );
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || noteSaving) return;
    setNoteSaving(true);
    setNoteSuccess(false);
    const { ok } = await saveWithToast(
      () => addJobNote(jobId, noteText.trim()),
      { failureMessage: 'Could not add note' },
    );
    if (ok) {
      setNoteText('');
      setNoteSuccess(true);
      // Reload to show new note
      try {
        const refreshed = await getJobDetail(jobId);
        setData(refreshed);
      } catch (err) {
        // Note was saved; only the refresh failed — surface but don't clobber success.
        console.error('Note saved but refresh failed:', err);
      }
      setTimeout(() => setNoteSuccess(false), 3000);
    }
    setNoteSaving(false);
  };

  if (!jobId) return null;

  return (
    <div className="job-detail-overlay" onClick={onClose}>
      <div className="job-detail-panel" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <h2>{loading ? 'Loading...' : data?.job?.title || 'Job Detail'}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {error && <div className="detail-error">Error: {error}</div>}

        {loading && <div className="detail-loading">Loading job details...</div>}

        {!loading && data?.job && (
          <>
            <div className="detail-meta">
              <StatusBadge status={data.job.status} />
              {data.job.priority && (
                <span className="detail-priority">Priority {data.job.priority}</span>
              )}
              <span className="detail-type">{data.job.employmentType}</span>
              <span className="detail-type">Req# {data.job.id}</span>
            </div>

            <div className="detail-grid">
              <DetailRow label="Client" value={data.job.client} />
              <DetailRow label="Client Contact" value={data.job.clientContact} />
              <DetailRow label="Owner (AM)" value={data.job.owner} />
              <DetailRow label="Recruiter (TR)" value={data.job.recruiter || '—'} />
              <DetailRow label="Location" value={
                [data.job.city, data.job.state].filter(Boolean).join(', ') || '—'
              } />
              <DetailRow label="Remote" value={data.job.remote} />
              <EditableSelectRow
                label="Open / Closed"
                value={data.job.isOpen ? 'Open' : 'Closed'}
                options={[{ value: 'Open', label: 'Open' }, { value: 'Closed', label: 'Closed' }]}
                onSave={(v) => handleOpenClosedSave(v === 'Open')}
              />
              <EditableIntRow
                label="# Openings"
                value={data.job.numOpenings}
                onSave={(v) => handleIntSave('numOpenings', 'numOpenings', v)}
              />
              <EditableIntRow
                label="# Filled"
                value={data.job.filled}
                onSave={(v) => handleIntSave('customText2', 'filled', v, { asString: true })}
              />
              <EditableIntRow
                label="# Washed"
                value={data.job.washed}
                onSave={(v) => handleIntSave('customText3', 'washed', v, { asString: true })}
              />
              <EditableIntRow
                label="# Lost"
                value={data.job.lost}
                onSave={(v) => handleIntSave('customText4', 'lost', v, { asString: true })}
              />
              <DetailRow label="Category" value={data.job.staffingOrProject} />
              <DetailRow label="Follow Up" value={data.job.followUp || '—'} />
              <DetailRow label="Deadline" value={data.job.deadline || '—'} />
            </div>

            <div className="detail-section">
              <h3>Compensation</h3>
              <div className="detail-grid">
                <EditableNumberRow
                  label="Pay Rate"
                  value={data.job.payRate}
                  suffix="/hr"
                  onSave={(v) => handleCompSave('payRate', 'payRate', v)}
                />
                <EditableNumberRow
                  label="Bill Rate"
                  value={data.job.billRate}
                  suffix="/hr"
                  onSave={(v) => handleCompSave('clientBillRate', 'billRate', v)}
                />
                <EditableNumberRow
                  label="Salary Low"
                  value={data.job.salary}
                  onSave={(v) => handleCompSave('salary', 'salary', v)}
                />
                <EditableNumberRow
                  label="Salary High"
                  value={data.job.salaryHigh}
                  onSave={(v) => handleCompSave('customFloat1', 'salaryHigh', v)}
                />
                <DetailRow label="CE $ (Weekly)" value={data.job.ceSpread ? formatCurrency(data.job.ceSpread) : null} />
                <DetailRow label="Perm Fee" value={data.job.permFee ? formatCurrency(data.job.permFee) : null} />
                <DetailRow label="Fee %" value={data.job.feePercent ? `${(data.job.feePercent * 100).toFixed(0)}%` : null} />
                <DetailRow label="Deal Value" value={formatCurrency(data.job.dealValue)} />
              </div>
            </div>

            <div className="detail-section">
              <h3>Dates</h3>
              <div className="detail-grid">
                <DetailRow label="Date Added" value={formatDate(data.job.dateAdded)} />
                <DetailRow label="Start Date" value={formatDate(data.job.startDate)} />
                <DetailRow label="Est. End Date" value={formatDate(data.job.estimatedEndDate)} />
              </div>
            </div>

            {(() => {
              // Strict bucket: only candidates currently in 'Client Submission'
              // status. Interview-stage candidates appear in the Interviews
              // section below, so the two boxes are mutually exclusive.
              const clientSubs = (data.submissions?.data || []).filter(
                s => s.status === 'Client Submission'
              );
              return (
                <div className="detail-section">
                  <h3>Submissions ({clientSubs.length})</h3>
                  {clientSubs.length > 0 ? (
                    <table className="submissions-table">
                      <thead>
                        <tr>
                          <th>Candidate</th>
                          <th>TR</th>
                          <th>Status</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientSubs.map(sub => (
                          <tr key={sub.id}>
                            <td>{sub.candidate || '—'}</td>
                            <td>{sub.sendingUser || '—'}</td>
                            <EditableSelect
                              value={sub.status || ''}
                              displayValue={sub.status || '—'}
                              options={SUBMISSION_STATUS_OPTIONS}
                              onSave={async (val) => {
                                // Optimistic: update the row right away so the
                                // dropdown snaps to the chosen value without lag.
                                const previousStatus = sub.status;
                                setData(prev => ({
                                  ...prev,
                                  submissions: {
                                    ...prev.submissions,
                                    data: prev.submissions.data.map(s =>
                                      s.id === sub.id ? { ...s, status: val } : s
                                    ),
                                  },
                                }));
                                await saveWithToast(
                                  () => updateSubmissionInBullhorn(sub.id, { status: val }),
                                  {
                                    failureMessage: 'Could not update submission status',
                                    onRollback: () => {
                                      setData(prev => ({
                                        ...prev,
                                        submissions: {
                                          ...prev.submissions,
                                          data: prev.submissions.data.map(s =>
                                            s.id === sub.id ? { ...s, status: previousStatus } : s
                                          ),
                                        },
                                      }));
                                    },
                                  },
                                );
                              }}
                              className="cell-editable"
                            />
                            <td>{formatDate(sub.dateAdded)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="no-subs">No submissions yet</p>
                  )}
                </div>
              );
            })()}

            {(() => {
              const interviews = (data.submissions?.data || []).filter(
                s => INTERVIEW_STATUS_SET.has(s.status)
              );
              const toggleRejected = async (sub, next) => {
                const previousRejected = !!sub.rejected;
                setData(prev => ({
                  ...prev,
                  submissions: {
                    ...prev.submissions,
                    data: prev.submissions.data.map(s =>
                      s.id === sub.id ? { ...s, rejected: next } : s
                    ),
                  },
                }));
                await saveWithToast(
                  () => updateSubmissionOverride(sub.id, { rejected: next }),
                  {
                    failureMessage: 'Could not update Rejected flag',
                    onRollback: () => {
                      setData(prev => ({
                        ...prev,
                        submissions: {
                          ...prev.submissions,
                          data: prev.submissions.data.map(s =>
                            s.id === sub.id ? { ...s, rejected: previousRejected } : s
                          ),
                        },
                      }));
                    },
                  },
                );
              };
              return (
                <div className="detail-section">
                  <h3>Interviews ({interviews.length})</h3>
                  {interviews.length > 0 ? (
                    <table className="submissions-table">
                      <thead>
                        <tr>
                          <th>Candidate</th>
                          <th>TR</th>
                          <th>Status</th>
                          <th>Date</th>
                          <th style={{ width: '70px', textAlign: 'center' }}>Rejected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {interviews.map(sub => (
                          <tr
                            key={sub.id}
                            className={sub.rejected ? 'sub-rejected' : ''}
                          >
                            <td>{sub.candidate || '—'}</td>
                            <td>{sub.sendingUser || '—'}</td>
                            <EditableSelect
                              value={sub.status || ''}
                              displayValue={sub.status || '—'}
                              options={SUBMISSION_STATUS_OPTIONS}
                              onSave={async (val) => {
                                const previousStatus = sub.status;
                                setData(prev => ({
                                  ...prev,
                                  submissions: {
                                    ...prev.submissions,
                                    data: prev.submissions.data.map(s =>
                                      s.id === sub.id ? { ...s, status: val } : s
                                    ),
                                  },
                                }));
                                await saveWithToast(
                                  () => updateSubmissionInBullhorn(sub.id, { status: val }),
                                  {
                                    failureMessage: 'Could not update interview status',
                                    onRollback: () => {
                                      setData(prev => ({
                                        ...prev,
                                        submissions: {
                                          ...prev.submissions,
                                          data: prev.submissions.data.map(s =>
                                            s.id === sub.id ? { ...s, status: previousStatus } : s
                                          ),
                                        },
                                      }));
                                    },
                                  },
                                );
                              }}
                              className="cell-editable"
                            />
                            <td>{formatDate(sub.dateAdded)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={!!sub.rejected}
                                onChange={e => toggleRejected(sub, e.target.checked)}
                                title="Mark this candidate as rejected — row will be greyed out"
                                style={{ cursor: 'pointer' }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="no-subs">No interviews yet</p>
                  )}
                </div>
              );
            })()}

            <div className="detail-section">
              <h3>Notes</h3>
              <textarea
                className="note-textarea"
                placeholder="Type a note..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={3}
              />
              <div className="note-actions">
                <button
                  className="note-save-btn"
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || noteSaving}
                >
                  {noteSaving ? 'Saving...' : 'Add Note'}
                </button>
                {noteSuccess && <span className="note-success">Note saved</span>}
              </div>
              {data.notes && data.notes.length > 0 && (
                <div className="notes-list">
                  {data.notes.map(note => (
                    <div key={note.id} className="note-item">
                      <div className="note-meta">
                        <span className="note-author">{note.created_by}</span>
                        <span className="note-date">{formatDate(note.created_at)}</span>
                      </div>
                      <div className="note-text">{note.comment}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value ?? '—'}</span>
    </div>
  );
}

/**
 * Click-to-edit numeric row for compensation fields (pay rate, bill rate, salaries).
 * Displays formatted currency in view mode; shows a plain-number input in edit mode.
 * Enter or blur saves; Escape cancels.
 */
function EditableNumberRow({ label, value, suffix, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const inputRef = useRef(null);
  useEditingSignal(editing);

  useEffect(() => {
    setDraft(value == null ? '' : String(value));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const originalStr = value == null ? '' : String(value);
    if (draft !== originalStr) onSave(draft);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { setDraft(value == null ? '' : String(value)); setEditing(false); }
  };

  const display = value != null
    ? `${formatCurrency(value)}${suffix || ''}`
    : '—';

  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          step="any"
          className="detail-edit-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
        />
      ) : (
        <span
          className="detail-value detail-editable"
          title="Click to edit"
          onClick={() => setEditing(true)}
        >
          {display}
        </span>
      )}
    </div>
  );
}

/**
 * Click-to-edit row for non-negative integer counts (# Openings / Filled / Washed / Lost).
 * Same UX as EditableNumberRow but with integer-only input and no currency formatting.
 */
function EditableIntRow({ label, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const inputRef = useRef(null);
  useEditingSignal(editing);

  useEffect(() => {
    setDraft(value == null ? '' : String(value));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const originalStr = value == null ? '' : String(value);
    if (draft === originalStr) return;
    if (draft !== '') {
      const n = Number(draft);
      if (!Number.isInteger(n) || n < 0) {
        setDraft(originalStr);
        return;
      }
    }
    onSave(draft);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { setDraft(value == null ? '' : String(value)); setEditing(false); }
  };

  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="1"
          className="detail-edit-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
        />
      ) : (
        <span
          className="detail-value detail-editable"
          title="Click to edit"
          onClick={() => setEditing(true)}
        >
          {value ?? '—'}
        </span>
      )}
    </div>
  );
}

/**
 * Click-to-edit dropdown row for the detail grid.
 * Unlike the table-cell EditableSelect, this renders div-based rows that fit
 * the detail-grid layout.
 */
function EditableSelectRow({ label, value, options, onSave }) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef(null);
  useEditingSignal(editing);

  useEffect(() => {
    if (editing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [editing]);

  const commit = (newValue) => {
    setEditing(false);
    if (newValue !== value) onSave(newValue);
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') setEditing(false);
  };

  const displayLabel = options.find(o => o.value === value)?.label ?? '—';

  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      {editing ? (
        <select
          ref={selectRef}
          className="detail-edit-input"
          value={value ?? ''}
          onChange={e => commit(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={handleKey}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <span
          className="detail-value detail-editable"
          title="Click to edit"
          onClick={() => setEditing(true)}
        >
          {displayLabel}
        </span>
      )}
    </div>
  );
}
