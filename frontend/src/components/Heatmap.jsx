import { useMemo, useState } from 'react'
import { mw, errorDirection } from '../format'

const CELL = 16
const GAP = 2
const LEFT_AXIS = 34
const TOP_AXIS = 4
const HOURS = Array.from({ length: 24 }, (_, i) => i)

// Diverging risk-orange / primary-green scale, matching every other chart on
// this site (orange = over-forecast/shortfall risk, green = under-forecast).
// Alpha (not lightness) carries magnitude: 0 error reads as ~nothing, the
// largest magnitude in the sample reads fully saturated — this blends
// correctly over the card background in both light and dark mode without
// needing separate light/dark hex ramps.
function cellColor(error, maxAbs) {
  if (error == null || !maxAbs) return 'var(--well)'
  const t = Math.min(1, Math.abs(error) / maxAbs)
  const alpha = 0.06 + t * 0.9
  return error >= 0 ? `rgba(217, 72, 15, ${alpha})` : `rgba(61, 139, 64, ${alpha})`
}

export default function Heatmap({ cells }) {
  const [hover, setHover] = useState(null) // { x, y, date, hour, error }

  const { dates, maxAbs, byKey } = useMemo(() => {
    const dates = [...new Set(cells.map((c) => c.date))].sort()
    const byKey = new Map(cells.map((c) => [`${c.date}|${c.hour}`, c.error]))
    const maxAbs = cells.reduce((m, c) => Math.max(m, Math.abs(c.error ?? 0)), 0)
    return { dates, maxAbs, byKey }
  }, [cells])

  const width = LEFT_AXIS + dates.length * (CELL + GAP)
  const height = TOP_AXIS + HOURS.length * (CELL + GAP) + 20

  return (
    <div className="heatmap-wrap">
      <svg width={width} height={height} role="img" aria-label="Error by hour and day heatmap">
        {/* hour axis (every 3h) */}
        {HOURS.filter((h) => h % 3 === 0).map((h) => (
          <text key={h} x={LEFT_AXIS - 6} y={TOP_AXIS + h * (CELL + GAP) + CELL - 3}
            textAnchor="end" className="heatmap-axis-label">{String(h).padStart(2, '0')}</text>
        ))}
        {/* day axis (every ~5 days) */}
        {dates.map((date, di) => {
          const day = Number(date.slice(8, 10))
          if (day % 5 !== 1 && day !== 1) return null
          return (
            <text key={date} x={LEFT_AXIS + di * (CELL + GAP) + CELL / 2}
              y={TOP_AXIS + HOURS.length * (CELL + GAP) + 14}
              textAnchor="middle" className="heatmap-axis-label">{day}</text>
          )
        })}
        {dates.map((date, di) => HOURS.map((hour) => {
          const error = byKey.get(`${date}|${hour}`)
          const x = LEFT_AXIS + di * (CELL + GAP)
          const y = TOP_AXIS + hour * (CELL + GAP)
          return (
            <rect
              key={`${date}-${hour}`}
              x={x} y={y} width={CELL} height={CELL} rx={2}
              fill={cellColor(error, maxAbs)}
              tabIndex={0}
              role="button"
              aria-label={`${date} ${String(hour).padStart(2, '0')}:00, error ${error == null ? 'unavailable' : mw(error) + ' MW'}`}
              onMouseEnter={() => setHover({ x, y, date, hour, error })}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ x, y, date, hour, error })}
              onBlur={() => setHover(null)}
            >
              <title>{`${date} ${String(hour).padStart(2, '0')}:00 — ${error == null ? 'no data' : mw(error) + ' MW'}`}</title>
            </rect>
          )
        }))}
      </svg>

      {hover && (
        <div className="chart-tooltip heatmap-tooltip" style={{ left: hover.x + LEFT_AXIS, top: hover.y }}>
          <div className="tt-head"><span>{hover.date}</span><span>{String(hover.hour).padStart(2, '0')}:00 UTC</span></div>
          <div className="tt-row"><span>Error</span><b>{mw(hover.error)} MW</b></div>
          {hover.error != null && <div className="tt-delta"><span>{errorDirection(hover.error)}</span></div>}
        </div>
      )}

      <div className="heatmap-legend">
        <span className="heatmap-legend-label">{mw(-maxAbs)} MW</span>
        <div className="heatmap-legend-bar" />
        <span className="heatmap-legend-label">0</span>
        <div className="heatmap-legend-bar reverse" />
        <span className="heatmap-legend-label">+{mw(maxAbs)} MW</span>
      </div>
    </div>
  )
}
