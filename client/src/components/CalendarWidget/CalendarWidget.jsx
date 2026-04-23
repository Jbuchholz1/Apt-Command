import { useState, useEffect, useMemo, useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  Users,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { getCalendarAccessToken, fetchTodaysEvents } from '../../lib/graphClient';
import './calendar-widget.css';

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const HOUR_ROW_HEIGHT = 56;
const TIMELINE_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_ROW_HEIGHT;

function formatTimeHM(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatTimeHour(h) {
  const hr = h % 12 === 0 ? 12 : h % 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hr} ${ampm}`;
}

function minutesUntil(nowMs, startMs) {
  return Math.max(0, Math.round((startMs - nowMs) / 60000));
}

function assignColumns(events) {
  const sorted = [...events].sort((a, b) => a.startMs - b.startMs);
  const lastEndPerCol = [];
  const assignments = new Map();
  for (const ev of sorted) {
    let col = 0;
    while (col < lastEndPerCol.length && lastEndPerCol[col] > ev.startMs) col++;
    lastEndPerCol[col] = ev.endMs;
    assignments.set(ev.id, col);
  }
  return { assignments, totalCols: Math.max(1, lastEndPerCol.length) };
}

export default function CalendarWidget() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showBeforeHours, setShowBeforeHours] = useState(false);
  const [showAfterHours, setShowAfterHours] = useState(false);
  const [nowTick, setNowTick] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!account) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const token = await getCalendarAccessToken(instance, account);
      const data = await fetchTodaysEvents(token);
      setEvents(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [instance, account]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const parsedEvents = useMemo(() => {
    return events
      .map((e) => {
        const startMs = new Date(e.start.dateTime).getTime();
        const endMs = new Date(e.end.dateTime).getTime();
        return {
          ...e,
          startMs,
          endMs,
          durationMin: Math.max(1, Math.round((endMs - startMs) / 60000)),
        };
      })
      .sort((a, b) => a.startMs - b.startMs);
  }, [events]);

  const { beforeHours, withinHours, afterHours } = useMemo(() => {
    const before = [];
    const within = [];
    const after = [];
    for (const ev of parsedEvents) {
      const d = new Date(ev.startMs);
      const hour = d.getHours() + d.getMinutes() / 60;
      if (hour < DAY_START_HOUR) before.push(ev);
      else if (hour >= DAY_END_HOUR) after.push(ev);
      else within.push(ev);
    }
    return { beforeHours: before, withinHours: within, afterHours: after };
  }, [parsedEvents]);

  const nowMs = nowTick.getTime();
  const inProgress = parsedEvents.find((e) => nowMs >= e.startMs && nowMs < e.endMs);
  const nextUp = parsedEvents.find((e) => e.startMs > nowMs);

  const totalHoursLabel = useMemo(() => {
    const totalMin = parsedEvents.reduce((sum, e) => sum + e.durationMin, 0);
    const hrs = totalMin / 60;
    return hrs.toFixed(1).replace(/\.0$/, '');
  }, [parsedEvents]);

  const columnLayout = useMemo(() => assignColumns(withinHours), [withinHours]);

  const today = nowTick.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const meetingCount = parsedEvents.length;

  if (loading) {
    return (
      <div className="calendar-widget-card">
        <div className="calendar-widget-header">
          <Calendar size={16} className="calendar-widget-icon" />
          <span className="calendar-widget-title">Today</span>
        </div>
        <div className="calendar-widget-body">
          <div className="skeleton-shimmer" style={{ height: 72, borderRadius: 8, margin: '0 0 14px' }} />
          <div className="skeleton-shimmer" style={{ height: 32, borderRadius: 6, margin: '0 0 8px' }} />
          <div className="skeleton-shimmer" style={{ height: 32, borderRadius: 6, margin: '0 0 8px' }} />
          <div className="skeleton-shimmer" style={{ height: 32, borderRadius: 6 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="calendar-widget-card">
        <div className="calendar-widget-header">
          <Calendar size={16} className="calendar-widget-icon" />
          <span className="calendar-widget-title">Today</span>
        </div>
        <div className="calendar-widget-error">
          <AlertTriangle size={20} className="calendar-widget-error-icon" />
          <div className="calendar-widget-error-text">
            <div className="calendar-widget-error-title">Couldn&rsquo;t load your calendar</div>
            <div className="calendar-widget-error-msg">{error.message || 'Unknown error'}</div>
          </div>
          <button className="calendar-widget-retry" onClick={handleRefresh}>
            <RefreshCw size={13} className={refreshing ? 'cw-spinning' : ''} /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (parsedEvents.length === 0) {
    return (
      <div className="calendar-widget-card">
        <div className="calendar-widget-header">
          <Calendar size={16} className="calendar-widget-icon" />
          <span className="calendar-widget-title">Today</span>
          <button className="calendar-widget-refresh-btn" onClick={handleRefresh} title="Refresh">
            <RefreshCw size={14} className={refreshing ? 'cw-spinning' : ''} />
          </button>
        </div>
        <div className="calendar-widget-empty">
          <div className="calendar-widget-empty-title">Nothing on the books</div>
          <div className="calendar-widget-empty-sub">go make money.</div>
        </div>
      </div>
    );
  }

  const expanded = expandedId ? parsedEvents.find((e) => e.id === expandedId) : null;

  return (
    <div className="calendar-widget-card">
      <div className="calendar-widget-header">
        <Calendar size={16} className="calendar-widget-icon" />
        <span className="calendar-widget-title">Today</span>
        <span className="calendar-widget-meta">
          {today} · {meetingCount} meeting{meetingCount === 1 ? '' : 's'} · {totalHoursLabel} hr
        </span>
        <button className="calendar-widget-refresh-btn" onClick={handleRefresh} title="Refresh">
          <RefreshCw size={14} className={refreshing ? 'cw-spinning' : ''} />
        </button>
      </div>

      <div className="calendar-nextup">
        {inProgress ? (
          <>
            <div className="calendar-nextup-label">In progress</div>
            <div className="calendar-nextup-subject">{inProgress.subject || '(no subject)'}</div>
            <div className="calendar-nextup-time">ends {formatTimeHM(new Date(inProgress.endMs))}</div>
            {inProgress.onlineMeeting?.joinUrl && (
              <a
                className="calendar-nextup-btn"
                href={inProgress.onlineMeeting.joinUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Video size={13} /> Join Teams
              </a>
            )}
          </>
        ) : nextUp ? (
          <>
            <div className="calendar-nextup-label">Next up</div>
            <div className="calendar-nextup-subject">{nextUp.subject || '(no subject)'}</div>
            <div className="calendar-nextup-time">
              in {minutesUntil(nowMs, nextUp.startMs)} min · {formatTimeHM(new Date(nextUp.startMs))}
            </div>
            {nextUp.onlineMeeting?.joinUrl && (
              <a
                className="calendar-nextup-btn"
                href={nextUp.onlineMeeting.joinUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Video size={13} /> Join Teams
              </a>
            )}
          </>
        ) : (
          <>
            <div className="calendar-nextup-label">All clear</div>
            <div className="calendar-nextup-subject">No more meetings today 🎉</div>
          </>
        )}
      </div>

      <div className="calendar-timeline-wrap">
        {beforeHours.length > 0 && (
          <>
            <button
              className="calendar-hours-indicator"
              onClick={() => setShowBeforeHours((v) => !v)}
            >
              {showBeforeHours ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              + {beforeHours.length} earlier
            </button>
            {showBeforeHours && (
              <div className="calendar-hours-list">
                {beforeHours.map((ev) => (
                  <EventListRow
                    key={ev.id}
                    ev={ev}
                    expandedId={expandedId}
                    setExpandedId={setExpandedId}
                    nowMs={nowMs}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="calendar-timeline" style={{ height: TIMELINE_HEIGHT }}>
          {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => {
            const h = DAY_START_HOUR + i;
            return (
              <div
                key={h}
                className="calendar-hour-row"
                style={{ top: i * HOUR_ROW_HEIGHT, height: HOUR_ROW_HEIGHT }}
              >
                <span className="calendar-hour-label">{formatTimeHour(h)}</span>
              </div>
            );
          })}

          {(() => {
            const nowHour = nowTick.getHours() + nowTick.getMinutes() / 60;
            if (nowHour < DAY_START_HOUR || nowHour >= DAY_END_HOUR) return null;
            const top = (nowHour - DAY_START_HOUR) * HOUR_ROW_HEIGHT;
            return <div className="calendar-now-line" style={{ top }} aria-hidden />;
          })()}

          <div className="calendar-event-area">
            {withinHours.map((ev) => {
              const startDate = new Date(ev.startMs);
              const hourOffset = startDate.getHours() + startDate.getMinutes() / 60 - DAY_START_HOUR;
              const top = hourOffset * HOUR_ROW_HEIGHT;
              const height = Math.max(22, (ev.durationMin / 60) * HOUR_ROW_HEIGHT - 2);
              const col = columnLayout.assignments.get(ev.id) || 0;
              const widthPct = 100 / columnLayout.totalCols;
              const isInProgress = nowMs >= ev.startMs && nowMs < ev.endMs;
              return (
                <button
                  key={ev.id}
                  type="button"
                  className={
                    'calendar-event-block'
                    + (isInProgress ? ' in-progress' : '')
                    + (expandedId === ev.id ? ' expanded' : '')
                  }
                  style={{
                    top,
                    height,
                    left: `calc(${col * widthPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                  }}
                  onClick={() => setExpandedId((cur) => (cur === ev.id ? null : ev.id))}
                >
                  <div className="calendar-event-subject">{ev.subject || '(no subject)'}</div>
                  <div className="calendar-event-time">
                    {formatTimeHM(new Date(ev.startMs))}&ndash;{formatTimeHM(new Date(ev.endMs))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {afterHours.length > 0 && (
          <>
            <button
              className="calendar-hours-indicator"
              onClick={() => setShowAfterHours((v) => !v)}
            >
              {showAfterHours ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              + {afterHours.length} later
            </button>
            {showAfterHours && (
              <div className="calendar-hours-list">
                {afterHours.map((ev) => (
                  <EventListRow
                    key={ev.id}
                    ev={ev}
                    expandedId={expandedId}
                    setExpandedId={setExpandedId}
                    nowMs={nowMs}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="calendar-mobile-list">
        {parsedEvents.map((ev) => (
          <EventListRow
            key={ev.id}
            ev={ev}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            nowMs={nowMs}
          />
        ))}
      </div>

      {expanded && <EventDetailPanel ev={expanded} onClose={() => setExpandedId(null)} />}
    </div>
  );
}

function EventListRow({ ev, expandedId, setExpandedId, nowMs }) {
  const isInProgress = nowMs >= ev.startMs && nowMs < ev.endMs;
  return (
    <button
      type="button"
      className={
        'calendar-list-row'
        + (isInProgress ? ' in-progress' : '')
        + (expandedId === ev.id ? ' expanded' : '')
      }
      onClick={() => setExpandedId((cur) => (cur === ev.id ? null : ev.id))}
    >
      <div className="calendar-list-time">{formatTimeHM(new Date(ev.startMs))}</div>
      <div className="calendar-list-subject">
        <span className="calendar-list-subject-text">{ev.subject || '(no subject)'}</span>
        {ev.onlineMeeting?.joinUrl && <Video size={11} className="calendar-list-online" />}
      </div>
      <div className="calendar-list-duration">{formatTimeHM(new Date(ev.endMs))}</div>
    </button>
  );
}

function EventDetailPanel({ ev, onClose }) {
  const preview = ev.bodyPreview || '';
  const truncated = preview.length > 200 ? `${preview.slice(0, 200).trim()}…` : preview;
  return (
    <div className="calendar-detail-panel">
      <div className="calendar-detail-header">
        <div className="calendar-detail-subject">{ev.subject || '(no subject)'}</div>
        <button
          type="button"
          className="calendar-detail-close"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
      </div>
      <div className="calendar-detail-meta">
        <Clock size={12} />
        <span>
          {formatTimeHM(new Date(ev.startMs))} &ndash; {formatTimeHM(new Date(ev.endMs))}
        </span>
        <span className="calendar-detail-dot">·</span>
        <span>{ev.durationMin} min</span>
      </div>
      {ev.location?.displayName && (
        <div className="calendar-detail-meta">
          <MapPin size={12} />
          <span>{ev.location.displayName}</span>
        </div>
      )}
      {ev.attendees && ev.attendees.length > 0 && (
        <div className="calendar-detail-section">
          <div className="calendar-detail-section-label">
            <Users size={12} /> {ev.attendees.length} attendee{ev.attendees.length === 1 ? '' : 's'}
          </div>
          <div className="calendar-detail-attendees">
            {ev.attendees.slice(0, 8).map((a, i) => (
              <span key={`${a.emailAddress?.address || i}-${i}`} className="calendar-detail-attendee">
                {a.emailAddress?.name || a.emailAddress?.address || 'Unknown'}
              </span>
            ))}
            {ev.attendees.length > 8 && (
              <span className="calendar-detail-attendee-more">
                +{ev.attendees.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}
      {truncated && <div className="calendar-detail-body">{truncated}</div>}
      {ev.onlineMeeting?.joinUrl && (
        <a
          className="calendar-detail-join"
          href={ev.onlineMeeting.joinUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Video size={13} /> Join Teams <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}
