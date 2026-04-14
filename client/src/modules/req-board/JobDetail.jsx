import { useState, useEffect } from 'react';
import { getJobDetail, addJobNote, updateSubmissionInBullhorn } from '../../lib/api';
import StatusBadge from './StatusBadge';
import EditableSelect from './EditableSelect';

const SUBMISSION_STATUS_OPTIONS = [
  'Client Submission', 'Internally Submitted', 'Candidate Interested',
  'Client Feedback', 'Interview Feedback', 'Offer Extended', 'Backout',
].map(s => ({ value: s, label: s }));

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

  const handleAddNote = async () => {
    if (!noteText.trim() || noteSaving) return;
    setNoteSaving(true);
    setNoteSuccess(false);
    try {
      await addJobNote(jobId, noteText.trim());
      setNoteText('');
      setNoteSuccess(true);
      // Reload to show new note
      const refreshed = await getJobDetail(jobId);
      setData(refreshed);
      setTimeout(() => setNoteSuccess(false), 3000);
    } catch (err) {
      setError(`Note failed: ${err.message}`);
    } finally {
      setNoteSaving(false);
    }
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
              <DetailRow label="# Openings" value={data.job.numOpenings} />
              <DetailRow label="# Filled" value={data.job.filled} />
              <DetailRow label="# Washed" value={data.job.washed} />
              <DetailRow label="# Lost" value={data.job.lost} />
              <DetailRow label="Category" value={data.job.staffingOrProject} />
              <DetailRow label="Follow Up" value={data.job.followUp || '—'} />
              <DetailRow label="Deadline" value={data.job.deadline || '—'} />
            </div>

            <div className="detail-section">
              <h3>Compensation</h3>
              <div className="detail-grid">
                <DetailRow label="Pay Rate" value={data.job.payRate ? `${formatCurrency(data.job.payRate)}/hr` : null} />
                <DetailRow label="Bill Rate" value={data.job.billRate ? `${formatCurrency(data.job.billRate)}/hr` : null} />
                <DetailRow label="Salary Low" value={formatCurrency(data.job.salary)} />
                <DetailRow label="Salary High" value={formatCurrency(data.job.salaryHigh)} />
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

            <div className="detail-section">
              <h3>Submissions ({data.submissions?.total || 0})</h3>
              {data.submissions?.total > 0 ? (
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
                    {data.submissions.data.map(sub => (
                      <tr key={sub.id}>
                        <td>{sub.candidate || '—'}</td>
                        <td>{sub.sendingUser || '—'}</td>
                        <EditableSelect
                          value={sub.status || ''}
                          displayValue={sub.status || '—'}
                          options={SUBMISSION_STATUS_OPTIONS}
                          onSave={async (val) => {
                            try {
                              await updateSubmissionInBullhorn(sub.id, { status: val });
                              setData(prev => ({
                                ...prev,
                                submissions: {
                                  ...prev.submissions,
                                  data: prev.submissions.data.map(s =>
                                    s.id === sub.id ? { ...s, status: val } : s
                                  ),
                                },
                              }));
                            } catch (err) {
                              console.error('Failed to update submission status:', err);
                            }
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
