import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  shiftPeriod,
  periodProgress,
  formatPeriod,
  formatPeriodRange,
  getCurrentPeriod,
} from '../lib/period';

export default function QuarterNavigator({ period, onChange }) {
  const currentPeriod = getCurrentPeriod();
  const isCurrent = period === currentPeriod;
  const progress = isCurrent ? periodProgress(period) : 1;
  const progressLabel = isCurrent ? `${Math.round(progress * 100)}% through quarter` : formatPeriodRange(period);

  return (
    <div className="gt-quarter-nav">
      <button
        className="gt-nav-btn"
        onClick={() => onChange(shiftPeriod(period, -1))}
        title="Previous quarter"
      >
        <ChevronLeft size={18} />
      </button>

      <div className="gt-nav-center">
        <div className="gt-nav-label">
          <span className="gt-nav-period">{formatPeriod(period)}</span>
          {isCurrent && <span className="gt-nav-current-pill">Current</span>}
        </div>
        <div className="gt-nav-progress-track">
          <div
            className="gt-nav-progress-fill"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="gt-nav-sub">{progressLabel}</div>
      </div>

      <button
        className="gt-nav-btn"
        onClick={() => onChange(shiftPeriod(period, 1))}
        title="Next quarter"
      >
        <ChevronRight size={18} />
      </button>

      {!isCurrent && (
        <button
          className="gt-nav-today"
          onClick={() => onChange(currentPeriod)}
          title="Jump to current quarter"
        >
          Today
        </button>
      )}
    </div>
  );
}
