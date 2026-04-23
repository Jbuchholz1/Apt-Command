import { useState, useEffect, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getAnnouncement, getMyDashboard, getJobs } from '../../lib/api';
import { getCalendarAccessToken, fetchTodaysEvents } from '../../lib/graphClient';
import { DEFAULT_PRIORITIES } from './priorities.data';
import './daily-brief.css';

const PILL_LABELS = { urgent: 'URGENT', interview: 'INTERVIEW', offer: 'OFFER' };

function getDateEyebrow(d = new Date()) {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  return `${weekday} · ${monthDay}`;
}

function getVolumeIssue(d = new Date()) {
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const dayOfYear = Math.floor((d - start) / 86400000) + 1;
  const vol = String(Math.max(1, year - 2023)).padStart(2, '0');
  return `Vol. ${vol} / Issue ${dayOfYear}`;
}

function getWeekStart(d = new Date()) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
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
        <PrioritiesColumn />
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

function PrioritiesColumn() {
  const navigate = useNavigate();
  return (
    <section className="db-priorities">
      <div className="db-block-eyebrow db-priorities-eyebrow">PRIORITIES — IN ORDER</div>
      <div className="db-priority-stack">
        {DEFAULT_PRIORITIES.map((p, i) => (
          <PriorityCard key={p.id} priority={p} index={i} />
        ))}
      </div>
      <div className="db-priorities-footer">
        <span className="db-priorities-footer-text">
          Plus 14 more active items in your Req Board.
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
  const { kind, clientLabel, headline, context, action } = priority;
  const indexLabel = String(index + 1).padStart(2, '0');
  return (
    <article className={`db-priority-card ${index === 0 ? 'is-first' : ''}`}>
      <div className="db-priority-index">{indexLabel}</div>
      <div className="db-priority-body">
        <div className="db-priority-meta">
          <span className={`db-pill db-pill-${kind}`}>{PILL_LABELS[kind]}</span>
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
    const weekStartISO = toISODate(getWeekStart(today));
    const qtrStartISO = toISODate(getQuarterStart(today));

    Promise.allSettled([
      getMyDashboard(weekStartISO, todayISO),
      getMyDashboard(qtrStartISO, todayISO),
      getJobs(),
    ]).then(([weekRes, qtdRes, jobsRes]) => {
      if (cancelled) return;
      const week = weekRes.status === 'fulfilled' ? weekRes.value : null;
      const qtd = qtdRes.status === 'fulfilled' ? qtdRes.value : null;
      const jobs = jobsRes.status === 'fulfilled' && Array.isArray(jobsRes.value)
        ? jobsRes.value
        : null;

      const active = jobs
        ? jobs.filter((j) => j.isOpen && (j.owner || '').toLowerCase() === fullName.toLowerCase()).length
        : null;

      setStats({
        active,
        subsWeek: week?.clientSubs ?? week?.metrics?.clientSubs ?? null,
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
      { value: stats?.active, label: 'Active jobs assigned to you' },
      { value: stats?.subsWeek, label: 'Submittals this week' },
      { value: stats?.placements, label: 'Placements QTD' },
      { value: stats?.clientSubs, label: 'Client submissions' },
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
                {item.value == null ? '—' : item.value}
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
      {(announcement.author || announcement.postedAt) && (
        <div className="db-announcement-footer">
          {announcement.author}
          {announcement.postedAt && ` · ${announcement.postedAt}`}
        </div>
      )}
    </section>
  );
}
