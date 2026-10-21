import './Environment.css'

function Environment({ stage, sweepToken }) {
  return (
    <div className="env" data-stage={stage} aria-hidden="true">
      <div className="env-wash env-wash-a" />
      <div className="env-wash env-wash-b" />
      <svg className="env-maze" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
        <g className="maze maze-landing">
          <path className="maze-line tint-ink" d="M -20 210 L 420 210 Q 450 210 450 180 L 450 120 L 820 120 Q 850 120 850 150 L 850 300 L 1180 300 Q 1210 300 1210 270 L 1210 190 L 1640 190" />
          <path className="maze-trace" d="M -20 210 L 420 210 Q 450 210 450 180 L 450 120 L 820 120 Q 850 120 850 150 L 850 300 L 1180 300 Q 1210 300 1210 270 L 1210 190 L 1640 190" pathLength="1" />
          <path className="maze-line tint-peri" d="M -20 720 L 260 720 Q 290 720 290 750 L 290 820 L 600 820 Q 630 820 630 790 L 630 720 L 1000 720" />
        </g>
        <g className="maze maze-select">
          <path className="maze-line tint-ink" d="M 1640 110 L 1360 110 Q 1330 110 1330 140 L 1330 270 L 1490 270 Q 1520 270 1520 300 L 1520 430 L 1640 430" />
          <path className="maze-line tint-peri" d="M -20 790 L 230 790 Q 260 790 260 760 L 260 660 L 390 660" />
        </g>
        <g className="maze maze-workspace">
          <path className="maze-line tint-ink" d="M -20 870 L 300 870 Q 330 870 330 840 L 330 790 L 700 790" />
          <path className="maze-trace" d="M 520 930 L 520 850 L 980 850 Q 1010 850 1010 820 L 1010 760 L 1180 760" pathLength="1" />
          <path className="maze-line tint-peri" d="M 1640 870 L 1400 870 Q 1370 870 1370 840 L 1370 780" />
        </g>
        {sweepToken > 0 && <path key={sweepToken} className="maze-go" d="M -20 520 L 380 520 Q 410 520 410 490 L 410 400 L 860 400 Q 890 400 890 430 L 890 600 L 1240 600 Q 1270 600 1270 570 L 1270 470 L 1640 470" pathLength="1" />}
      </svg>
      <div className="env-cell cell-a" />
      <div className="env-cell cell-b" />
      <div className="env-cell cell-c" />
    </div>
  )
}

export default Environment
