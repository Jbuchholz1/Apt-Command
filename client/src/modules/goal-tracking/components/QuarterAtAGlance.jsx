function Stat({ value, label, suffix }) {
  return (
    <div className="ql-glance-stat">
      <div className="ql-glance-value">
        {value}
        {suffix && <sup className="ql-glance-suffix">{suffix}</sup>}
      </div>
      <div className="ql-glance-label">{label}</div>
    </div>
  );
}

export default function QuarterAtAGlance({ aggregates }) {
  const { active = 0, priorities = 0, onTrack = 0, aggregatePct = 0 } = aggregates || {};
  return (
    <section className="ql-block ql-glance">
      <div className="ql-block-eyebrow">THE · QUARTER · AT · A · GLANCE</div>
      <div className="ql-glance-grid">
        <Stat value={active} label="Active goals" />
        <Stat value={priorities} label="Company priorities" />
        <Stat value={onTrack} label="On track" />
        <Stat value={Math.round(aggregatePct)} suffix="%" label="Aggregate progress" />
      </div>
    </section>
  );
}
