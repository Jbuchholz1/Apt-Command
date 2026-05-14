import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import StatusBadge from './StatusBadge';
import EditableCell from './EditableCell';
import EditableSelect from './EditableSelect';
import EditableDate from './EditableDate';
import { updateJobOverrides, updateJobInBullhorn } from '../../lib/api';
import { useUserLookups } from '../../lib/useUserLookups';
import { saveWithToast } from '../../lib/saveWithToast';
import { useEditing } from './EditingContext';
import { getDeadlineUrgency, getFollowUpUrgency, getTrUrgency } from './lib/urgency';
import { isUnpublished } from './lib/redBox';

const PRIORITY_COLORS = {
  A: { bg: '#16a34a', text: '#fff' },
  B: { bg: '#eab308', text: '#1e293b' },
  C: { bg: '#94a3b8', text: '#1e293b' },
};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const y = String(d.getFullYear()).slice(-2);
  return `${m}/${day}/${y}`;
}

function formatLocation(city, state) {
  if (city && state) return `${city}, ${state}`;
  return city || state || '—';
}

function formatCurrency(val) {
  if (val == null) return '—';
  return `$${Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

const DEADLINE_STYLES = {
  red: { backgroundColor: '#dc2626', color: '#fff' },
  yellow: { backgroundColor: '#fef08a', color: '#854d0e' },
  green: { backgroundColor: '#dcfce7', color: '#166534' },
};

const FOLLOWUP_STYLES = {
  red: { backgroundColor: '#dc2626', color: '#fff' },
  yellow: { backgroundColor: '#fef08a', color: '#854d0e' },
  green: { backgroundColor: '#dcfce7', color: '#166534' },
};

const TR_STYLES = {
  red: { backgroundColor: '#dc2626', color: '#fff' },
  yellow: { backgroundColor: '#fef08a', color: '#854d0e' },
};

const STATUS_OPTIONS = [
  'Accepting Candidates', 'Covered', 'Offer Out', 'Placed', 'Filled', 'Lost', 'Wash', 'Archive',
].map(s => ({ value: s, label: s }));

const TYPE_OPTIONS = [
  'Direct Hire', 'Contract', 'Contract To Hire', 'Project',
].map(s => ({ value: s, label: s }));

const TYPE_ABBREV = {
  'Contract': 'CON',
  'Direct Hire': 'DR',
  'Contract To Hire': 'C2H',
  'Project': 'SOW',
};

const REMOTE_OPTIONS = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'Hybrid', label: 'Hybrid' },
];

const PRIORITY_OPTIONS = [
  { value: '1', label: 'A' },
  { value: '2', label: 'B' },
  { value: '3', label: 'C' },
];

const COLUMNS = [
  { key: 'aptIndia', label: 'Apt India', sortable: true, width: '70px' },
  { key: 'priority', label: 'Pri', sortable: true, width: '42px' },
  { key: 'calledShot', label: 'CS', sortable: true, width: '36px' },
  { key: 'dateAdded', label: 'Date', sortable: true, width: '70px' },
  { key: 'ownerInitials', label: 'AM', sortable: true, width: '50px', editType: 'select', bullhornField: 'owner' },
  { key: 'recruiter', label: 'TR', sortable: true, width: '60px', editType: 'select', bullhornField: 'assignedUsers' },
  { key: 'fortyEightHr', label: '48 hr', sortable: true, width: '70px', editable: true },
  { key: 'title', label: 'Job Title', sortable: true, width: '140px' },
  { key: 'client', label: 'Client', sortable: true, width: '50px' },
  { key: 'status', label: 'Status', sortable: true, width: '55px', editType: 'select', bullhornField: 'status' },
  { key: 'notes', label: 'Notes', sortable: true, width: '175px', editable: true },
  { key: 'deadline', label: 'Deadline', sortable: true, width: '110px', editable: true },
  { key: 'followUp', label: 'Follow Up', sortable: true, width: '120px', editable: true },
  { key: 'numOpenings', label: '# Op', sortable: true, width: '45px' },
  { key: 'clientSubs', label: '# CS', sortable: true, width: '45px' },
  { key: 'brSalary', label: 'PrBr/Salary LH', sortable: true, width: '130px' },
  { key: 'ceSpread', label: 'CE $', sortable: true, width: '70px' },
  { key: 'permFee', label: 'Perm $', sortable: true, width: '75px' },
  { key: 'clientContact', label: 'Manager', sortable: true, width: '100px' },
  { key: 'employmentType', label: 'Type', sortable: true, width: '55px', editType: 'select', bullhornField: 'employmentType' },
  { key: 'remote', label: 'Remote', sortable: true, width: '75px', editType: 'select', bullhornField: 'customText1' },
];

// Maps column keys to the API field names for overrides
const OVERRIDE_FIELD_MAP = {
  notes: 'notes',
  followUp: 'follow_up',
  deadline: 'deadline',
  coverageNeeded: 'coverage_needed',
  calledShot: 'called_shot',
  fortyEightHr: 'forty_eight_hr',
  aptIndia: 'apt_india',
};

const COVERAGE_OPTIONS = [
  { value: 'Y', label: 'Y' },
  { value: 'N', label: 'N' },
];

export default function ReqBoard({ jobs, loading, onSelectJob, selectedJobId, onJobUpdated, onOverrideVersionUpdated, onConflict }) {
  const [sort, setSort] = useState({ key: 'dateAdded', dir: 'desc' });
  const { users, recruiters, accountManagers } = useUserLookups();

  const { startEditing, stopEditing } = useEditing();

  // --- Optimistic save infrastructure ---
  //
  // Two problems we're solving:
  //   (a) Waiting for the round-trip before showing the user's edit makes
  //       every save feel laggy (~500ms–2s per save).
  //   (b) Two rapid same-user edits to the same job send the same
  //       If-Match version (React state hasn't caught up with save #1's
  //       response when save #2 fires), so the server returns a spurious
  //       409 on save #2 — the user collides with themselves.
  //
  // Solutions:
  //   1. Update the local jobs array IMMEDIATELY on commit (optimistic),
  //      then save in the background. On failure, revert.
  //   2. Chain saves per-job: each queued save awaits the previous one's
  //      response and reads the latest version from a ref that tracks
  //      the most recent server-known version for that job.
  //   3. Signal the EditingContext while saves are in flight so the
  //      auto-refresh interval pauses until the chain drains.
  const latestVersionRef = useRef({});      // jobId -> most recent server version
  const saveChainsRef = useRef(new Map());  // jobId -> tail Promise of the chain
  const inFlightCountRef = useRef(0);

  // Keep latestVersionRef in sync with incoming props, but monotonic: a
  // background refresh that briefly returns an older cached version must
  // not regress the ref past what our own saves have already bumped to.
  useEffect(() => {
    for (const j of (jobs || [])) {
      if (typeof j.overrideVersion === 'number') {
        const existing = latestVersionRef.current[j.id];
        if (existing === undefined || j.overrideVersion > existing) {
          latestVersionRef.current[j.id] = j.overrideVersion;
        }
      }
    }
  }, [jobs]);

  // Queue work per-job so same-row edits serialize naturally. Different
  // jobs still save in parallel. We also flag the board-wide EditingContext
  // so the auto-refresh skips ticks while saves are draining.
  const chainPerJob = useCallback((jobId, fn) => {
    inFlightCountRef.current += 1;
    if (inFlightCountRef.current === 1) startEditing();
    const prev = saveChainsRef.current.get(jobId) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn).finally(() => {
      inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
      if (inFlightCountRef.current === 0) stopEditing();
      if (saveChainsRef.current.get(jobId) === next) {
        saveChainsRef.current.delete(jobId);
      }
    });
    saveChainsRef.current.set(jobId, next);
  }, [startEditing, stopEditing]);

  const handleSort = useCallback((key) => {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  }, []);

  const handleOverrideSave = useCallback((jobId, field, value) => {
    const apiField = OVERRIDE_FIELD_MAP[field];
    if (!apiField) return;

    const job = (jobs || []).find(j => j.id === jobId);
    const previousValue = job ? job[field] : undefined;

    // 1. Optimistic: show the edit right now so rapid typing feels instant.
    if (onJobUpdated) onJobUpdated(jobId, field, value);

    chainPerJob(jobId, async () => {
      // Read the latest known version AFTER any prior chained save for this
      // job has settled and updated the ref.
      const expectedVersion = latestVersionRef.current[jobId];

      const { ok, data, error } = await saveWithToast(
        () => updateJobOverrides(jobId, { [apiField]: value }, { expectedVersion }),
        {
          failureMessage: `Could not save ${field}`,
          onRollback: () => {
            // Revert the optimistic change so the UI matches the server.
            if (onJobUpdated) onJobUpdated(jobId, field, previousValue);
          },
          onConflict: (err) => {
            if (onConflict) onConflict({ jobId, field, current: err?.current || null });
          },
        },
      );

      if (ok && data?.data?.version !== undefined) {
        latestVersionRef.current[jobId] = data.data.version;
        // Reassert the optimistic value in case a prior chained save failed
        // and its rollback clobbered our field.
        if (onJobUpdated) onJobUpdated(jobId, field, value);
        if (onOverrideVersionUpdated) onOverrideVersionUpdated(jobId, data.data);
      } else if (!ok && error?.status === 409 && error.current?.version !== undefined) {
        // Real conflict from another user — accept the server's version as
        // the new baseline so the user can retry without hitting 409 again
        // for the same stale-version reason.
        latestVersionRef.current[jobId] = error.current.version;
        if (onOverrideVersionUpdated) onOverrideVersionUpdated(jobId, error.current);
      }
    });
  }, [jobs, onJobUpdated, onOverrideVersionUpdated, onConflict, chainPerJob]);

  const handleBullhornSave = useCallback((job, col, rawValue) => {
    const bhField = col.bullhornField;
    if (!bhField) return;

    const now = new Date().toISOString();

    // Special case: ZZ / * recruiter — writes to overrides, not Bullhorn.
    if (bhField === 'assignedUsers' && (rawValue === 'ZZ' || rawValue === '*')) {
      const hadPreviousRecruiter = !!(job.recruiter && job.recruiter.trim() && job.recruiter !== 'ZZ');
      const previousRecruiter = job.recruiter;
      const previousTrAssignedAt = job.trAssignedAt;
      const previousTrReassigned = job.trReassigned;

      if (onJobUpdated) {
        onJobUpdated(job.id, 'recruiter', rawValue);
        onJobUpdated(job.id, 'trAssignedAt', now);
        if (hadPreviousRecruiter) onJobUpdated(job.id, 'trReassigned', true);
      }

      chainPerJob(job.id, async () => {
        const expectedVersion = latestVersionRef.current[job.id];
        const { ok, data, error } = await saveWithToast(
          () => updateJobOverrides(job.id, {
            recruiter: rawValue,
            tr_reassigned: hadPreviousRecruiter ? '1' : undefined,
            tr_assigned_at: now,
          }, { expectedVersion }),
          {
            failureMessage: 'Could not reassign recruiter',
            onRollback: () => {
              if (onJobUpdated) {
                onJobUpdated(job.id, 'recruiter', previousRecruiter);
                onJobUpdated(job.id, 'trAssignedAt', previousTrAssignedAt);
                onJobUpdated(job.id, 'trReassigned', previousTrReassigned);
              }
            },
            onConflict: (err) => {
              if (onConflict) onConflict({ jobId: job.id, field: 'recruiter', current: err?.current || null });
            },
          },
        );
        if (ok && data?.data?.version !== undefined) {
          latestVersionRef.current[job.id] = data.data.version;
          if (onJobUpdated) {
            onJobUpdated(job.id, 'recruiter', rawValue);
            onJobUpdated(job.id, 'trAssignedAt', now);
            if (hadPreviousRecruiter) onJobUpdated(job.id, 'trReassigned', true);
          }
          if (onOverrideVersionUpdated) onOverrideVersionUpdated(job.id, data.data);
        } else if (!ok && error?.status === 409 && error.current?.version !== undefined) {
          latestVersionRef.current[job.id] = error.current.version;
          if (onOverrideVersionUpdated) onOverrideVersionUpdated(job.id, error.current);
        }
      });
      return;
    }

    // Build bullhornValue + displayUpdates for the non-ZZ paths.
    let bullhornValue = rawValue;
    let displayUpdates = {};
    let secondaryOverridePayload = null; // for assignedUsers TR tracking

    if (bhField === 'assignedUsers') {
      const hadPreviousRecruiter = !!(job.recruiter && job.recruiter.trim() && job.recruiter !== 'ZZ');
      const userId = parseInt(rawValue, 10);
      const user = recruiters.find(u => u.id === userId);
      bullhornValue = { replaceAll: [userId] };
      displayUpdates = {
        recruiter: user?.initials || '',
        assignedUserIds: [userId],
        trAssignedAt: now,
      };
      if (hadPreviousRecruiter) displayUpdates.trReassigned = true;
      secondaryOverridePayload = hadPreviousRecruiter
        ? { recruiter: '', tr_reassigned: '1', tr_assigned_at: now }
        : { recruiter: '', tr_reassigned: '', tr_assigned_at: now };
    } else if (bhField === 'owner') {
      const userId = parseInt(rawValue, 10);
      const user = users.find(u => u.id === userId);
      bullhornValue = { id: userId };
      displayUpdates = {
        ownerInitials: user?.initials || '',
        owner: user?.name || '',
        ownerId: userId,
      };
    } else if (bhField === 'startDate' || bhField === 'estimatedEndDate') {
      bullhornValue = rawValue;
      displayUpdates = { [col.key]: rawValue ? new Date(rawValue).toISOString() : null };
    } else {
      // Simple string fields: status, employmentType, customText1
      displayUpdates = { [col.key]: rawValue };
    }

    // Capture previous values so we can revert each field on failure.
    const previousDisplay = {};
    for (const key of Object.keys(displayUpdates)) {
      previousDisplay[key] = job[key];
    }

    // Optimistic: apply display updates now.
    if (onJobUpdated) {
      for (const [field, val] of Object.entries(displayUpdates)) {
        onJobUpdated(job.id, field, val);
      }
    }

    chainPerJob(job.id, async () => {
      const { ok } = await saveWithToast(
        () => updateJobInBullhorn(job.id, { [bhField]: bullhornValue }),
        {
          failureMessage: `Could not update ${bhField}`,
          onRollback: () => {
            if (onJobUpdated) {
              for (const [field, prevVal] of Object.entries(previousDisplay)) {
                onJobUpdated(job.id, field, prevVal);
              }
            }
          },
        },
      );
      if (ok && onJobUpdated) {
        // Reassert optimistic values (may have been rolled back by a prior
        // failing save in the chain).
        for (const [field, val] of Object.entries(displayUpdates)) {
          onJobUpdated(job.id, field, val);
        }
      }
    });

    // Secondary override write (TR reassignment tracking) — chain after the
    // Bullhorn write so its version handshake uses the latest ref value.
    if (secondaryOverridePayload) {
      chainPerJob(job.id, async () => {
        const expectedVersion = latestVersionRef.current[job.id];
        const { ok, data } = await saveWithToast(
          () => updateJobOverrides(job.id, secondaryOverridePayload, { expectedVersion }),
          { failureMessage: 'Could not record recruiter assignment' },
        );
        if (ok && data?.data?.version !== undefined) {
          latestVersionRef.current[job.id] = data.data.version;
          if (onOverrideVersionUpdated) onOverrideVersionUpdated(job.id, data.data);
        }
      });
    }
  }, [recruiters, users, onJobUpdated, onOverrideVersionUpdated, onConflict, chainPerJob]);

  // Priority is JobOrder.type — int 1/2/3 in Bullhorn, displayed as A/B/C.
  const handlePrioritySave = useCallback((job, rawValue) => {
    const typeNum = rawValue ? parseInt(rawValue, 10) : null;
    const letterMap = { 1: 'A', 2: 'B', 3: 'C' };
    const newLetter = typeNum ? letterMap[typeNum] : null;
    const previousLetter = job.priority;

    if (onJobUpdated) onJobUpdated(job.id, 'priority', newLetter);

    chainPerJob(job.id, async () => {
      const { ok } = await saveWithToast(
        () => updateJobInBullhorn(job.id, { type: typeNum }),
        {
          failureMessage: 'Could not update priority',
          onRollback: () => {
            if (onJobUpdated) onJobUpdated(job.id, 'priority', previousLetter);
          },
        },
      );
      if (ok && onJobUpdated) {
        onJobUpdated(job.id, 'priority', newLetter);
      }
    });
  }, [onJobUpdated, chainPerJob]);

  // Pre-build the per-row option arrays once per user-list change. Without
  // these, every row's renderCell rebuilds a fresh array on every render —
  // which busts React.memo on the underlying EditableSelect.
  const recruiterOptions = useMemo(
    () => [
      ...recruiters.map(u => ({ value: String(u.id), label: u.initials })),
      { value: 'ZZ', label: 'ZZ' },
      { value: '*', label: '*' },
    ],
    [recruiters],
  );
  const accountManagerOptions = useMemo(
    () => accountManagers.map(u => ({ value: String(u.id), label: u.initials })),
    [accountManagers],
  );

  const sorted = useMemo(() => {
    if (!jobs) return [];
    const arr = [...jobs];
    arr.sort((a, b) => {
      let av, bv;
      if (sort.key === 'location') {
        av = formatLocation(a.city, a.state);
        bv = formatLocation(b.city, b.state);
      } else {
        av = a[sort.key];
        bv = b[sort.key];
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [jobs, sort]);

  const sortIcon = (key) => {
    if (sort.key !== key) return ' ↕';
    return sort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  if (loading && (!jobs || jobs.length === 0)) {
    return <div className="loading-state">Loading requisitions...</div>;
  }

  const renderCell = (job, col) => {
    // Local select dropdowns (saved to local DB only)
    if (col.editType === 'localSelect') {
      const covStyle = (col.key === 'coverageNeeded' && job[col.key] === 'Y')
        ? { backgroundColor: '#fef08a', color: '#854d0e' }
        : undefined;
      return (
        <EditableSelect
          key={col.key}
          value={job[col.key] || ''}
          displayValue={job[col.key] || '—'}
          options={COVERAGE_OPTIONS}
          onSave={(val) => handleOverrideSave(job.id, col.key, val)}
          className="cell-editable"
          cellStyle={covStyle}
        />
      );
    }

    // Editable free-text cells
    if (col.editable) {
      const placeholders = { notes: 'Notes', deadline: 'Deadline', followUp: 'Follow Up', fortyEightHr: '48 hr' };
      const placeholder = placeholders[col.key] || '';
      // Compute urgency coloring for deadline and follow-up
      let cellStyle;
      if (col.key === 'deadline') {
        cellStyle = DEADLINE_STYLES[getDeadlineUrgency(job.deadline)];
      } else if (col.key === 'followUp') {
        cellStyle = FOLLOWUP_STYLES[getFollowUpUrgency(job.followUp)];
      }
      const defaultTexts = { followUp: 'No Follow Up', deadline: 'No Deadline' };
      const extraClass = col.key === 'notes' ? ' cell-notes-wrap' : '';
      return (
        <EditableCell
          key={col.key}
          value={job[col.key]}
          placeholder={placeholder}
          onSave={(val) => handleOverrideSave(job.id, col.key, val)}
          className={`cell-editable${extraClass}`}
          cellStyle={cellStyle}
          defaultText={defaultTexts[col.key]}
          multiline={col.key === 'notes'}
        />
      );
    }

    // Bullhorn-editable select fields
    if (col.editType === 'select') {
      let options, currentValue, displayValue;
      if (col.bullhornField === 'assignedUsers') {
        options = recruiterOptions;
        if (job.recruiter === 'ZZ' || job.recruiter === '*') {
          currentValue = job.recruiter;
        } else {
          const firstAssigned = (job.assignedUserIds || [])[0];
          currentValue = firstAssigned ? String(firstAssigned) : '';
        }
        displayValue = job.recruiter || '—';
      } else if (col.bullhornField === 'owner') {
        options = accountManagerOptions;
        currentValue = String(job.ownerId || '');
        displayValue = job.ownerInitials || '—';
      } else if (col.bullhornField === 'status') {
        options = STATUS_OPTIONS;
        currentValue = job.status || '';
        displayValue = job.status ? <StatusBadge status={job.status} /> : '—';
      } else if (col.bullhornField === 'employmentType') {
        options = TYPE_OPTIONS;
        currentValue = job.employmentType || '';
        displayValue = TYPE_ABBREV[job.employmentType] || job.employmentType || '—';
      } else if (col.bullhornField === 'customText1') {
        options = REMOTE_OPTIONS;
        currentValue = job.remote || '';
        displayValue = job.remote || '—';
      }
      // TR cell color: red (48hrs no sub), yellow (reassigned within window)
      const trUrgency = col.bullhornField === 'assignedUsers' ? getTrUrgency(job) : null;
      const selectCellStyle = trUrgency ? TR_STYLES[trUrgency] : undefined;

      return (
        <EditableSelect
          key={col.key}
          value={currentValue}
          displayValue={displayValue}
          options={options}
          onSave={(val) => handleBullhornSave(job, col, val)}
          className="cell-editable"
          cellStyle={selectCellStyle}
        />
      );
    }

    // Bullhorn-editable date fields
    if (col.editType === 'date') {
      return (
        <EditableDate
          key={col.key}
          value={job[col.key]}
          onSave={(val) => handleBullhornSave(job, col, val)}
          className="cell-editable cell-date"
        />
      );
    }

    // Static cells
    switch (col.key) {
      case 'priority': {
        const priorityNum = job.priority === 'A' ? '1' : job.priority === 'B' ? '2' : job.priority === 'C' ? '3' : '';
        const priorityDisplay = job.priority ? (
          <span className="priority-badge" style={{
            backgroundColor: PRIORITY_COLORS[job.priority]?.bg || '#94a3b8',
            color: PRIORITY_COLORS[job.priority]?.text || '#fff',
          }}>{job.priority}</span>
        ) : '—';
        return (
          <EditableSelect
            key={col.key}
            value={priorityNum}
            displayValue={priorityDisplay}
            options={PRIORITY_OPTIONS}
            onSave={(val) => handlePrioritySave(job, val)}
            className="cell-editable"
          />
        );
      }
      case 'calledShot':
        return (
          <td key={col.key} style={{ textAlign: 'center' }}>
            <input
              type="checkbox"
              checked={!!job.calledShot}
              onChange={(e) => {
                e.stopPropagation();
                handleOverrideSave(job.id, 'calledShot', e.target.checked);
              }}
              onClick={e => e.stopPropagation()}
              title="Called Shot"
              style={{ cursor: 'pointer', accentColor: '#D3BF30' }}
            />
          </td>
        );
      case 'aptIndia':
        return (
          <td key={col.key} style={{ textAlign: 'center' }}>
            <input
              type="checkbox"
              checked={!!job.aptIndia}
              onChange={(e) => {
                e.stopPropagation();
                handleOverrideSave(job.id, 'aptIndia', e.target.checked);
              }}
              onClick={e => e.stopPropagation()}
              title="Apt India — flag this req for the India Req Board"
              style={{ cursor: 'pointer', accentColor: '#F26B38' }}
            />
          </td>
        );
      case 'id':
        return (
          <td key={col.key} className="cell-num">
            <a
              href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${job.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bh-link"
              onClick={e => e.stopPropagation()}
              title="Open in Bullhorn"
            >
              {job.id}
            </a>
          </td>
        );
      case 'dateAdded':
        return <td key={col.key} className="cell-date">{formatDate(job.dateAdded)}</td>;
      case 'title':
        return (
          <td key={col.key} className="cell-title cell-truncate" style={{ maxWidth: '140px' }} title={job.title || ''}>
            <a
              href={`https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm?Entity=JobOrder&id=${job.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bh-link"
              onClick={e => e.stopPropagation()}
            >
              {job.title}
            </a>
          </td>
        );
      case 'client':
        return <td key={col.key} className="cell-truncate" title={job.client || ''}>{job.client || '—'}</td>;
      case 'brSalary':
        return <td key={col.key} className="cell-money">{job.brSalary || '—'}</td>;
      case 'ceSpread':
        return <td key={col.key} className="cell-money">{job.ceSpread ? formatCurrency(job.ceSpread) : '—'}</td>;
      case 'permFee':
        return <td key={col.key} className="cell-money">{job.permFee ? formatCurrency(job.permFee) : '—'}</td>;
      case 'clientContact':
        return <td key={col.key} className="cell-truncate">{job.clientContact || '—'}</td>;
      case 'numOpenings':
      case 'clientSubs': {
        const csStyle = getTrUrgency(job) === 'red'
          ? { backgroundColor: '#dc2626', color: '#fff' }
          : undefined;
        return <td key={col.key} className="cell-num" style={csStyle}>{job[col.key] ?? '—'}</td>;
      }
      default:
        return <td key={col.key}>{job[col.key] || '—'}</td>;
    }
  };

  return (
    <div className="req-board-wrapper">
      <table className="req-board">
        <thead>
          <tr>
            {COLUMNS.map(col => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={`${col.sortable ? 'sortable' : ''} ${col.editable ? 'editable-header' : ''}`}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                {col.label}
                {col.sortable && <span className="sort-icon">{sortIcon(col.key)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(job => (
            <tr
              key={job.id}
              className={`req-row ${selectedJobId === job.id ? 'selected' : ''} ${job.fallingOff ? 'falling-off' : ''} ${isUnpublished(job) ? 'unpublished' : ''}`}
              onClick={() => onSelectJob(job.id)}
            >
              {COLUMNS.map(col => renderCell(job, col))}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="empty-state">No requisitions match your filters</div>
      )}
    </div>
  );
}
