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
  getLoggedMeetingIds,
  matchMeetingAttendees,
  logMeetingActivity,
} from '../../lib/api';
import {
  getCalendarAccessToken,
  fetchTodaysEvents,
  fetchRecentEvents,
} from '../../lib/graphClient';
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

// Time-of-day greeting for the masthead. Morning until noon, afternoon
// until 6pm, evening after. Keeps the editorial sentence-case style of
// the rest of the headline.
function getGreeting(d = new Date()) {
  const hour = d.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
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

  const { isAdmin, bullhornRole, bullhornUserId, bullhornName } = useUserRole();

  // Prefer the Bullhorn CorporateUser's display name for filtering jobs by
  // owner — that's the exact string `formatJob()` emits on the server (see
  // server/routes/jobs.js `formatJob`). Fall back to the MSAL display name
  // while the /api/users/me fetch is in-flight or when Bullhorn has no match.
  const matchName = bullhornName || msalName;

  // First name for the greeting. Bullhorn's name is always "First Last"
  // (`${firstName} ${lastName}` joined server-side), so split(' ')[0] is
  // reliable there. MSAL can return "Last, First" on some Entra tenants, so
  // strip a trailing-comma case before splitting as a defensive fallback.
  const firstName = (() => {
    if (bullhornName) return bullhornName.split(' ')[0];
    if (!msalName) return 'there';
    if (msalName.includes(',')) {
      // "Buchholz, James" -> "James"
      const afterComma = msalName.split(',').slice(1).join(',').trim();
      if (afterComma) return afterComma.split(' ')[0];
    }
    return msalName.split(' ')[0] || 'there';
  })();

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
  const greeting = getGreeting(now);

  return (
    <div className="daily-brief">
      <Masthead
        greeting={greeting}
        firstName={firstName}
        dateEyebrow={dateEyebrow}
        volumeIssue={volumeIssue}
      />
      <div className="db-columns">
        <div className="db-priorities-col">
          <PrioritiesColumn jobs={jobs} jobsError={jobsError} fullName={matchName} />
          <RecentMeetings />
        </div>
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

function Masthead({ greeting, firstName, dateEyebrow, volumeIssue }) {
  return (
    <header className="db-masthead">
      <div className="db-masthead-eyebrow">
        <span className="db-eyebrow-text">THE · DAILY · BRIEF · {dateEyebrow}</span>
        <span className="db-masthead-rule" aria-hidden />
        <span className="db-volume">{volumeIssue}</span>
      </div>
      <h1 className="db-headline">
        <span className="db-headline-line1">{greeting}, {firstName}.</span>
        <span className="db-headline-line2">What needs attention today.</span>
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

// --- Last 7 days of meetings -------------------------------------------------
// Source: Outlook calendar (Microsoft Graph) — only past, non-all-day, external
// (≥1 attendee outside the user's email domain) events the user didn't decline.
// Each row offers a "Log activity" button that creates a Bullhorn Appointment
// so the meeting drives MAR / dashboards the same way a manually-logged one would.

// Mirror of server/lib/salesConfig.js SALES_POINTS keys, in the order the AM
// dashboard already renders them. Kept in lockstep with the server list.
const ACTIVITY_TYPE_OPTIONS = [
  'Touch Point',
  'Virtual Meeting',
  'In Person Meeting',
  'Coffee',
  'Breakfast',
  'Lunch',
  'New Meeting',
  'Req Qual',
  'Referral Meeting',
  'Happy Hour',
  'Dinner',
  'OOA',
  'Discovery',
  'Solutions Pitch',
  'Solutions Touch',
  'Solutions Opp Uncovered',
  'BD Meeting',
];

function getDomainFromEmail(email) {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

function getEventStartMs(ev) {
  return new Date(ev.start.dateTime).getTime();
}

function pickExternalAttendees(ev, userDomain) {
  return (ev.attendees || [])
    .filter((a) => a?.emailAddress?.address)
    .filter((a) => getDomainFromEmail(a.emailAddress.address) !== userDomain);
}

// Drop events the user shouldn't be prompted to log: all-day blocks, declined
// invites, internal-only meetings, and the day's still-future calendar slots.
function filterRecentEventsForLogging(events, userDomain, nowMs) {
  return events
    .filter((ev) => !ev.isAllDay)
    .filter((ev) => ev.responseStatus?.response !== 'declined')
    .filter((ev) => getEventStartMs(ev) <= nowMs)
    .filter((ev) => pickExternalAttendees(ev, userDomain).length > 0)
    .sort((a, b) => getEventStartMs(b) - getEventStartMs(a));
}

function formatRecentEventDate(ms) {
  const d = new Date(ms);
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  return `${wd} · ${md} · ${formatTime(d)}`;
}

function attendeeDisplayName(attendee) {
  return attendee?.emailAddress?.name || attendee?.emailAddress?.address || '';
}

function RecentMeetings() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const userDomain = getDomainFromEmail(account?.username);

  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [loggedIds, setLoggedIds] = useState(() => new Set());
  const [matches, setMatches] = useState({});
  const [openEvent, setOpenEvent] = useState(null);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getCalendarAccessToken(instance, account);
        const [raw, loggedRes] = await Promise.all([
          fetchRecentEvents(token, 7),
          getLoggedMeetingIds().catch(() => ({ ids: [] })),
        ]);
        if (cancelled) return;
        const previouslyLogged = new Set(loggedRes?.ids || []);
        const filtered = filterRecentEventsForLogging(raw, userDomain, Date.now())
          .filter((ev) => !previouslyLogged.has(ev.id));
        setEvents(filtered);
        setLoggedIds(previouslyLogged);

        const externalEmails = Array.from(new Set(
          filtered.flatMap((ev) => pickExternalAttendees(ev, userDomain)
            .map((a) => a.emailAddress.address.toLowerCase())),
        ));
        if (externalEmails.length > 0) {
          matchMeetingAttendees(externalEmails)
            .then((res) => { if (!cancelled) setMatches(res?.matches || {}); })
            .catch(() => { /* match is best-effort; modal still works manually */ });
        }
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => { cancelled = true; };
  }, [instance, account, userDomain]);

  const markLogged = (outlookEventId) => {
    setLoggedIds((prev) => {
      const next = new Set(prev);
      next.add(outlookEventId);
      return next;
    });
  };

  return (
    <section className="db-block db-recent-meetings">
      <div className="db-block-eyebrow">THE · LAST · 7 · DAYS</div>
      <p className="db-recent-prompt">
        Have you logged all your activity for these meetings?
      </p>
      {error ? (
        <div className="db-your-day-error">Couldn&rsquo;t load your calendar.</div>
      ) : events === null ? (
        <div className="db-recent-stack">
          <div className="skeleton-shimmer db-recent-skeleton" />
          <div className="skeleton-shimmer db-recent-skeleton" />
          <div className="skeleton-shimmer db-recent-skeleton" />
        </div>
      ) : events.length === 0 ? (
        <div className="db-your-day-empty">
          No external meetings in the last 7 days.
        </div>
      ) : (
        <ul className="db-recent-stack">
          {events.map((ev) => (
            <RecentMeetingRow
              key={ev.id}
              ev={ev}
              userDomain={userDomain}
              matches={matches}
              isLogged={loggedIds.has(ev.id)}
              onLogClick={() => setOpenEvent(ev)}
            />
          ))}
        </ul>
      )}
      {openEvent && (
        <LogActivityModal
          ev={openEvent}
          userDomain={userDomain}
          matches={matches}
          onClose={() => setOpenEvent(null)}
          onLogged={(id) => { markLogged(id); setOpenEvent(null); }}
        />
      )}
    </section>
  );
}

function RecentMeetingRow({ ev, userDomain, matches, isLogged, onLogClick }) {
  const startMs = getEventStartMs(ev);
  const externals = pickExternalAttendees(ev, userDomain);
  const primary = externals[0];
  const primaryEmail = primary?.emailAddress?.address?.toLowerCase() || '';
  const match = matches[primaryEmail];

  let subline;
  if (match?.kind === 'contact') {
    subline = `${match.firstName} ${match.lastName} — ClientContact${match.clientName ? ` · ${match.clientName}` : ''}`;
  } else if (match?.kind === 'candidate') {
    subline = `${match.firstName} ${match.lastName} — Candidate`;
  } else if (externals.length === 1) {
    subline = attendeeDisplayName(primary);
  } else {
    subline = `${externals.length} external attendees`;
  }

  return (
    <li className="db-recent-row">
      <div className="db-recent-row-body">
        <time className="db-recent-row-time">{formatRecentEventDate(startMs)}</time>
        <div className="db-recent-row-title">{ev.subject || '(no subject)'}</div>
        <div className="db-recent-row-subline">{subline}</div>
      </div>
      <div className="db-recent-row-action">
        {isLogged ? (
          <span className="db-recent-row-logged">✓ Logged</span>
        ) : (
          <button
            type="button"
            className="db-btn-secondary"
            onClick={onLogClick}
          >
            Log activity <ArrowRight size={13} />
          </button>
        )}
      </div>
    </li>
  );
}

function LogActivityModal({ ev, userDomain, matches, onClose, onLogged }) {
  const startMs = getEventStartMs(ev);
  const externals = pickExternalAttendees(ev, userDomain);
  const primary = externals[0];
  const primaryEmail = primary?.emailAddress?.address?.toLowerCase() || '';
  const initialMatch = matches[primaryEmail] || null;

  const durationMinutes = (() => {
    if (!ev.end?.dateTime) return null;
    const ms = new Date(ev.end.dateTime).getTime() - startMs;
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return Math.round(ms / 60000);
  })();

  const [type, setType] = useState('');
  const [comments, setComments] = useState(ev.bodyPreview || '');
  const [contactId, setContactId] = useState(initialMatch?.kind === 'contact' ? initialMatch.id : '');
  const [candidateId, setCandidateId] = useState(initialMatch?.kind === 'candidate' ? initialMatch.id : '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  // Hold success result on screen so user can verify the new Bullhorn
  // appointment by ID instead of guessing whether the create silently failed.
  const [successResult, setSuccessResult] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!type) { setSubmitError('Pick an activity type.'); return; }
    if (!contactId && !candidateId) {
      setSubmitError('Need a Bullhorn ClientContact or Candidate ID.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await logMeetingActivity({
        outlookEventId: ev.id,
        type,
        dateBegin: startMs,
        subject: ev.subject || '',
        clientContactId: contactId ? Number(contactId) : null,
        candidateId: candidateId ? Number(candidateId) : null,
        comments: comments || '',
        durationMinutes,
      });
      setSuccessResult({
        appointmentId: res?.appointmentId ?? null,
        alreadyLogged: !!res?.alreadyLogged,
        verified: res?.verified ?? null,
        attendee: res?.attendee ?? null,
        note: res?.note ?? null,
      });
      setSubmitting(false);
    } catch (err) {
      setSubmitError(err.message || 'Failed to log activity.');
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    onLogged(ev.id);
  };

  return (
    <div className="db-modal-backdrop" onClick={onClose}>
      <div
        className="db-modal db-log-activity-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-log-activity-title"
      >
        <header className="db-modal-header">
          <h2 id="db-log-activity-title" className="db-modal-title">
            {successResult ? 'Activity logged' : 'Log activity'}
          </h2>
          <button
            type="button"
            className="db-modal-close"
            onClick={successResult ? handleDone : onClose}
            aria-label="Close"
          >×</button>
        </header>
        {successResult ? (
          <div className="db-log-activity-success">
            <div className="db-log-activity-meta">
              <div className="db-log-activity-meta-time">{formatRecentEventDate(startMs)}</div>
              <div className="db-log-activity-meta-subject">{ev.subject || '(no subject)'}</div>
            </div>
            <p className="db-log-activity-success-msg">
              {successResult.alreadyLogged
                ? 'This meeting was already logged in Bullhorn.'
                : 'Bullhorn confirmed the new appointment.'}
            </p>
            {successResult.appointmentId ? (
              <div className="db-log-activity-success-id">
                <span className="db-form-label">Bullhorn Appointment ID</span>
                <code>{successResult.appointmentId}</code>
                {successResult.verified ? (
                  <div className="db-log-activity-verify">
                    <div className="db-log-activity-verify-row">
                      <span className="db-form-label">Subject (read back from Bullhorn)</span>
                      <span className="db-log-activity-verify-val">
                        {successResult.verified.subject || '(no subject)'}
                      </span>
                    </div>
                    {successResult.verified.dateAdded && (
                      <div className="db-log-activity-verify-row">
                        <span className="db-form-label">Created in Bullhorn</span>
                        <span className="db-log-activity-verify-val">
                          {new Date(successResult.verified.dateAdded).toLocaleString('en-US', {
                            timeZone: 'America/Chicago',
                          })}
                        </span>
                      </div>
                    )}
                    {successResult.verified.clientContactReference && (
                      <div className="db-log-activity-verify-row">
                        <span className="db-form-label">Linked ClientContact</span>
                        <span className="db-log-activity-verify-val">
                          {successResult.verified.clientContactReference.firstName || ''}{' '}
                          {successResult.verified.clientContactReference.lastName || ''}{' '}
                          (#{successResult.verified.clientContactReference.id})
                        </span>
                      </div>
                    )}
                    {successResult.attendee && (
                      <div className="db-log-activity-verify-row">
                        <span className="db-form-label">AppointmentAttendee junction</span>
                        <span className="db-log-activity-verify-val">
                          {successResult.attendee.ok
                            ? `Created (id #${successResult.attendee.id})`
                            : `Failed: ${successResult.attendee.error}`}
                        </span>
                      </div>
                    )}
                    {successResult.note && (
                      <div className="db-log-activity-verify-row">
                        <span className="db-form-label">Bullhorn Note (Activity-tab visibility)</span>
                        <span className="db-log-activity-verify-val">
                          {successResult.note.ok
                            ? `Created (Note id #${successResult.note.id}) — should appear on contact's Activity tab`
                            : `Failed: ${successResult.note.error}`}
                        </span>
                      </div>
                    )}
                    <p className="db-log-activity-success-hint">
                      <strong>To verify in Bullhorn:</strong> open the linked ClientContact above
                      (not the appointment id) and look on its <strong>Activity</strong> tab —
                      that&rsquo;s where this appointment will appear. Bullhorn ids aren&rsquo;t unique
                      across entity types, so searching the Appointment id in the general Find
                      will land on an unrelated Candidate/Contact with the same number.
                    </p>
                  </div>
                ) : (
                  <p className="db-log-activity-success-hint">
                    To verify in Bullhorn, open the linked ClientContact and check its
                    <strong> Activity</strong> tab. (Bullhorn ids aren&rsquo;t unique across entity
                    types — searching this Appointment id in the general Find will surface an
                    unrelated record.)
                  </p>
                )}
              </div>
            ) : (
              <p className="db-log-activity-success-hint">
                Server reported success but didn&rsquo;t return an ID &mdash; check Railway logs
                for [createAppointment].
              </p>
            )}
            <footer className="db-modal-footer">
              <button
                type="button"
                className="db-btn-primary"
                onClick={handleDone}
              >
                Done
              </button>
            </footer>
          </div>
        ) : (
        <form className="db-log-activity-form" onSubmit={handleSubmit}>
          <div className="db-log-activity-meta">
            <div className="db-log-activity-meta-time">{formatRecentEventDate(startMs)}</div>
            <div className="db-log-activity-meta-subject">{ev.subject || '(no subject)'}</div>
          </div>

          <label className="db-form-row">
            <span className="db-form-label">Activity type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>

          <label className="db-form-row">
            <span className="db-form-label">
              Bullhorn ClientContact ID
              {initialMatch?.kind === 'contact' && (
                <span className="db-form-hint">
                  {' '}— matched from {primary?.emailAddress?.address}
                </span>
              )}
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              placeholder="e.g. 12345"
            />
          </label>

          <label className="db-form-row">
            <span className="db-form-label">
              Or Candidate ID
              {initialMatch?.kind === 'candidate' && (
                <span className="db-form-hint">
                  {' '}— matched from {primary?.emailAddress?.address}
                </span>
              )}
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              placeholder="e.g. 67890"
            />
          </label>

          <label className="db-form-row">
            <span className="db-form-label">Notes</span>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
            />
          </label>

          {submitError && <div className="db-form-error">{submitError}</div>}

          <footer className="db-modal-footer">
            <button
              type="button"
              className="db-btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="db-btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Logging…' : 'Log activity'}
            </button>
          </footer>
        </form>
        )}
      </div>
    </div>
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
