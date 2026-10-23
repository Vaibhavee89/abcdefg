import { useEffect, useMemo } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot } from 'recharts'
import { get } from '../api'
import { useApi } from '../useApi'
import { mw, gw, signedGw, errorDirection } from '../format'
import { GLOSSARY } from '../glossary'
import { exportCsv } from '../csv'
import InfoTip from '../components/InfoTip'
import HowToRead from '../components/HowToRead'
import { SkeletonCard, RetryBanner } from '../components/Skeleton'

const DAY_MS = 86400000
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * DAY_MS).toISOString().slice(0, 10)

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
  const hasActual = d.actual != null
  const delta = hasActual ? d.forecast - d.actual : null
  return (
    <div className="chart-tooltip">
      <div className="tt-head"><span>{label}</span><span>Horizon +{d.horizonH?.toFixed(0)}h</span></div>
      <div className="tt-row"><span>Forecast</span><b>{mw(d.forecast)} MW</b></div>
      <div className="tt-row"><span>Metered Actual</span><b>{hasActual ? `${mw(d.actual)} MW` : 'pending'}</b></div>
      <div className="tt-row"><span>Cautious Plan</span><b>{mw(d.cautious)} MW</b></div>
      {hasActual && (
        <div className="tt-delta"><span>{errorDirection(delta)}</span><span>{delta >= 0 ? '+' : ''}{mw(delta)} MW</span></div>
      )}
    </div>
  )
}

export default function Forecast({ cutoff, date, setDate, meta }) {
  const bounds = meta?.coverage?.decisions ?? null
  const { data: bundle, loading, error, retry } = useApi(
    () => Promise.all([
      get('/forecast', { decision_date: date, cutoff }),
      get('/metrics/summary', { cutoff }),
      get('/metrics/by-day', { cutoff }),
    ]).then(([f, s, byDay]) => ({ rows: f.rows, sum: s, byDay })),
    [date, cutoff]
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') setDate(addDays(date, -1))
      if (e.key === 'ArrowRight') setDate(addDays(date, 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [date, setDate])

  const rows = bundle?.rows ?? []
  const sum = bundle?.sum ?? null
  const byDay = bundle?.byDay ?? []
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
  const biggestMiss = data.reduce((a, b) => (Math.abs(b.error ?? 0) > Math.abs(a?.error ?? 0) ? b : a), null)

  const biggestMissDay = byDay.length ? byDay.reduce((a, b) => (b.mae > a.mae ? b : a)) : null
  const mostAccurateDay = byDay.length ? byDay.reduce((a, b) => (b.mae < a.mae ? b : a)) : null
  const windiestDay = byDay.length ? byDay.reduce((a, b) => (b.mean_actual > a.mean_actual ? b : a)) : null

  const isFirstLoad = loading && !bundle

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

      <HowToRead>
        <p>This page shows what the WINDFOR forecast said at your chosen decision cutoff for one day of delivery, compared to what metered wind actually produced.</p>
        <p><b>Forecast at Decision</b> is the latest forecast run published at or before the cutoff. <b>Metered Actual</b> is what was actually delivered. <b>Cautious Plan</b> subtracts a historical buffer (P90) from the forecast as an illustration of a conservative commitment.</p>
        <p>Use the quick-jump buttons to see the day with the biggest miss, the most accurate day, or the windiest day across January 2026.</p>
      </HowToRead>

      <div className="banner">
        <span><b>Sign Convention:</b> Error = Forecast − Actual. Positive (+MW) means <b>forecast too high (shortfall risk)</b>; negative means <b>forecast too low (surplus)</b>. Decision cutoff active: {cutoff} UTC.</span>
        <span className="tag">HISTORICAL REPLAY · JAN 2026</span>
      </div>

      {sum && (
        <p className="plain-summary">
          On <b>{date}</b>, the forecast averaged <b>{gw(meanF)} GW</b> and peaked at <b>{gw(peak?.forecast)} GW</b>{peak ? ` (at ${peak.hour} UTC)` : ''}.
          Based on January's error distribution, a cautious buyer might size a buffer of about <b>{gw(p90)} GW</b> below the forecast.
        </p>
      )}

      {error && <RetryBanner message={error} onRetry={retry} />}

      <div className="quickjump-row">
        {biggestMissDay && <button onClick={() => setDate(biggestMissDay.date)}>⚡ Biggest miss day ({biggestMissDay.date})</button>}
        {mostAccurateDay && <button onClick={() => setDate(mostAccurateDay.date)}>✓ Most accurate day ({mostAccurateDay.date})</button>}
        {windiestDay && <button onClick={() => setDate(windiestDay.date)}>🌬 Windiest day ({windiestDay.date})</button>}
      </div>

      <div className="date-row">
        <div className="date-nav">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
          <div className="date-field">
            <input type="date" min={bounds?.first} max={bounds?.last} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <span className="date-sub">(Day-Ahead Delivery)</span>
          </div>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
        </div>
        <div className="meta-right">
          <span>Aggregation: <b>Great Britain (National)</b></span>
          <span>|</span>
          <span>Dataset: <b>Elexon BMRS, Jan 2026 (static snapshot)</b></span>
        </div>
      </div>
      <p className="cutoff-sensitivity-note">Results aren't very sensitive to the exact cutoff — shifting it by 30 minutes typically changes headline numbers by about 1%.</p>

      {isFirstLoad ? (
        <div className="kpi-row"><SkeletonCard lines={1} /><SkeletonCard lines={1} /><SkeletonCard lines={1} /></div>
      ) : (
        <div className={`kpi-row${loading ? ' dimmed' : ''}`}>
          <div className="kpi">
            <div className="kpi-head"><span className="kpi-eyebrow">Peak Forecast</span></div>
            <div className="kpi-value">{gw(peak?.forecast)} <small>GW</small></div>
            <div className="kpi-sub">{peak ? `at ${peak.hour} UTC (${mw(peak.forecast)} MW)` : ''}</div>
          </div>
          <div className="kpi">
            <div className="kpi-head"><span className="kpi-eyebrow">Mean Forecast vs Actual</span></div>
            <div className="kpi-value">{gw(meanF)} <small>/ {gw(meanA)} GW</small></div>
            <div className="kpi-sub">Average hourly forecast vs metered actual ({mw(meanF)} / {mw(meanA)} MW)</div>
          </div>
          <div className="kpi risk">
            <div className="kpi-head"><span className="kpi-eyebrow">Daily Mean Error</span><span className="chip risk">{meanErr >= 0 ? 'SHORTFALL EXPOSURE' : 'SURPLUS'}</span></div>
            <div className="kpi-value risk">{signedGw(meanErr)} <small>GW</small></div>
            <div className="kpi-sub">{errorDirection(meanErr)} ({mw(meanErr)} MW)</div>
          </div>
        </div>
      )}

      {isFirstLoad ? <SkeletonCard lines={6} /> : (
        <div className={`card${loading ? ' dimmed' : ''}`}>
          <div className="card-head">
            <div>
              <p className="card-eyebrow">Day-Ahead Profile (24 Hours)</p>
              <h2 className="card-title">Hourly Wind Forecast vs Metered Actual</h2>
              <p className="card-sub">Decision-time forecast (latest available at or before {cutoff} UTC), metered actuals, and suggested cautious volume using the January <InfoTip text={GLOSSARY.p90} /> buffer.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
              <XAxis dataKey="hour" tick={{ fontSize: 12, fill: 'var(--ink-muted)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--ink-muted)' }} width={70} unit=" MW" />
              <Tooltip content={<TooltipCard />} />
              <Area dataKey="band" stroke="none" fill="var(--risk)" fillOpacity={0.12} isAnimationActive={false} legendType="none" />
              <Line dataKey="forecast" name="Forecast at Decision" stroke="var(--primary)" strokeWidth={2.5} dot={false} connectNulls />
              <Line dataKey="actual" name="Metered Actual" stroke="var(--ink)" strokeWidth={2.5} dot={false} connectNulls />
              <Line dataKey="cautious" name="Cautious Plan (F - P90)" stroke="var(--risk)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              {biggestMiss && Math.abs(biggestMiss.error ?? 0) > 0 && (
                <ReferenceDot x={biggestMiss.hour} y={biggestMiss.forecast} r={6} fill="var(--risk)" stroke="var(--panel)" strokeWidth={2}
                  label={{ value: 'Biggest miss', position: 'top', fill: 'var(--risk)', fontSize: 11, fontWeight: 700 }} />
              )}
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
      )}

      {!isFirstLoad && (
        <div className={`card${loading ? ' dimmed' : ''}`}>
          <div className="card-head">
            <div>
              <p className="card-eyebrow">Hourly Breakdown Table (24 Delivery Hours)</p>
              <h2 className="card-title">Hour-by-hour detail</h2>
            </div>
            <button className="export-btn" onClick={() => exportCsv(
              `forecast_${date}_${cutoff.replace(':', '')}.csv`,
              [
                { label: 'Hour (UTC)', value: (r) => `${r.hour}-${r.hourEnd}` },
                { label: 'Horizon (h)', value: (r) => r.horizonH?.toFixed(0) },
                { label: 'Forecast (MW)', value: (r) => Math.round(r.forecast) },
                { label: 'Actual (MW)', value: (r) => (r.actual == null ? 'pending' : Math.round(r.actual)) },
                { label: 'Cautious Plan (MW)', value: (r) => Math.round(r.cautious) },
                { label: 'Error (MW)', value: (r) => (r.error == null ? '' : Math.round(r.error)) },
              ],
              data
            )}>⬇ Export CSV</button>
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
                const hasActual = r.actual != null
                return (
                  <tr key={r.hour}>
                    <td>{r.hour} – {r.hourEnd}</td>
                    <td>+{r.horizonH?.toFixed(0)}h</td>
                    <td>{mw(r.forecast)}</td>
                    <td>{hasActual ? mw(r.actual) : <span className="pending-chip">pending</span>}</td>
                    <td>{mw(r.cautious)}</td>
                    <td className={hasActual ? `error ${r.error >= 0 ? 'pos' : 'neg'}` : ''}>{hasActual ? `${r.error >= 0 ? '+' : ''}${mw(r.error)}` : '–'}</td>
                    <td>{hasActual ? <span className={`chip ${act.cls}`}>{act.label}</span> : <span className="chip neutral">Pending</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="desk-footer">
        <span>Data sources: Elexon BMRS (FUELHH actuals &amp; WINDFOR forecasts). All decision timestamps in UTC. Cutoff assumption: {cutoff} UTC. Built with AI assistance.</span>
        <nav><span>Data Methodology</span><span>BMRS Feed</span><span>Settlement API</span></nav>
      </footer>
    </section>
  )
}
