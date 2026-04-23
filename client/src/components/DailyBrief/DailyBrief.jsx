import { useState, useEffect, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getAnnouncement, getMyDashboard, getJobs } from '../../lib/api';
import { getCalendarAccessToken, fetchTodaysEvents } from '../../lib/graphClient';
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

function jobToPriority(job) {
  const letter = job.priority; // 'A' or 'B'
  const kind = letter === 'A' ? 'urgent' : 'interview';
  const addedMs = job.dateAdded ? new Date(job.dateAdded).getTime() : Date.now();
  const daysOpen = Math.max(0, Math.floor((Date.now() - addedMs) / 86400000));
  const loc = [job.city, job.state].filter(Boolean).join(', ');
  const parts = [
    `${daysOpen} day${daysOpen === 1 ? '' : 's'} in Accepting Candidates`,
    job.employmentType,
    loc,
  ].filter(Boolean);
  return {
    id: `job-${job.id}`,
    kind,
    pillLabel: `${letter}-REQ`,
    clientLabel: job.client || 'Unknown client',
    headline: job.title || '(Untitled req)',
    context: `${parts.join(' · ')}.`,
    action: { label: 'Open req', href: '/req-board' },
  };
}

function extractMyPriorities(jobs, fullName) {
  if (!Array.isArray(jobs) || !fullName) return [];
  const me = fullName.toLowerCase();
  return jobs
    .filter(
      (j) =>
        j.status === 'Accepting Candidates'
        && (j.priority === 'A' || j.priority === 'B')
        && (j.owner || '').toLowerCase() === me,
    )
    .sort((a, b) => {
      const aMs = a.dateAdded ? new Date(a.dateAdded).getTime() : Infinity;
      const bMs = b.dateAdded ? new Date(b.dateAdded).getTime() : Infinity;
      return aMs - bMs;
    })
    .slice(0, 3)
    .map(jobToPriority);
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
  const fullName = account?.name || '';
  const firstName = fullName.split(' ')[0] || 'there';

  const now = new Date();
  const dateEyebrow = getDateEyebrow(now);
  const volumeIssue = getVolumeIssue(now);

  return (
    <div className="daily-brief">
      <Masthead firstName={firstName} dateEyebrow={dateEyebrow} volumeIssue={volumeIssue} />
      <div className="db-columns">
        <PrioritiesColumn fullName={fullName} />
        <SideRail fullName={fullName} />
      </div>
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

function PrioritiesColumn({ fullName }) {
  const navigate = useNavigate();
  const [priorities, setPriorities] = useState(null);
  const [totalMine, setTotalMine] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getJobs()
      .then((jobs) => {
        if (cancelled) return;
        setPriorities(extractMyPriorities(jobs, fullName));
        if (Array.isArray(jobs) && fullName) {
          const me = fullName.toLowerCase();
          setTotalMine(jobs.filter((j) => isActiveJob(j) && (j.owner || '').toLowerCase() === me).length);
        }
      })
      .catch(() => {
        if (!cancelled) setPriorities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fullName]);

  const remainingCount = totalMine != null && priorities ? Math.max(0, totalMine - priorities.length) : null;

  return (
    <section className="db-priorities">
      <div className="db-block-eyebrow db-priorities-eyebrow">PRIORITIES — IN ORDER</div>
      <div className="db-priority-stack">
        {priorities === null ? (
          <>
            <div className="skeleton-shimmer db-priority-skeleton" />
            <div className="skeleton-shimmer db-priority-skeleton" />
            <div className="skeleton-shimmer db-priority-skeleton" />
          </>
        ) : priorities.length === 0 ? (
          <div className="db-priorities-empty">
            No A or B reqs accepting candidates on your board right now.
          </div>
        ) : (
          priorities.map((p, i) => <PriorityCard key={p.id} priority={p} index={i} />)
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

function SideRail({ fullName }) {
  return (
    <aside className="db-side-rail">
      <TodayAtAGlance fullName={fullName} />
      <YourDay />
      <AnnouncementCard />
    </aside>
  );
}

function TodayAtAGlance({ fullName }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const today = new Date();
    const todayISO = toISODate(today);
    const qtrStartISO = toISODate(getQuarterStart(today));

    Promise.allSettled([
      getMyDashboard(qtrStartISO, todayISO),
      getJobs(),
    ]).then(([qtdRes, jobsRes]) => {
      if (cancelled) return;
      const qtd = qtdRes.status === 'fulfilled' ? qtdRes.value : null;
      const jobs = jobsRes.status === 'fulfilled' && Array.isArray(jobsRes.value)
        ? jobsRes.value
        : null;

      const active = jobs
        ? jobs.filter((j) => isActiveJob(j) && (j.owner || '').toLowerCase() === fullName.toLowerCase()).length
        : null;

      setStats({
        active,
        newInput: qtd?.newInput ?? qtd?.metrics?.newInput ?? null,
        placements: qtd?.placements ?? qtd?.metrics?.placements ?? null,
        clientSubs: qtd?.clientSubs ?? qtd?.metrics?.clientSubs ?? null,
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fullName]);

  const items = useMemo(
    () => [
      { value: stats?.active, label: 'Active jobs assigned to you', format: 'number' },
      { value: stats?.newInput, label: 'New Input QTD', format: 'currency-k' },
      { value: stats?.placements, label: 'Placements QTD', format: 'number' },
      { value: stats?.clientSubs, label: 'Client submissions', format: 'number' },
    ],
    [stats],
  );

  return (
    <section className="db-block db-glance">
      <div className="db-block-eyebrow">TODAY · AT · A · GLANCE</div>
      <div className="db-glance-grid">
        {items.map((item) => (
          <div className="db-glance-stat" key={item.label}>
            {loading ? (
              <div className="skeleton-shimmer db-glance-skeleton" />
            ) : (
              <div className="db-glance-value">
                {item.value == null
                  ? '—'
                  : item.format === 'currency-k'
                    ? formatCurrencyCompact(item.value)
                    : item.value}
              </div>
            )}
            <div className="db-glance-label">{item.label}</div>
          </div>
        ))}
      </div>
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
