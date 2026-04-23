import { useState, useEffect, useMemo, useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  getAnnouncement,
  getMyDashboard,
  getJobs,
  getCandidatesInPlay,
  getStaleContacts,
  updateJobOverrides,
} from '../../lib/api';
import { getCalendarAccessToken, fetchTodaysEvents } from '../../lib/graphClient';
import { useUserRole } from '../../lib/UserRoleContext';
import './daily-brief.css';

/**
 * @typedef {Object} Priority
 * @property {string} id
 * @property {'urgent' | 'interview' | 'offer'} kind
 * @property {string} pillLabel
 * @property {string} clientLabel
 * @property {string} headline
 * @property {string} context
 * @property {{ label: string, href: string }} action
 */

const TWO_WEEKS_MS = 14 * 86400000;

function parseDateFlexible(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Score a job on the three priority criteria. Each criterion = 1 point.
 * Returns { reasons: [{ key, label }, ...] } — points count === reasons.length.
 */
function computePriorityReasons(job, nowMs) {
  const reasons = [];

  // 1. Still Accepting Candidates for 2+ weeks
  if (job.status === 'Accepting Candidates') {
    const addedMs = parseDateFlexible(job.dateAdded);
    if (addedMs != null && nowMs - addedMs >= TWO_WEEKS_MS) {
      const ageDays = Math.floor((nowMs - addedMs) / 86400000);
      reasons.push({ key: 'stale', label: `Open ${ageDays} days accepting candidates` });
    }
  }

  // 2. Missed deadline
  const deadlineMs = parseDateFlexible(job.deadline);
  if (deadlineMs != null && deadlineMs < nowMs) {
    reasons.push({ key: 'deadline', label: 'Deadline missed' });
  }

  // 3. Missed follow-up
  const followUpMs = parseDateFlexible(job.followUp);
  if (followUpMs != null && followUpMs < nowMs) {
    reasons.push({ key: 'followup', label: 'Follow-up overdue' });
  }

  return reasons;
}

const REASON_PILL = {
  deadline: { kind: 'urgent', label: 'DEADLINE MISSED' },
  followup: { kind: 'interview', label: 'FOLLOW-UP DUE' },
  stale: { kind: 'interview', label: 'STALE' },
};
const REASON_SEVERITY_ORDER = ['deadline', 'followup', 'stale'];

function jobToPriority(job, reasons) {
  const leadingKey = REASON_SEVERITY_ORDER.find((k) => reasons.some((r) => r.key === k)) || 'stale';
  const pill = REASON_PILL[leadingKey];
  const reasonLabels = REASON_SEVERITY_ORDER
    .filter((k) => reasons.some((r) => r.key === k))
    .map((k) => reasons.find((r) => r.key === k).label);
  const loc = [job.city, job.state].filter(Boolean).join(', ');
  const parts = [reasonLabels.join(' · '), job.employmentType, loc].filter(Boolean);
  return {
    id: `job-${job.id}`,
    kind: pill.kind,
    pillLabel: pill.label,
    clientLabel: job.client || 'Unknown client',
    headline: job.title || '(Untitled req)',
    context: `${parts.join(' · ')}.`,
    action: { label: 'Open req', href: '/req-board' },
  };
}

function extractMyPriorities(jobs, fullName) {
  if (!Array.isArray(jobs) || !fullName) return [];
  const me = fullName.toLowerCase();
  const nowMs = Date.now();
  const scored = jobs
    .filter((j) => (j.owner || '').toLowerCase() === me)
    .map((job) => ({ job, reasons: computePriorityReasons(job, nowMs) }))
    .filter((entry) => entry.reasons.length > 0);

  scored.sort((a, b) => {
    if (a.reasons.length !== b.reasons.length) return b.reasons.length - a.reasons.length;
    const aMs = parseDateFlexible(a.job.dateAdded) ?? Infinity;
    const bMs = parseDateFlexible(b.job.dateAdded) ?? Infinity;
    return aMs - bMs;
  });

  return scored.map(({ job, reasons }) => jobToPriority(job, reasons));
}

function formatCurrencyCompact(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  if (Math.abs(n) < 1000) return `$${n}`;
  return `$${Math.round(n / 1000).toLocaleString()}K`;
}

const CLOSED_STATUSES = new Set(['Archive', 'Placed', 'Lost', 'Wash', 'Filled']);

function isActiveJob(job) {
  return !CLOSED_STATUSES.has(job.status);
}

// The server returns `{ total, data: [...] }`; accept either that shape or a
// bare array so a future server change doesn't break the page.
function toJobArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.data)) return raw.data;
  return [];
}

// AM tile #1: jobs owned by the AM that either have a missed/missing deadline
// or a missed/missing follow-up. "Missing" = blank on a job that's still
// actively being worked (so we don't badger the user about reqs that are
// Archive / Placed / Lost / Wash / Filled).
function extractFlaggedForAm(jobs, ownerName) {
  if (!Array.isArray(jobs) || !ownerName) return [];
  const me = ownerName.toLowerCase();
  const nowMs = Date.now();
  return jobs.filter((j) => {
    if (!isActiveJob(j)) return false;
    if ((j.owner || '').toLowerCase() !== me) return false;
    const deadline = (j.deadline || '').trim();
    const followUp = (j.followUp || '').trim();
    const deadlineMs = parseDateFlexible(deadline);
    const followUpMs = parseDateFlexible(followUp);
    const deadlineFlagged = !deadline || (deadlineMs != null && deadlineMs < nowMs);
    const followUpFlagged = !followUp || (followUpMs != null && followUpMs < nowMs);
    return deadlineFlagged || followUpFlagged;
  });
}

function getDateEyebrow(d = new Date()) {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  return `${weekday} · ${monthDay}`;
}

function getVolumeIssue(d = new Date()) {
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const dayOfYear = Math.floor((d - start) / 86400000) + 1;
  const vol = String(year).slice(-2); // 2026 → "26"
  return `Vol. ${vol} / Issue ${dayOfYear}`;
}

function getQuarterStart(d = new Date()) {
  const qMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qMonth, 1);
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function parseAnnouncement(data) {
  if (!data?.text) {
    return { title: '', bullets: [], author: 'APT COMMAND', postedAt: '' };
  }
  const lines = data.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = lines[0] || '';
  const bullets = lines
    .slice(1)
    .filter((l) => l.startsWith('-'))
    .map((l) => l.replace(/^-\s*/, ''));
  const rawAuthor = (data.updated_by || '').trim();
  const author = rawAuthor ? rawAuthor.toUpperCase() : 'APT COMMAND';
  const postedAt = data.updated_at ? formatAnnouncementTime(data.updated_at) : '';
  return { title, bullets, author, postedAt };
}

function formatAnnouncementTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();
  return `${wd} ${time}`;
}

export default function DailyBrief() {
  const { accounts } = useMsal();
  const account = accounts[0];
  const msalName = account?.name || '';
  const firstName = msalName.split(' ')[0] || 'there';

  const { isAdmin, bullhornRole, bullhornUserId, bullhornName } = useUserRole();

  // Prefer the Bullhorn CorporateUser's display name for filtering jobs by
  // owner — that's the exact string `formatJob()` emits on the server (see
  // server/routes/jobs.js `formatJob`). Fall back to the MSAL display name
  // while the /api/users/me fetch is in-flight or when Bullhorn has no match.
  const matchName = bullhornName || msalName;

  // Admins and anyone without a "Recruiter" Bullhorn role land on the AM
  // ("sales") view per the current product decision. A dedicated Exec view
  // will replace the admin branch in a follow-up.
  const view = isAdmin || bullhornRole !== 'Recruiter' ? 'am' : 'recruiter';

  // Hoist jobs state so Priorities and the glance tiles share one fetch,
  // and so the FlaggedReqsDrawer can refresh the tile count after edits.
  const [jobs, setJobs] = useState(null);
  const [jobsError, setJobsError] = useState(false);

  const refetchJobs = useCallback(() => {
    getJobs()
      .then((raw) => {
        setJobs(toJobArray(raw));
        setJobsError(false);
      })
      .catch(() => {
        setJobs([]);
        setJobsError(true);
      });
  }, []);

  useEffect(() => {
    refetchJobs();
  }, [refetchJobs]);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const now = new Date();
  const dateEyebrow = getDateEyebrow(now);
  const volumeIssue = getVolumeIssue(now);

  return (
    <div className="daily-brief">
      <Masthead firstName={firstName} dateEyebrow={dateEyebrow} volumeIssue={volumeIssue} />
      <div className="db-columns">
        <PrioritiesColumn jobs={jobs} jobsError={jobsError} fullName={matchName} />
        <SideRail
          jobs={jobs}
          view={view}
          fullName={matchName}
          bullhornUserId={bullhornUserId}
          onOpenFlaggedDrawer={() => setDrawerOpen(true)}
        />
      </div>
      {drawerOpen && (
        <FlaggedReqsDrawer
          jobs={jobs || []}
          fullName={matchName}
          onClose={() => {
            setDrawerOpen(false);
            refetchJobs();
          }}
        />
      )}
    </div>
  );
}

function Masthead({ firstName, dateEyebrow, volumeIssue }) {
  return (
    <header className="db-masthead">
      <div className="db-masthead-eyebrow">
        <span className="db-eyebrow-text">THE · DAILY · BRIEF · {dateEyebrow}</span>
        <span className="db-masthead-rule" aria-hidden />
        <span className="db-volume">{volumeIssue}</span>
      </div>
      <h1 className="db-headline">
        <span className="db-headline-line1">Good morning, {firstName}.</span>
        <span className="db-headline-line2">Three things that need you today.</span>
      </h1>
      <div className="db-gold-rule" aria-hidden />
    </header>
  );
}

function PrioritiesColumn({ jobs, jobsError, fullName }) {
  const navigate = useNavigate();

  // Derive priorities + totalMine synchronously from the hoisted jobs prop.
  // `jobs === null` = still loading; `jobs === []` + jobsError = failed.
  const { priorities, totalMine } = useMemo(() => {
    if (!Array.isArray(jobs) || !fullName) {
      return { priorities: null, totalMine: null };
    }
    const me = fullName.toLowerCase();
    return {
      priorities: extractMyPriorities(jobs, fullName),
      totalMine: jobs.filter((j) => isActiveJob(j) && (j.owner || '').toLowerCase() === me).length,
    };
  }, [jobs, fullName]);

  // If the jobs fetch failed, render an empty priorities list rather than
  // leaving the skeleton spinning forever.
  const resolvedPriorities = jobsError ? [] : priorities;

  const remainingCount = totalMine != null && resolvedPriorities
    ? Math.max(0, totalMine - resolvedPriorities.length)
    : null;

  return (
    <section className="db-priorities">
      <div className="db-block-eyebrow db-priorities-eyebrow">PRIORITIES — IN ORDER</div>
      <div className="db-priority-stack">
        {resolvedPriorities === null ? (
          <>
            <div className="skeleton-shimmer db-priority-skeleton" />
            <div className="skeleton-shimmer db-priority-skeleton" />
            <div className="skeleton-shimmer db-priority-skeleton" />
          </>
        ) : resolvedPriorities.length === 0 ? (
          <div className="db-priorities-empty">
            Nothing flagged on your board right now — no stale reqs, missed deadlines, or overdue follow-ups.
          </div>
        ) : (
          resolvedPriorities.map((p, i) => <PriorityCard key={p.id} priority={p} index={i} />)
        )}
      </div>
      <div className="db-priorities-footer">
        <span className="db-priorities-footer-text">
          {remainingCount == null
            ? 'Open active items in your Req Board.'
            : remainingCount === 0
              ? 'Nothing else open on your Req Board.'
              : `Plus ${remainingCount} more active item${remainingCount === 1 ? '' : 's'} in your Req Board.`}
        </span>
        <button
          type="button"
          className="db-btn-primary"
          onClick={() => navigate('/req-board')}
        >
          Open Req Board <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}

function PriorityCard({ priority, index }) {
  const { kind, pillLabel, clientLabel, headline, context, action } = priority;
  const indexLabel = String(index + 1).padStart(2, '0');
  return (
    <article className={`db-priority-card ${index === 0 ? 'is-first' : ''}`}>
      <div className="db-priority-index">{indexLabel}</div>
      <div className="db-priority-body">
        <div className="db-priority-meta">
          <span className={`db-pill db-pill-${kind}`}>{pillLabel}</span>
          <span className="db-priority-client">{clientLabel.toUpperCase()}</span>
        </div>
        <h2 className="db-priority-headline">{headline}</h2>
        <p className="db-priority-context">{context}</p>
      </div>
      <div className="db-priority-action">
        <a className="db-btn-secondary" href={action.href}>
          {action.label} <ArrowRight size={13} />
        </a>
      </div>
    </article>
  );
}

function SideRail({ jobs, view, fullName, bullhornUserId, onOpenFlaggedDrawer }) {
  return (
    <aside className="db-side-rail">
      {view === 'recruiter' ? (
        <RecruiterStats jobs={jobs} bullhornUserId={bullhornUserId} />
      ) : (
        <AmStats
          jobs={jobs}
          fullName={fullName}
          onOpenFlaggedDrawer={onOpenFlaggedDrawer}
        />
      )}
      <YourDay />
      <AnnouncementCard />
    </aside>
  );
}

// --- Stat cards: shared presentation ---

function StatCardGrid({ items, loading }) {
  return (
    <div className="db-glance-grid">
      {items.map((item) => {
        const content = loading ? (
          <div className="skeleton-shimmer db-glance-skeleton" />
        ) : (
          <div className="db-glance-value">
            {item.value == null
              ? '—'
              : item.format === 'currency-k'
                ? formatCurrencyCompact(item.value)
                : item.value}
          </div>
        );
        return (
          <button
            type="button"
            className="db-glance-stat"
            key={item.label}
            onClick={item.onClick}
            title={item.tooltip}
            aria-label={item.tooltip ? `${item.label}. ${item.tooltip}` : item.label}
          >
            {content}
            <div className="db-glance-label">{item.label}</div>
          </button>
        );
      })}
    </div>
  );
}

// --- AM tiles ---

function AmStats({ jobs, fullName, onOpenFlaggedDrawer }) {
  const navigate = useNavigate();
  // Hold the full list (not just the count) so the "Stale clients" drawer
  // can render it without a second fetch.
  const [staleContacts, setStaleContacts] = useState(null);
  const [staleError, setStaleError] = useState(false);
  const [staleDrawerOpen, setStaleDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStaleContacts()
      .then((res) => {
        if (cancelled) return;
        setStaleContacts(Array.isArray(res?.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setStaleError(true);
      });
    return () => { cancelled = true; };
  }, []);

  const staleCount = staleError
    ? null
    : (staleContacts === null ? null : staleContacts.length);

  // Everything AM-specific derives from the hoisted jobs list. Guard with
  // Array.isArray so a null prop (still loading) keeps the skeletons up.
  const derived = useMemo(() => {
    if (!Array.isArray(jobs) || !fullName) return null;
    const me = fullName.toLowerCase();
    const mine = jobs.filter((j) => isActiveJob(j) && (j.owner || '').toLowerCase() === me);
    const flaggedCount = extractFlaggedForAm(jobs, fullName).length;
    const potentialInput = mine.reduce((sum, j) => sum + (Number(j.dealValue) || 0), 0);
    const abReqs = mine.filter((j) => j.priority === 'A' || j.priority === 'B').length;
    return { flaggedCount, potentialInput, abReqs };
  }, [jobs, fullName]);

  const loading = derived === null;

  const items = [
    {
      label: 'Missed / missing follow-ups & deadlines',
      value: derived?.flaggedCount,
      format: 'number',
      tooltip:
        'Count of your active reqs where the Deadline or Follow-up field is either blank or already in the past. ' +
        'Active = status is not Archive, Placed, Lost, Wash, or Filled. ' +
        'Click to open an inline-editable list.',
      onClick: () => {
        // If there's nothing flagged, fall through to the board — no empty
        // drawer surprises.
        if (derived?.flaggedCount > 0) onOpenFlaggedDrawer();
        else navigate('/req-board');
      },
    },
    {
      label: 'Stale clients',
      value: staleCount,
      format: 'number',
      tooltip:
        'Bullhorn ClientContacts you own with no MAR-driving activity logged by you in the last 14 days. ' +
        'Same activity types the AM Sales Dashboard uses for MAR. ' +
        'Click to see the list.',
      onClick: () => {
        // If zero (or errored), navigating or opening an empty modal is pointless.
        if (staleCount && staleCount > 0) setStaleDrawerOpen(true);
      },
    },
    {
      label: 'Potential input',
      value: derived?.potentialInput,
      format: 'currency-k',
      tooltip:
        'Sum of Deal Value (Bullhorn customFloat2) across your active owned jobs. ' +
        'Represents the potential input you stand to earn if every one of your reqs fills. ' +
        'Jobs without a Deal Value contribute $0.',
      onClick: () => navigate('/req-board'),
    },
    {
      label: 'Open A & B reqs',
      value: derived?.abReqs,
      format: 'number',
      tooltip:
        'Count of your active owned jobs where Priority is A or B (type = 1 or 2 in Bullhorn). ' +
        'C reqs and closed reqs are excluded.',
      onClick: () => navigate('/req-board'),
    },
  ];

  return (
    <>
      <section className="db-block db-glance">
        <div className="db-block-eyebrow">TODAY · AT · A · GLANCE</div>
        <StatCardGrid items={items} loading={loading} />
      </section>
      {staleDrawerOpen && (
        <StaleClientsDrawer
          contacts={staleContacts || []}
          onClose={() => setStaleDrawerOpen(false)}
        />
      )}
    </>
  );
}

// --- Recruiter tiles ---

function RecruiterStats({ jobs, bullhornUserId }) {
  const navigate = useNavigate();
  const [inPlayCount, setInPlayCount] = useState(null);
  const [inPlayError, setInPlayError] = useState(false);
  const [checkinCount, setCheckinCount] = useState(null);
  const [checkinError, setCheckinError] = useState(false);

  // Candidates In Play — new endpoint
  useEffect(() => {
    let cancelled = false;
    getCandidatesInPlay()
      .then((res) => {
        if (cancelled) return;
        setInPlayCount(typeof res?.total === 'number' ? res.total : (res?.data?.length ?? 0));
      })
      .catch(() => {
        if (!cancelled) setInPlayError(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Pending 30/90 — reuse the existing performance endpoint and count
  // follow-up rows whose 30 OR 90 day window is currently Overdue. Matches
  // what `/performance`'s "Follow-ups" table shows today.
  useEffect(() => {
    let cancelled = false;
    const today = new Date();
    const todayISO = toISODate(today);
    const qtrStartISO = toISODate(getQuarterStart(today));
    getMyDashboard(qtrStartISO, todayISO)
      .then((data) => {
        if (cancelled) return;
        const overdue = (data?.followUps || []).filter(
          (f) => f.thirtyDay === 'Overdue' || f.ninetyDay === 'Overdue',
        ).length;
        setCheckinCount(overdue);
      })
      .catch(() => {
        if (!cancelled) setCheckinError(true);
      });
    return () => { cancelled = true; };
  }, []);

  const derived = useMemo(() => {
    if (!Array.isArray(jobs) || !bullhornUserId) return null;
    const mine = jobs.filter(
      (j) => isActiveJob(j) && Array.isArray(j.assignedUserIds)
        && j.assignedUserIds.includes(bullhornUserId),
    );
    const reqsNoSub = mine.filter((j) => (j.clientSubs ?? 0) === 0).length;
    const pendingInput = mine.reduce((sum, j) => sum + (Number(j.dealValue) || 0), 0);
    return { reqsNoSub, pendingInput };
  }, [jobs, bullhornUserId]);

  const loading = derived === null;

  const items = [
    {
      label: 'Candidates in play',
      value: inPlayError ? null : inPlayCount,
      format: 'number',
      tooltip:
        'Count of your Bullhorn JobSubmissions currently in Interview Scheduled, Interview Feedback, ' +
        'Client Feedback, or Offer Extended. Only submissions you sent (sendingUser = you) are counted.',
      onClick: () => navigate('/req-board'),
    },
    {
      label: 'Assigned reqs w/o client sub',
      value: derived?.reqsNoSub,
      format: 'number',
      tooltip:
        'Count of active jobs where you are in assignedUsers and zero client submissions have ' +
        'been sent yet. Closed reqs (Archive / Placed / Lost / Wash / Filled) are excluded.',
      onClick: () => navigate('/req-board'),
    },
    {
      label: 'Pending 30 / 90 check-ins',
      value: checkinError ? null : checkinCount,
      format: 'number',
      tooltip:
        'Count of your placements where either the 30-day or 90-day check-in is Overdue. ' +
        'Matches the Overdue rows in the Follow-ups table on your Performance page.',
      onClick: () => navigate('/reporting/performance'),
    },
    {
      label: 'Pending input',
      value: derived?.pendingInput,
      format: 'currency-k',
      tooltip:
        'Sum of Deal Value (Bullhorn customFloat2) across active jobs where you are in assignedUsers. ' +
        'Represents the potential spread you stand to earn if your assigned reqs fill. ' +
        'Jobs without a Deal Value contribute $0.',
      onClick: () => navigate('/req-board'),
    },
  ];

  return (
    <section className="db-block db-glance">
      <div className="db-block-eyebrow">TODAY · AT · A · GLANCE</div>
      <StatCardGrid items={items} loading={loading} />
    </section>
  );
}

function YourDay() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getCalendarAccessToken(instance, account);
        const data = await fetchTodaysEvents(token);
        if (cancelled) return;
        setEvents(data.filter((e) => !e.isAllDay));
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instance, account]);

  return (
    <section className="db-block db-your-day">
      <div className="db-block-eyebrow">YOUR · DAY</div>
      {error ? (
        <div className="db-your-day-error">Couldn&rsquo;t load calendar.</div>
      ) : events === null ? (
        <>
          <div className="skeleton-shimmer db-agenda-skeleton" />
          <div className="skeleton-shimmer db-agenda-skeleton" />
          <div className="skeleton-shimmer db-agenda-skeleton" />
        </>
      ) : events.length === 0 ? (
        <div className="db-your-day-empty">Nothing on your calendar today.</div>
      ) : (
        <ul className="db-agenda-list">
          {events.map((ev) => (
            <AgendaRow key={ev.id} ev={ev} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AgendaRow({ ev }) {
  const start = new Date(ev.start.dateTime);
  const timeLabel = formatTime(start);
  const subtitle = ev.location?.displayName
    || (ev.attendees?.length ? `${ev.attendees.length} attendees` : '');
  const joinUrl = ev.onlineMeeting?.joinUrl;

  const titleEl = joinUrl ? (
    <a className="db-agenda-title-link" href={joinUrl} target="_blank" rel="noreferrer">
      {ev.subject || '(no subject)'}
    </a>
  ) : (
    <span className="db-agenda-title">{ev.subject || '(no subject)'}</span>
  );

  return (
    <li className="db-agenda-row">
      <time className="db-agenda-time">{timeLabel}</time>
      <div className="db-agenda-body">
        {titleEl}
        {subtitle && <div className="db-agenda-subtitle">{subtitle}</div>}
      </div>
    </li>
  );
}

function AnnouncementCard() {
  const [announcement, setAnnouncement] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAnnouncement()
      .then((data) => {
        if (!cancelled) setAnnouncement(parseAnnouncement(data));
      })
      .catch(() => {
        if (!cancelled) setAnnouncement(parseAnnouncement(null));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!announcement) {
    return (
      <section className="db-block db-announcement">
        <div className="skeleton-shimmer db-announcement-skeleton" />
      </section>
    );
  }

  if (!announcement.title && announcement.bullets.length === 0) {
    return null;
  }

  return (
    <section className="db-block db-announcement">
      <span className="db-announcement-glyph" aria-hidden>&ldquo;</span>
      <div className="db-announcement-eyebrow">ANNOUNCEMENT</div>
      {announcement.title && (
        <h3 className="db-announcement-title">{announcement.title}</h3>
      )}
      {announcement.bullets.length > 0 && (
        <ul className="db-announcement-bullets">
          {announcement.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {announcement.postedAt && (
        <div className="db-announcement-footer">
          Last Updated: {announcement.postedAt}
        </div>
      )}
    </section>
  );
}

// --- Flagged Reqs Drawer ---
// Centered modal that lists the AM's missed/missing FU + deadline reqs with
// inline-editable deadline and follow-up inputs. Saves via the same
// /api/req-board/jobs/:id/overrides endpoint the ReqBoard uses for inline
// edits, including the If-Match optimistic-locking header. On close, the
// parent refetches jobs so the tile count picks up any changes.

function FlaggedReqsDrawer({ jobs, fullName, onClose }) {
  // Snapshot the flagged list when the drawer opens. Editing a row shouldn't
  // make it vanish from the list while the modal is open — we re-filter on
  // close via the parent's refetch instead.
  const [rows, setRows] = useState(() =>
    extractFlaggedForAm(jobs, fullName).map((j) => ({
      id: j.id,
      title: j.title || '',
      client: j.client || '',
      deadline: j.deadline || '',
      followUp: j.followUp || '',
      overrideVersion: j.overrideVersion ?? null,
      saving: false,
      error: null,
    })),
  );

  // ESC key closes the drawer.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const updateField = (id, field, value) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const saveRow = async (id, field) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const payload = field === 'deadline'
      ? { deadline: row.deadline }
      : { follow_up: row.followUp };
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, saving: true, error: null } : r)));
    try {
      const res = await updateJobOverrides(id, payload, {
        expectedVersion: row.overrideVersion,
      });
      // The PATCH response includes the new override row; grab the updated
      // version so the next save on this row still hits the locking path.
      const nextVersion = res?.data?.version ?? row.overrideVersion;
      setRows((rs) => rs.map((r) => (
        r.id === id ? { ...r, saving: false, overrideVersion: nextVersion } : r
      )));
    } catch (err) {
      setRows((rs) => rs.map((r) => (
        r.id === id ? { ...r, saving: false, error: err?.message || 'Save failed' } : r
      )));
    }
  };

  const backdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="db-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Missed follow-ups and deadlines"
      onClick={backdropClick}
    >
      <div className="db-drawer">
        <header className="db-drawer-header">
          <h2 className="db-drawer-title">Missed / missing follow-ups &amp; deadlines</h2>
          <button type="button" className="db-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {rows.length === 0 ? (
          <div className="db-drawer-empty">Nothing flagged right now.</div>
        ) : (
          <table className="db-drawer-table">
            <thead>
              <tr>
                <th>Req #</th>
                <th>Title</th>
                <th>Client</th>
                <th>Deadline</th>
                <th>Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.error ? 'db-drawer-row-error' : ''}>
                  <td className="db-drawer-id">{r.id}</td>
                  <td className="db-drawer-title-cell">{r.title}</td>
                  <td className="db-drawer-client">{r.client}</td>
                  <td>
                    <input
                      type="text"
                      className="db-drawer-input"
                      value={r.deadline}
                      placeholder="MM/DD"
                      onChange={(e) => updateField(r.id, 'deadline', e.target.value)}
                      onBlur={() => saveRow(r.id, 'deadline')}
                      disabled={r.saving}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="db-drawer-input"
                      value={r.followUp}
                      placeholder="MM/DD"
                      onChange={(e) => updateField(r.id, 'followUp', e.target.value)}
                      onBlur={() => saveRow(r.id, 'followUp')}
                      disabled={r.saving}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <footer className="db-drawer-footer">
          <span className="db-drawer-hint">Changes save automatically when you leave a field.</span>
          <button type="button" className="db-btn-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

// --- Stale Clients Drawer ---
// Read-only modal listing ClientContacts owned by the AM with no MAR-driving
// activity in the last 14 days. Matches the visual language of
// FlaggedReqsDrawer but doesn't edit anything — just shows who to reach out
// to next, with a direct Bullhorn link per contact.

const BH_BASE = 'https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm';

function StaleClientsDrawer({ contacts, onClose }) {
  // ESC key closes the drawer.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Sort by client company, then last name — makes it easy to scan and call
  // multiple contacts at the same client back-to-back.
  const sorted = [...contacts].sort((a, b) => {
    const c = (a.client || '').localeCompare(b.client || '');
    if (c !== 0) return c;
    return (a.lastName || '').localeCompare(b.lastName || '');
  });

  const backdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="db-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Stale clients"
      onClick={backdropClick}
    >
      <div className="db-drawer db-drawer-stale">
        <header className="db-drawer-header">
          <h2 className="db-drawer-title">Stale clients</h2>
          <button type="button" className="db-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {sorted.length === 0 ? (
          <div className="db-drawer-empty">No stale clients right now. Nice work.</div>
        ) : (
          <table className="db-drawer-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Client</th>
                <th>Email</th>
                <th className="db-drawer-th-action">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id}>
                  <td className="db-drawer-title-cell">{c.name || `${c.firstName} ${c.lastName}`.trim()}</td>
                  <td className="db-drawer-client">{c.client || '—'}</td>
                  <td className="db-drawer-email">
                    {c.email ? (
                      <a className="db-drawer-link" href={`mailto:${c.email}`}>{c.email}</a>
                    ) : (
                      <span className="db-drawer-muted">—</span>
                    )}
                  </td>
                  <td className="db-drawer-action-cell">
                    <a
                      className="db-drawer-link-strong"
                      href={`${BH_BASE}?Entity=ClientContact&id=${c.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Bullhorn ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <footer className="db-drawer-footer">
          <span className="db-drawer-hint">
            No activity from you in 14 days. Log a call, email, or meeting in Bullhorn to clear.
          </span>
          <button type="button" className="db-btn-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
