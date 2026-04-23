export default function WatermarkCorner() {
  return (
    <svg
      className="ql-watermark"
      width="420"
      height="480"
      viewBox="0 0 420 480"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="var(--apt-navy)"
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <polygon points="210,40 320,103 320,229 210,292 100,229 100,103" />
        <polygon points="210,90 275,128 275,204 210,242 145,204 145,128" />
        <polygon points="210,140 230,151 230,173 210,184 190,173 190,151" />
        <line x1="210" y1="40" x2="210" y2="90" />
        <line x1="320" y1="103" x2="275" y2="128" />
        <line x1="320" y1="229" x2="275" y2="204" />
        <line x1="210" y1="292" x2="210" y2="242" />
        <line x1="100" y1="229" x2="145" y2="204" />
        <line x1="100" y1="103" x2="145" y2="128" />
        <polygon points="60,300 110,329 110,387 60,416 10,387 10,329" />
        <polygon points="360,340 400,363 400,409 360,432 320,409 320,363" />
        <circle cx="210" cy="163" r="3.5" fill="var(--apt-navy)" stroke="none" />
        <circle cx="60" cy="358" r="2.5" fill="var(--apt-navy)" stroke="none" />
        <circle cx="360" cy="386" r="2.5" fill="var(--apt-navy)" stroke="none" />
      </g>
    </svg>
  );
}
