import { Plus } from 'lucide-react';

function getVolumeIssue(d = new Date()) {
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const dayOfYear = Math.floor((d - start) / 86400000) + 1;
  const vol = String(year).slice(-2);
  return `Vol. ${vol} / Issue ${dayOfYear}`;
}

export default function LedgerMasthead({ onNewGoal, canCreate = true, archiveMode = false }) {
  const volumeIssue = getVolumeIssue();
  return (
    <header className="ql-masthead">
      <div className="ql-masthead-eyebrow">
        <span className="ql-eyebrow-text">
          {archiveMode ? 'THE · QUARTERLY · LEDGER · ARCHIVE' : 'THE · QUARTERLY · LEDGER'}
        </span>
        <span className="ql-masthead-rule" aria-hidden />
        <span className="ql-volume">{volumeIssue}</span>
      </div>

      <div className="ql-headline-row">
        <h1 className="ql-headline">
          <span className="ql-headline-line1">The goals we&rsquo;ve set.</span>
          <span className="ql-headline-line2">The ones still out ahead.</span>
        </h1>
        {canCreate && !archiveMode && (
          <button type="button" className="ql-btn-primary ql-new-goal" onClick={onNewGoal}>
            <Plus size={14} />
            <span>New Goal</span>
          </button>
        )}
      </div>

      <div className="ql-gold-rule" aria-hidden />
    </header>
  );
}
