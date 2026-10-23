import { useMemo } from 'react'
import { ResponsiveContainer, ComposedChart, BarChart, LineChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { get } from '../api'
import { useApi } from '../useApi'
import { mw, gw, signedGw } from '../format'
import { GLOSSARY } from '../glossary'
import { exportCsv } from '../csv'
import InfoTip from '../components/InfoTip'
import HowToRead from '../components/HowToRead'
import Heatmap from '../components/Heatmap'
import { SkeletonCard, RetryBanner } from '../components/Skeleton'

function Kpi({ eyebrow, info, value, unit, sub, variant, chip, subtitle }) {
  return (
    <div className={`kpi${variant ? ' ' + variant : ''}`}>
      <div className="kpi-head"><span className="kpi-eyebrow">{eyebrow}{info && <InfoTip text={info} />}</span>{chip}</div>
      {subtitle && <div className="kpi-subtitle">{subtitle}</div>}
      <div className="kpi-value">{value} <small>{unit}</small></div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

export default function Accuracy({ cutoff }) {
  const { data: d, loading, error, retry } = useApi(
    (signal) => Promise.all([
      get('/metrics/summary', { cutoff }, signal),
      get('/metrics/by-hour', { cutoff }, signal),
      get('/metrics/by-horizon', {}, signal),
      get('/metrics/histogram', { cutoff }, signal),
      get('/metrics/by-day', { cutoff }, signal),
      get('/metrics/heatmap', { cutoff }, signal),
    ]).then(([summary, byHour, byHorizon, hist, byDay, heatmap]) => ({ summary, byHour, byHorizon, hist, byDay, heatmap })),
    [cutoff]
  )

  const histData = useMemo(() => d ? d.hist.counts.map((c, i) => ({
    bin: Math.round((d.hist.edges[i] + d.hist.edges[i + 1]) / 2), count: c,
  })) : [], [d])
  const horizon = useMemo(() => d ? d.byHorizon.filter((r) => r.n >= 1000) : [], [d])
  const byHourData = useMemo(() => d ? d.byHour.map((r) => ({ ...r, hourLabel: String(r.hour).padStart(2, '0') + ':00' })) : [], [d])

  if (!d && loading) {
    return (
      <section className="page">
        <SkeletonCard lines={1} />
        <div className="kpi-row"><SkeletonCard lines={1} /><SkeletonCard lines={1} /><SkeletonCard lines={1} /><SkeletonCard lines={1} /><SkeletonCard lines={1} /></div>
        <div className="grid-2"><SkeletonCard lines={5} /><SkeletonCard lines={5} /><SkeletonCard lines={5} /><SkeletonCard lines={5} /></div>
      </section>
    )
  }
  if (!d && error) {
    return <section className="page"><RetryBanner message={error} onRetry={retry} /></section>
  }

  const s = d.summary

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">ACCURACY BENCHMARK &amp; MODEL RESIDUALS</p>
          <h1 className="title">Model accuracy &amp; <span>safety sizing</span></h1>
        </div>
        <div className="run-meta">Sample: <b>{s.n} settlement periods</b> (Jan 2026 decisions)</div>
      </div>

      <HowToRead>
        <p>This page summarises how accurate the day-ahead forecast has been across the whole of January 2026, at your chosen decision cutoff.</p>
        <p>Hover the ⓘ next to any metric label for a plain-English explanation. <b>Bias</b> and <b>MAE</b>/<b>RMSE</b> describe typical error size; <b>P90</b>/<b>P95</b> are buffers you could add to a forecast to cover most or nearly all of the historical over-forecast risk.</p>
        <p>The hour × day heatmap below shows every individual error, not an average — hover or tab to a cell for its exact value. It makes patterns like the overnight bias visible at a glance, where a bar chart would only show the average across all days.</p>
      </HowToRead>

      <div className="banner">
        <span><b>Sign Convention:</b> Error = Forecast − Actual. Positive (+MW) means <b>forecast too high (shortfall risk)</b>. Decision cutoff active: {cutoff} UTC.</span>
        <span className="tag">+MW FORECAST TOO HIGH (SHORTFALL) · −MW FORECAST TOO LOW (SURPLUS)</span>
      </div>

      {error && <RetryBanner message={error} onRetry={retry} />}

      <div className="callout">
        <div className="callout-text">
          <b>LIVE DECISION INSIGHT</b> · At the {cutoff} UTC cutoff, the forecast ran <b>{signedGw(s.bias)} GW</b> ({s.bias_pct_of_mean_actual.toFixed(1)}% of mean wind) above metered wind on average.
          By construction, around 90% of hourly over-forecasts stayed within the suggested buffer of <b>{gw(s.p90)} GW</b>.
        </div>
        <div className="callout-aside">
          <div className="label">Recommended Hedge</div>
          <div className="value">{signedGw(s.p90)} GW</div>
          <div className="hint">D-1 Safety Margin (P90)</div>
        </div>
      </div>

      <div className={`kpi-row${loading ? ' dimmed' : ''}`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Kpi eyebrow="Bias (Mean Error)" info={GLOSSARY.bias} value={signedGw(s.bias)} unit="GW" sub={`${s.bias_pct_of_mean_actual.toFixed(1)}% of mean wind · ${mw(s.bias)} MW`} chip={<span className="chip risk">SYSTEMIC</span>} />
        <Kpi eyebrow="MAE" info={GLOSSARY.mae} value={gw(s.mae)} unit="GW" sub={`${s.mae_pct_of_mean_actual.toFixed(1)}% of mean dispatch · ${mw(s.mae)} MW`} />
        <Kpi eyebrow="RMSE" info={GLOSSARY.rmse} value={gw(s.rmse)} unit="GW" sub={`Penalises large outliers · ${mw(s.rmse)} MW`} />
        <Kpi eyebrow="Suggested buffer" subtitle="P90 over-forecast" info={GLOSSARY.p90} value={signedGw(s.p90)} unit="GW" sub={`90% of over-forecasts fall below this · ${mw(s.p90)} MW`} variant="emph" chip={<span className="chip ok">TARGET BUFFER</span>} />
        <Kpi eyebrow="Defensive buffer" subtitle="P95 over-forecast" info={GLOSSARY.p95} value={signedGw(s.p95)} unit="GW" sub={`95% of over-forecasts fall below this · ${mw(s.p95)} MW`} variant="emph" chip={<span className="chip ok">EXTREME TAIL</span>} />
      </div>

      <div className={`card${loading ? ' dimmed' : ''}`}>
        <div className="card-head">
          <div>
            <p className="card-eyebrow">Hour × Day Detail</p>
            <h2 className="card-title">Error heatmap — every settlement period in January</h2>
            <p className="card-sub">Each cell is one hour's error on one decision date (31 days × 24 hours = {d.heatmap.length} cells). Orange = forecast too high (shortfall risk), green = forecast too low (surplus); darker means a bigger miss. Hover or tab to a cell for its exact value.</p>
          </div>
          <button className="export-btn" onClick={() => exportCsv(
            `heatmap_${cutoff.replace(':', '')}.csv`,
            [
              { label: 'Date', value: (r) => r.date },
              { label: 'Hour (UTC)', value: (r) => r.hour },
              { label: 'Error (MW)', value: (r) => (r.error == null ? '' : Math.round(r.error)) },
            ],
            d.heatmap
          )}>⬇ Export CSV</button>
        </div>
        <Heatmap cells={d.heatmap} />
      </div>

      <div className={`grid-2${loading ? ' dimmed' : ''}`}>
        <div className="card">
          <p className="card-eyebrow">Diurnal Pattern</p>
          <h2 className="card-title">Error by delivery hour (UTC)</h2>
          <p className="card-sub">Bias bars show average hourly tilt (orange = forecast too high, green = forecast too low), with the black line tracking <InfoTip text={GLOSSARY.mae} /> MAE spread across 24 settlement intervals.</p>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={byHourData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
              <XAxis dataKey="hourLabel" interval={2} tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} width={60} />
              <Tooltip />
              <ReferenceLine y={0} stroke="var(--hairline)" />
              <Bar dataKey="bias" name="Bias (MW)">
                {byHourData.map((r, i) => <Cell key={i} fill={r.bias >= 0 ? 'var(--risk)' : 'var(--primary)'} />)}
              </Bar>
              <Line dataKey="mae" name="MAE Spread" stroke="var(--ink)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="card-footer">
            <span>Max hourly tilt: <b>{mw(Math.max(...byHourData.map((r) => r.bias)))} MW</b></span>
            <span className="warn">Peak risk hours visible where bars are tallest (orange)</span>
          </div>
        </div>

        <div className="card">
          <p className="card-eyebrow">Risk Density</p>
          <h2 className="card-title">Error distribution histogram</h2>
          <p className="card-sub">Frequency of hourly errors across {s.n} observations, with zero-error and <InfoTip text={GLOSSARY.p90} /> P90 reference lines.</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={histData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
              <XAxis dataKey="bin" tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} width={40} />
              <Tooltip />
              <ReferenceLine x={0} stroke="var(--ink)" strokeDasharray="3 3" />
              <ReferenceLine x={Math.round(s.p90)} stroke="var(--risk)" strokeDasharray="3 3" />
              <Bar dataKey="count" name="Hours">
                {histData.map((r, i) => <Cell key={i} fill={r.bin >= 0 ? 'var(--risk)' : 'var(--primary)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="card-footer">
            <span>0 MW = perfect forecast</span>
            <span className="warn">P90 ({mw(s.p90)} MW) marks the shortfall tail</span>
          </div>
        </div>

        <div className="card">
          <p className="card-eyebrow">Horizon Degradation</p>
          <h2 className="card-title">Accuracy vs lead time</h2>
          <p className="card-sub">Error metrics as forecast <InfoTip text={GLOSSARY.horizon} /> lead time increases. Buckets with fewer than 1,000 observations are hidden.</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={horizon}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
              <XAxis dataKey="horizon_bucket" unit="h" tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} width={60} />
              <Tooltip />
              <Line dataKey="mae" name="MAE" stroke="var(--ink)" strokeWidth={2} dot={false} />
              <Line dataKey="rmse" name="RMSE" stroke="var(--primary)" strokeWidth={2} dot={false} />
              <Line dataKey="p95" name="P95 Buffer" stroke="var(--risk)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="card-footer">
            <span>Lead-time buckets are 6h wide, using every forecast run</span>
          </div>
        </div>

        <div className="card">
          <p className="card-eyebrow">January Run-Rate</p>
          <h2 className="card-title">Daily mean error (January decisions)</h2>
          <p className="card-sub">Day-by-day mean error tracking persistent high/low weather regimes across 31 decision dates.</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--ink-muted)' }} interval={3} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} width={60} />
              <Tooltip />
              <ReferenceLine y={0} stroke="var(--hairline)" />
              <Bar dataKey="bias" name="Daily mean error (MW)">
                {d.byDay.map((r, i) => <Cell key={i} fill={r.bias >= 0 ? 'var(--risk)' : 'var(--primary)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`card${loading ? ' dimmed' : ''}`}>
        <div className="card-head">
          <div>
            <p className="card-eyebrow">Model Residual Benchmark</p>
            <h2 className="card-title">Model Architecture Residual Benchmark ({cutoff} UTC D-1 Closure)</h2>
            <p className="card-sub">This project evaluates a single live model (Elexon WINDFOR day-ahead forecast vs. FUELHH metered wind). No alternate forecasting architectures were trained or benchmarked, so only one row is real; the rest of the table is intentionally omitted rather than filled with placeholder figures.</p>
          </div>
        </div>
        <table className="desk-table">
          <thead>
            <tr><th>Model Pipeline</th><th>Architecture</th><th>Bias (MW)</th><th>MAE (MW)</th><th>RMSE (MW)</th><th>P90 Margin</th><th>P95 Margin</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Desk Model (Live)</td>
              <td>Elexon WINDFOR day-ahead</td>
              <td className={s.bias >= 0 ? 'error pos' : 'error neg'}>{mw(s.bias)}</td>
              <td>{Math.round(s.mae).toLocaleString()}</td>
              <td>{Math.round(s.rmse).toLocaleString()}</td>
              <td>{mw(s.p90)}</td>
              <td>{mw(s.p95)}</td>
              <td><span className="chip ok">ACTIVE LIVE</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className="desk-footer">
        <span>© 2026 Energy Forecast Desk · Elexon BMRS static dataset (Jan 2026) · Cutoff assumption: {cutoff} UTC day-ahead gate closure</span>
        <nav><span>Data Methodology</span><span>BMRS Feed</span><span>Settlement API</span></nav>
      </footer>
    </section>
  )
}
