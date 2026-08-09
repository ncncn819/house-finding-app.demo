import { useEffect, useMemo, useState } from 'react'
import styles from './TrendChart.module.css'

const WIDTH = 520
const HEIGHT = 220
const PAD_X = 36
const PAD_TOP = 18
const PAD_BOTTOM = 36
const CHART_W = WIDTH - PAD_X * 2
const CHART_H = HEIGHT - PAD_TOP - PAD_BOTTOM

const METRICS = {
  crime: {
    label: 'Crime',
    lineColor: '#66e0a3',
  },
  rent: {
    label: 'Rent',
    lineColor: '#7bc8ff',
  },
}

function domainFrom(values) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min * 0.2)
    return [Math.max(0, min - pad), max + pad]
  }
  const pad = (max - min) * 0.12
  return [Math.max(0, min - pad), max + pad]
}

export default function TrendChart({ crime, rent }) {
  const [metric, setMetric] = useState('crime')
  const [hoveredIdx, setHoveredIdx] = useState(null)

  const seriesByMetric = { crime, rent }
  const hasSeries = key => Array.isArray(seriesByMetric[key]?.series) && seriesByMetric[key].series.length > 0
  const isLoading = key => Boolean(seriesByMetric[key]?.loading)
  const isDisabled = key => !isLoading(key) && !hasSeries(key)

  useEffect(() => {
    if (metric === 'crime' && isDisabled('crime') && hasSeries('rent')) setMetric('rent')
    if (metric === 'rent' && isDisabled('rent') && hasSeries('crime')) setMetric('crime')
  }, [metric, crime?.loading, crime?.series, rent?.loading, rent?.series])

  const active = seriesByMetric[metric] || { series: null, loading: false, error: '' }

  const cleanSeries = useMemo(() => {
    const raw = Array.isArray(active?.series) ? active.series : []
    const mapped = raw
      .map(item => {
        const rentValue = item?.median_gbp ?? item?.index_avg
        const value = metric === 'crime' ? Number(item?.weighted_per_1k) : Number(rentValue)
        return {
          year: Number(item?.year),
          value,
          valueKind: item?.median_gbp != null ? 'currency' : 'index',
          monthsCounted: item?.months_counted == null ? null : Number(item.months_counted),
          yoyPct: item?.yoy_pct == null ? null : Number(item.yoy_pct),
          releasePeriod: typeof item?.release_period === 'string' ? item.release_period : null,
        }
      })
      .filter(item => Number.isFinite(item.year) && Number.isFinite(item.value))
      .sort((a, b) => a.year - b.year)

    return mapped.slice(-5)
  }, [active?.series, metric])

  const hasRentCurrency = metric === 'rent' && cleanSeries.some(item => item.valueKind === 'currency')

  const { points, yTicks } = useMemo(() => {
    if (!cleanSeries.length) return { points: [], yTicks: [] }

    const values = cleanSeries.map(item => item.value)
    const [dMin, dMax] = domainFrom(values)
    const n = cleanSeries.length

    const nextPoints = cleanSeries.map((item, idx) => {
      const x = n === 1 ? PAD_X + CHART_W / 2 : PAD_X + (idx * CHART_W) / (n - 1)
      const ratio = (item.value - dMin) / (dMax - dMin || 1)
      const y = PAD_TOP + (1 - ratio) * CHART_H
      return { ...item, x, y }
    })

    const ticks = [0, 1, 2, 3].map(i => {
      const ratio = i / 3
      const y = PAD_TOP + ratio * CHART_H
      const value = dMax - ratio * (dMax - dMin)
      return { y, value }
    })

    return { points: nextPoints, yTicks: ticks }
  }, [cleanSeries])

  const hovered = hoveredIdx == null ? null : points[hoveredIdx] || null
  const linePoints = points.map(pt => `${pt.x},${pt.y}`).join(' ')

  const formatTick = value => {
    if (metric === 'crime') return value.toFixed(1)
    return hasRentCurrency ? `£${Math.round(value).toLocaleString()}` : value.toFixed(1)
  }

  const formatValue = value => {
    if (metric === 'crime') return `${value.toFixed(2)} weighted / 1k`
    return hasRentCurrency
      ? `£${Math.round(value).toLocaleString()} / mo`
      : `${value.toFixed(2)} index`
  }

  return (
    <section className={styles.card}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>Trend - last 5 years</h3>
        <div className={styles.toggle} role="tablist" aria-label="Trend metric">
          {['crime', 'rent'].map(key => {
            const activeKey = metric === key
            return (
              <button
                key={key}
                type="button"
                className={`${styles.toggleBtn} ${activeKey ? styles.toggleBtnActive : ''}`}
                onClick={() => setMetric(key)}
                disabled={isDisabled(key)}
                role="tab"
                aria-selected={activeKey}
              >
                <span className={styles.toggleLabel}>{METRICS[key].label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.chartShell}>
        {active.loading && <p className={styles.statusText}>Loading yearly trend...</p>}
        {!active.loading && !points.length && <p className={styles.statusText}>{active.error || 'Trend unavailable for this metric'}</p>}

        {!!points.length && (
          <div className={styles.chartWrap}>
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.svg} role="img" aria-label={`${METRICS[metric].label} trend over five years`}>
              {yTicks.map((tick, idx) => (
                <g key={idx}>
                  <line x1={PAD_X} x2={WIDTH - PAD_X} y1={tick.y} y2={tick.y} className={styles.grid} />
                  <text x={8} y={tick.y + 4} className={styles.tickText}>{formatTick(tick.value)}</text>
                </g>
              ))}

              <polyline
                points={linePoints}
                fill="none"
                stroke={METRICS[metric].lineColor}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.linePath}
              />

              {points.map((pt, idx) => {
                const hoveredPoint = hoveredIdx === idx
                return (
                  <g
                    key={`${pt.year}-${idx}`}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hoveredPoint ? 6.5 : 4.2}
                      fill={METRICS[metric].lineColor}
                      className={`${styles.point} ${hoveredPoint ? styles.pointActive : ''}`}
                    />
                    <text x={pt.x} y={HEIGHT - 8} textAnchor="middle" className={styles.yearLabel}>{pt.year}</text>
                  </g>
                )
              })}
            </svg>

            {hovered && (
              <div
                className={styles.tooltip}
                style={{
                  left: `${(hovered.x / WIDTH) * 100}%`,
                  top: `${(hovered.y / HEIGHT) * 100}%`,
                }}
              >
                <div className={styles.tooltipTitle}>{metric === 'rent' && hovered.releasePeriod ? hovered.releasePeriod : hovered.year}</div>
                <div className={styles.tooltipValue}>{formatValue(hovered.value)}</div>
                {metric === 'rent' && hovered.yoyPct != null && (
                  <div className={styles.tooltipSub}>YoY {hovered.yoyPct > 0 ? '+' : ''}{hovered.yoyPct.toFixed(2)}%</div>
                )}
                {metric === 'crime' && hovered.monthsCounted != null && hovered.monthsCounted < 12 && (
                  <div className={styles.tooltipSub}>Partial: {hovered.monthsCounted} months</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
