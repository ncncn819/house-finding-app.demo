const LABELS = ['Safety', 'Commute', 'Cost', 'Nightlife']
const COLORS = ['#006B3C', '#1D4ED8', '#B8960C', '#CF142B']

function polarToCart(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export default function RadarChart({ values, size = 220 }) {
  const cx = size / 2
  const cy = size / 2
  const maxR = size * 0.38
  const n = 4
  const step = 360 / n

  const rings = [0.25, 0.5, 0.75, 1].map(frac =>
    Array.from({ length: n }, (_, i) => {
      const pt = polarToCart(cx, cy, maxR * frac, i * step)
      return `${pt.x},${pt.y}`
    }).join(' ')
  )

  const axes = Array.from({ length: n }, (_, i) => {
    const end = polarToCart(cx, cy, maxR, i * step)
    return { x1: cx, y1: cy, x2: end.x, y2: end.y }
  })

  const dataPoints = Object.values(values).map((v, i) => {
    const r = (v / 100) * maxR
    return polarToCart(cx, cy, r, i * step)
  })
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'

  // Axis-end dots only — no text labels in SVG
  const axisTips = Array.from({ length: n }, (_, i) =>
    polarToCart(cx, cy, maxR, i * step)
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}>
      {/* Chart — strictly clipped, no overflow */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: 'hidden', display: 'block' }}
      >
        <defs>
          <radialGradient id="radarGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#CF142B" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.10" />
          </radialGradient>
        </defs>

        {/* Grid rings */}
        {rings.map((pts, i) => (
          <polygon key={i} points={pts} fill="none"
            stroke="rgba(26,53,40,0.10)" strokeWidth="1" />
        ))}

        {/* Axes */}
        {axes.map((ax, i) => (
          <line key={i} x1={ax.x1} y1={ax.y1} x2={ax.x2} y2={ax.y2}
            stroke="rgba(26,53,40,0.08)" strokeWidth="1" />
        ))}

        {/* Data fill */}
        <path
          d={dataPath}
          fill="url(#radarGrad)"
          stroke="rgba(207,20,43,0.55)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Axis-tip markers */}
        {axisTips.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r={3}
            fill={COLORS[i]} opacity={0.35} />
        ))}

        {/* Data points */}
        {dataPoints.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r={5}
            fill={COLORS[i]} stroke="#fff" strokeWidth="2" />
        ))}
      </svg>

      {/* Legend grid — 2×2, always inside the panel */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '5px 10px',
        width: '100%',
        padding: '0 4px',
      }}>
        {LABELS.map((label, i) => (
          <div key={label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <div style={{
              width: 8, height: 8,
              borderRadius: '50%',
              background: COLORS[i],
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.67rem',
              fontWeight: 600,
              color: COLORS[i],
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              whiteSpace: 'nowrap',
            }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
