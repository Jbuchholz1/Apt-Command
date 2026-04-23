function DistRow({ variant, label, count }) {
  return (
    <div className="ql-dist-row">
      <span className="ql-dist-row-left">
        <span className={`ql-dist-dot is-${variant}`} aria-hidden />
        <span className="ql-dist-row-label">{label}</span>
      </span>
      <span className="ql-dist-row-count">{count}</span>
    </div>
  );
}

export default function Distribution({ distribution }) {
  const { on = 0, atRisk = 0, off = 0 } = distribution || {};
  const total = Math.max(1, on + atRisk + off);
  const pct = (n) => `${(n / total) * 100}%`;

  return (
    <section className="ql-block ql-distribution">
      <div className="ql-block-eyebrow">D I S T R I B U T I O N</div>
      <div className="ql-dist-bar" aria-hidden>
        <span className="ql-dist-seg is-on" style={{ width: pct(on) }} />
        <span className="ql-dist-seg is-at-risk" style={{ width: pct(atRisk) }} />
        <span className="ql-dist-seg is-off" style={{ width: pct(off) }} />
      </div>
      <div className="ql-dist-rows">
        <DistRow variant="on" label="On track" count={on} />
        <DistRow variant="at-risk" label="At risk" count={atRisk} />
        <DistRow variant="off" label="Off track" count={off} />
      </div>
    </section>
  );
}
