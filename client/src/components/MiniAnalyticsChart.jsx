export default function MiniAnalyticsChart({ values = [2, 4, 3, 6, 5, 7, 4] }) {
  const width = 280;
  const height = 120;
  const max = Math.max(...values, 1);
  const barWidth = 26;
  const gap = 12;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[130px] w-full">
      {values.map((value, idx) => {
        const barHeight = (value / max) * 95;
        const x = idx * (barWidth + gap) + 6;
        const y = height - barHeight - 12;
        return (
          <g key={`${value}-${idx}`}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="8"
              fill="url(#analyticsBarGradient)"
              opacity="0.9"
            />
          </g>
        );
      })}
      <defs>
        <linearGradient id="analyticsBarGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>
    </svg>
  );
}
