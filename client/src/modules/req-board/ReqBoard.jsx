import { useState, useMemo, useEffect } from 'react';
import StatusBadge from './StatusBadge';
import EditableCell from './EditableCell';
import EditableSelect from './EditableSelect';
import EditableDate from './EditableDate';
import { updateJobOverrides, updateJobInBullhorn, getUsers, getRecruiters, getAccountManagers } from '../../lib/api';
import { getDeadlineUrgency, getFollowUpUrgency, getTrUrgency } from './lib/urgency';

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

const COLUMNS = [
  { key: 'priority', label: 'Pri', sortable: true, width: '42px' },
  { key: 'calledShot', label: 'CS', sortable: true, width: '36px' },
  { key: 'id', label: 'Req#', sortable: true, width: '55px' },
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
  { key: 'brSalary', label: 'PrBr/Salary LH', sortable: true, width: '130px' },
  { key: 'ceSpread', label: 'CE $', sortable: true, width: '70px' },
  { key: 'permFee', label: 'Perm $', sortable: true, width: '75px' },
  { key: 'clientContact', label: 'Manager', sortable: true, width: '100px' },
  { key: 'employmentType', label: 'Type', sortable: true, width: '55px', editType: 'select', bullhornField: 'employmentType' },
  { key: 'remote', label: 'Remote', sortable: true, width: '75px', editType: 'select', bullhornField: 'customText1' },
  { key: 'numOpenings', label: '# Op', sortable: true, width: '45px' },
  { key: 'clientSubs', label: '# CS', sortable: true, width: '45px' },
];

// Maps column keys to the API field names for overrides
const OVERRIDE_FIELD_MAP = {
  notes: 'notes',
  followUp: 'follow_up',
  deadline: 'deadline',
  coverageNeeded: 'coverage_needed',
  calledShot: 'called_shot',
  fortyEightHr: 'forty_eight_hr',
};

const COVERAGE_OPTIONS = [
  { value: 'Y', label: 'Y' },
  { value: 'N', label: 'N' },
];

export default function ReqBoard({ jobs, loading, onSelectJob, selectedJobId, onJobUpdated }) {
  const [sort, setSort] = useState({ key: 'dateAdded', dir: 'desc' });
  const [users, setUsers] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [accountManagers, setAccountManagers] = useState([]);

  useEffect(() => {
    getUsers().then(res => setUsers(res.data || [])).catch(() => {});
    getRecruiters().then(res => setRecruiters(res.data || [])).catch(() => {});
    getAccountManagers().then(res => setAccountManagers(res.data || [])).catch(() => {});
  }, []);

  const handleSort = (key) => {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const handleOverrideSave = async (jobId, field, value) => {
    const apiField = OVERRIDE_FIELD_MAP[field];
    if (!apiField) return;
    try {
      await updateJobOverrides(jobId, { [apiField]: value });
      if (onJobUpdated) onJobUpdated(jobId, field, value);
    } catch (err) {
      console.error('Failed to save override:', err);
    }
  };

  const handleBullhornSave = async (job, col, rawValue) => {
    const bhField = col.bullhornField;
    if (!bhField) return;

    let bullhornValue = rawValue;
    let displayUpdates = {};

    if (bhField === 'assignedUsers') {
      const hadPreviousRecruiter = !!(job.recruiter && job.recruiter.trim() && job.recruiter !== 'ZZ');

      const now = new Date().toISOString();

      if (rawValue === 'ZZ' || rawValue === '*') {
        // ZZ / *: save locally only, don't touch Bullhorn
        try {
          await updateJobOverrides(job.id, {
            recruiter: rawValue,
            tr_reassigned: hadPreviousRecruiter ? '1' : undefined,
            tr_assigned_at: now,
          });
          if (onJobUpdated) {
            onJobUpdated(job.id, 'recruiter', rawValue);
            onJobUpdated(job.id, 'trAssignedAt', now);
            if (hadPreviousRecruiter) onJobUpdated(job.id, 'trReassigned', true);
          }
        } catch (err) {
          console.error('Failed to save ZZ override:', err);
        }
        return;
      }

      const userId = parseInt(rawValue, 10);
      const user = recruiters.find(u => u.id === userId);
      bullhornValue = { replaceAll: [userId] };
      displayUpdates = {
        recruiter: user?.initials || '',
        assignedUserIds: [userId],
        trAssignedAt: now,
      };

      // Track reassignment and assignment time
      if (hadPreviousRecruiter) {
        displayUpdates.trReassigned = true;
        updateJobOverrides(job.id, { recruiter: '', tr_reassigned: '1', tr_assigned_at: now }).catch(() => {});
      } else {
        updateJobOverrides(job.id, { recruiter: '', tr_reassigned: '', tr_assigned_at: now }).catch(() => {});
      }
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
      // rawValue is a Unix ms timestamp or null
      bullhornValue = rawValue;
      displayUpdates = {
        [col.key]: rawValue ? new Date(rawValue).toISOString() : null,
      };
    } else {
      // Simple string fields: status, employmentType, customText1
      displayUpdates = { [col.key]: rawValue };
    }

    try {
      await updateJobInBullhorn(job.id, { [bhField]: bullhornValue });
      // Update all affected display fields
      for (const [field, value] of Object.entries(displayUpdates)) {
        if (onJobUpdated) onJobUpdated(job.id, field, value);
      }
    } catch (err) {
      console.error(`Failed to update Bullhorn field ${bhField}:`, err);
    }
  };

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
        />
      );
    }

    // Bullhorn-editable select fields
    if (col.editType === 'select') {
      let options, currentValue, displayValue;
      if (col.bullhornField === 'assignedUsers') {
        options = [
          ...recruiters.map(u => ({ value: String(u.id), label: u.initials })),
          { value: 'ZZ', label: 'ZZ' },
          { value: '*', label: '*' },
        ];
        if (job.recruiter === 'ZZ' || job.recruiter === '*') {
          currentValue = job.recruiter;
        } else {
          const firstAssigned = (job.assignedUserIds || [])[0];
          currentValue = firstAssigned ? String(firstAssigned) : '';
        }
        displayValue = job.recruiter || '—';
      } else if (col.bullhornField === 'owner') {
        options = accountManagers.map(u => ({ value: String(u.id), label: u.initials }));
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
      case 'priority':
        return (
          <td key={col.key}>
            {job.priority && (
              <span className="priority-badge" style={{
                backgroundColor: PRIORITY_COLORS[job.priority]?.bg || '#94a3b8',
                color: PRIORITY_COLORS[job.priority]?.text || '#fff',
              }}>{job.priority}</span>
            )}
          </td>
        );
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
        return <td key={col.key} className="cell-title cell-truncate" style={{ maxWidth: '140px' }} title={job.title || ''}>{job.title}</td>;
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
              className={`req-row ${selectedJobId === job.id ? 'selected' : ''} ${job.fallingOff ? 'falling-off' : ''}`}
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
