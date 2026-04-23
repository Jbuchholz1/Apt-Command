import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  shiftPeriod,
  periodProgress,
  periodBounds,
  formatPeriod,
  formatPeriodRange,
  getCurrentPeriod,
} from '../lib/period';

function daysIntoQuarter(period, now = new Date()) {
  const { start } = periodBounds(period);
  return Math.max(1, Math.floor((now - start) / 86400000) + 1);
}

function daysInQuarter(period) {
  const { start, end } = periodBounds(period);
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function dayEyebrow(period, now = new Date()) {
  const monthDay = now
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
  return `${monthDay} · DAY ${daysIntoQuarter(period, now)} OF ${daysInQuarter(period)}`;
}

export default function QuarterSwitcher({ period, onChange }) {
  const currentPeriod = getCurrentPeriod();
  const isCurrent = period === currentPeriod;
  const progress = isCurrent ? periodProgress(period) : (period < currentPeriod ? 1 : 0);
  const rightEyebrow = isCurrent ? dayEyebrow(period) : formatPeriodRange(period).toUpperCase();
  const pctLabel = `${Math.round(progress * 100)}% THROUGH QUARTER`;

  return (
    <section className="ql-quarter">
      <div className="ql-quarter-row">
        <button
          type="button"
          className="ql-quarter-btn"
          onClick={() => onChange(shiftPeriod(period, -1))}
          aria-label="Previous quarter"
        >
          <ChevronLeft size={16} />
        </button>
        <h2 className="ql-quarter-title">{formatPeriod(period)}</h2>
        {isCurrent && <span className="ql-current-pill">CURRENT</span>}
        <button
          type="button"
          className="ql-quarter-btn"
          onClick={() => onChange(shiftPeriod(period, 1))}
          aria-label="Next quarter"
        >
          <ChevronRight size={16} />
        </button>
        <span className="ql-quarter-spacer" />
        <span className="ql-quarter-eyebrow">{rightEyebrow}</span>
      </div>

      <div className="ql-quarter-progress">
        <span className="ql-quarter-progress-track" aria-hidden>
          <span
            className="ql-quarter-progress-fill"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
          <span
            className="ql-quarter-progress-dot"
            style={{ left: `${Math.round(progress * 100)}%` }}
          />
        </span>
        <span className="ql-quarter-progress-label">{pctLabel}</span>
      </div>
    </section>
  );
}
