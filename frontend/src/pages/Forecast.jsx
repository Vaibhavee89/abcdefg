import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { get } from '../api'

const DAY_MS = 86400000
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * DAY_MS).toISOString().slice(0, 10)
const clampDate = (d) => (d < '2026-01-01' ? '2026-01-01' : d > '2026-01-31' ? '2026-01-31' : d)
const mw = (v) => (v == null ? '–' : Math.round(v).toLocaleString())

function deskAction(error) {
  if (error <= -150) return { label: 'Covered', cls: 'ok' }
  if (error >= 800) return { label: 'Trim Day-Ahead Bid', cls: 'fill-risk' }
  if (error >= 150) return { label: 'Shortfall Alert', cls: 'risk' }
  return { label: 'Neutral', cls: 'neutral' }
}

function TooltipCard({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const delta = d.forecast - d.actual
  return (
    <div className="chart-tooltip">
      <div className="tt-head"><span>{label}</span><span>Horizon +{d.horizonH?.toFixed(0)}h</span></div>
      <div className="tt-row"><span>Forecast</span><b>{mw(d.forecast)} MW</b></div>
      <div className="tt-row"><span>Metered Actual</span><b>{mw(d.actual)} MW</b></div>
      <div className="tt-row"><span>Cautious Plan</span><b>{mw(d.cautious)} MW</b></div>
      <div className="tt-delta"><span>DELTA ERROR</span><span>{delta >= 0 ? '+' : ''}{mw(delta)} MW {delta >= 0 ? '(Risk)' : ''}</span></div>
    </div>
  )
}

export default function Forecast({ cutoff }) {
  const [date, setDate] = useState('2026-01-14')
  const [rows, setRows] = useState([])
  const [sum, setSum] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    setErr(null)
    Promise.all([
      get('/api/forecast', { decision_date: date, cutoff }),
      get('/api/metrics/summary', { cutoff }),
    ]).then(([f, s]) => { setRows(f.rows); setSum(s) })
      .catch((e) => setErr(e.message))
  }, [date, cutoff])

  const p90 = sum?.p90 ?? 0
  const data = useMemo(() => rows.map((r) => ({
    hour: r.startTime.slice(11, 16),
    hourEnd: ((parseInt(r.startTime.slice(11, 13)) + 1) % 24).toString().padStart(2, '0') + ':00',
    forecast: r.forecast,
    actual: r.actual,
    cautious: Math.max(0, r.forecast - p90),
    horizonH: r.horizon_h,
    error: r.error,
    band: [Math.max(0, r.forecast - p90), r.forecast],
  })), [rows, p90])

  const runs = [...new Set(rows.map((r) => r.publishTime))]
  const peak = data.reduce((a, b) => (b.forecast > (a?.forecast ?? -Infinity) ? b : a), null)
  const meanF = data.length ? data.reduce((s, r) => s + r.forecast, 0) / data.length : null
  const meanA = data.length ? data.reduce((s, r) => s + (r.actual ?? 0), 0) / data.length : null
  const meanErr = data.length ? data.reduce((s, r) => s + (r.error ?? 0), 0) / data.length : null

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">FORECASTS</p>
          <h1 className="title">Wind forecast <span>at decision time</span></h1>
        </div>
        <div className="run-meta">
          Decision gate: <b>{cutoff} UTC</b> · Forecast run used: <b>{runs.map((r) => r.replace('T', ' ').slice(0, 16)).join(', ') || '…'} UTC</b>
        </div>
      </div>

      <div className="banner">
        <span><b>Sign Convention:</b> Error = Forecast − Actual. Positive (+MW) indicates forecast was too high (shortfall risk for buyer). Decision cutoff active: {cutoff} UTC.</span>
        <span className="tag">HISTORICAL REPLAY · JAN 2026</span>
      </div>

      {err && <p className="error">{err}</p>}

      <div className="date-row">
        <div className="date-nav">
          <button onClick={() => setDate((d) => clampDate(addDays(d, -1)))}>‹</button>
          <div className="date-field">
            <input type="date" min="2026-01-01" max="2026-01-31" value={date} onChange={(e) => setDate(clampDate(e.target.value))} />
            <span className="date-sub">(Day-Ahead Delivery)</span>
          </div>
          <button onClick={() => setDate((d) => clampDate(addDays(d, 1)))}>›</button>
        </div>
        <div className="meta-right">
          <span>Aggregation: <b>Great Britain (National)</b></span>
          <span>|</span>
          <span>Dataset: <b>Elexon BMRS, Jan 2026 (static snapshot)</b></span>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-eyebrow">Peak Forecast</span></div>
          <div className="kpi-value">{peak ? mw(peak.forecast) : '–'} <small>MW</small></div>
          <div className="kpi-sub">{peak ? `at ${peak.hour} UTC` : ''} · highest hourly forecast for the day</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><span className="kpi-eyebrow">Mean Forecast vs Actual</span></div>
          <div className="kpi-value">{mw(meanF)} <small>/ {mw(meanA)} MW</small></div>
          <div className="kpi-sub">Average hourly forecast vs metered actual</div>
        </div>
        <div className="kpi risk">
          <div className="kpi-head"><span className="kpi-eyebrow">Daily Mean Error</span><span className="chip risk">SHORTFALL EXPOSURE</span></div>
          <div className="kpi-value risk">{meanErr >= 0 ? '+' : ''}{mw(meanErr)} <small>MW</small></div>
          <div className="kpi-sub">Forecast {meanErr >= 0 ? 'over-estimated' : 'under-estimated'} metered wind</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <p className="card-eyebrow">Day-Ahead Profile (24 Hours)</p>
            <h2 className="card-title">Hourly Wind Forecast vs Metered Actual</h2>
            <p className="card-sub">Decision-time forecast (latest available at or before {cutoff} UTC), metered actuals, and suggested cautious volume using the January P90 buffer.</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
            <XAxis dataKey="hour" tick={{ fontSize: 12, fill: 'var(--ink-muted)' }} />
            <YAxis tick={{ fontSize: 12, fill: 'var(--ink-muted)' }} width={70} unit=" MW" />
            <Tooltip content={<TooltipCard />} />
            <Area dataKey="band" stroke="none" fill="var(--risk)" fillOpacity={0.12} isAnimationActive={false} legendType="none" />
            <Line dataKey="forecast" name="Forecast at Decision" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
            <Line dataKey="actual" name="Metered Actual" stroke="var(--ink)" strokeWidth={2.5} dot={false} />
            <Line dataKey="cautious" name="Cautious Plan (F - P90)" stroke="var(--risk)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="legend-row">
          <span><span className="sw" style={{ background: 'var(--primary)' }} />Forecast at Decision</span>
          <span><span className="sw" style={{ background: 'var(--ink)' }} />Metered Actual</span>
          <span><span className="sw dash" style={{ borderColor: 'var(--risk)' }} />Cautious Plan (F − P90)</span>
          <span><span className="swatch" style={{ background: 'var(--risk)', opacity: 0.3 }} />Suggested buffer band</span>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          * The cautious plan line deducts the January P90 forecast risk buffer ({mw(p90)} MW) from the decision-time forecast. It illustrates a buffer size, not an automated or back-tested trading rule.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <p className="card-eyebrow">Hourly Breakdown Table (24 Delivery Hours)</p>
            <h2 className="card-title">Hour-by-hour detail</h2>
          </div>
        </div>
        <table className="desk-table">
          <thead>
            <tr>
              <th>Hour (UTC)</th><th>Horizon (+h)</th><th>Forecast (MW)</th><th>Actual (MW)</th><th>Cautious Plan (MW)</th><th>Error (F − A)</th><th>Desk Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const act = deskAction(r.error ?? 0)
              return (
                <tr key={r.hour}>
                  <td>{r.hour} – {r.hourEnd}</td>
                  <td>+{r.horizonH?.toFixed(0)}h</td>
                  <td>{mw(r.forecast)}</td>
                  <td>{mw(r.actual)}</td>
                  <td>{mw(r.cautious)}</td>
                  <td className={`error ${r.error >= 0 ? 'pos' : 'neg'}`}>{r.error >= 0 ? '+' : ''}{mw(r.error)}</td>
                  <td><span className={`chip ${act.cls}`}>{act.label}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className="desk-footer">
        <span>Data sources: Elexon BMRS (FUELHH actuals &amp; WINDFOR forecasts). All decision timestamps in UTC. Cutoff assumption: {cutoff} UTC. Built with AI assistance.</span>
        <nav><span>Data Methodology</span><span>BMRS Feed</span><span>Settlement API</span></nav>
      </footer>
    </section>
  )
}
