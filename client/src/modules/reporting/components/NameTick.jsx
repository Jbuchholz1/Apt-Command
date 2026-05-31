import { memo } from 'react';

// Custom recharts XAxis tick for charts keyed on a person's name. Stacks the
// name on two lines — first name on top, the remainder (last name) beneath —
// so adjacent labels don't overlap. Pass as `tick={<NameTick />}`; recharts
// injects x / y / payload. Pair with a slightly taller XAxis `height` so the
// second line isn't clipped.
function NameTick({ x, y, payload, fill = '#666', fontSize = 11 }) {
  const label = String(payload?.value ?? '').trim();
  const sp = label.indexOf(' ');
  const first = sp === -1 ? label : label.slice(0, sp);
  const rest = sp === -1 ? '' : label.slice(sp + 1);
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill={fill} fontSize={fontSize}>
        <tspan x={0} dy="0.71em">{first}</tspan>
        {rest ? <tspan x={0} dy="1.15em">{rest}</tspan> : null}
      </text>
    </g>
  );
}

export default memo(NameTick);
