import { useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, Tooltip } from 'recharts'
import { get } from '../api'
import { useApi } from '../useApi'
import HowToRead from '../components/HowToRead'

const mw = (v) => (v == null ? '–' : Math.round(v).toLocaleString())
const signed = (v) => (v == null ? '–' : (v >= 0 ? '+' : '') + Math.round(v).toLocaleString())

const CONVENTIONAL = [
  'Unanchored horizon drift: forecast updates straddle the day-ahead gate (09:20 UTC for EPEX GB, 09:50 UTC for N2EX), so buyers mix data from before and after their own commitment point.',
  'Asymmetric over-forecast penalties go unquantified: forecasts treat over- and under-forecast as equally likely, when only one direction causes a shortfall at gate closure.',
  'Ad-hoc spreadsheet guesswork: traders manually pad 10–15% of wind output with no objective tie to historical error during high-risk periods.',
]
const DESK = [
  'Cutoff-enforced snapshots: every forecast shown is the latest run published at or before your chosen decision cutoff — never a later revision.',
  'Empirical tail-risk sizing (P90 / P95): buffers are calibrated directly from the observed January 2026 error distribution, not a flat percentage guess.',
  'Diurnal & horizon error diagnostics: decompose error by hour of day and by forecast lead time to see exactly where risk concentrates.',
]

const FEATURES = [
  { n: '01', t: 'Gate-closure cutoff enforcement', d: 'Every forecast is the latest WINDFOR run published at or before your configured decision time (09:20 UTC / EPEX GB default).' },
  { n: '02', t: 'Empirical tail risk sizing (P90 / P95)', d: 'Buffers come straight from the observed January 2026 error distribution — no flat-percentage rule of thumb.' },
  { n: '03', t: 'Diurnal & horizon diagnostics', d: 'Decompose error across all 24 settlement hours and across lead time, from same-day to 2+ days ahead.' },
  { n: '04', t: 'Documented REST API', d: 'A FastAPI backend with interactive docs — every number on this site is computed live, not hard-coded.' },
]

export default function Landing({ cutoff, onNavigate }) {
  const [capacity, setCapacity] = useState(2500)
  const [tier, setTier] = useState('p90')

  const { data: bundle } = useApi(
    (signal) => Promise.all([
      get('/metrics/summary', { cutoff }, signal),
      get('/forecast', { decision_date: '2026-01-14', cutoff }, signal),
    ]).then(([s, f]) => ({ sum: s, rows: f.rows })),
    [cutoff]
  )

  const sum = bundle?.sum ?? null
  const preview = useMemo(
    () => (bundle?.rows ?? []).map((r) => ({ hour: r.startTime.slice(11, 16), forecast: r.forecast, actual: r.actual })),
    [bundle]
  )

  const { bufferPctOfMean, recommendedBuffer } = useMemo(() => {
    const meanActual = sum ? (100 * sum.mae) / sum.mae_pct_of_mean_actual : null
    const bufferPctOfMean = sum && meanActual ? (sum[tier] / meanActual) * 100 : null
    const recommendedBuffer = bufferPctOfMean != null ? (capacity * bufferPctOfMean) / 100 : null
    return { bufferPctOfMean, recommendedBuffer }
  }, [sum, tier, capacity])

  return (
    <section className="page landing">
      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow">DAY-AHEAD WIND FORECAST DECISION SUPPORT</p>
          <h1 className="title landing-h1">
            Size wind risk buffers before <span>morning gate closure</span>
          </h1>
          <p className="hero-sub">
            A decision-support tool for GB day-ahead wind buyers. Compare the Elexon WINDFOR forecast against
            FUELHH metered actuals at your chosen decision cutoff, and size a buffer from the real January 2026
            error distribution — computed live, not assumed.
          </p>
          <div className="hero-cta">
            <button className="btn-primary" onClick={() => onNavigate('forecast')}>Open the Forecast Desk →</button>
            <button className="btn-hairline" onClick={() => onNavigate('accuracy')}>View accuracy analysis</button>
          </div>
          <p className="hero-trust">Elexon BMRS FUELHH (actuals) + WINDFOR (forecast) · {sum ? sum.n : '744'} settlement periods, January 2026 · open-source backend</p>
        </div>
        <div className="hero-widget card">
          <div className="card-head">
            <div>
              <p className="card-eyebrow">TERMINAL PREVIEW · 14 JAN 2026</p>
              <h3 className="card-title" style={{ fontSize: 15 }}>Forecast vs actual, {cutoff} UTC cutoff</h3>
            </div>
            <span className="kpi-value risk" style={{ fontSize: 18 }}>{sum ? signed(sum[tier]) : '…'} <small>MW {tier.toUpperCase()}</small></span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={preview}>
              <XAxis dataKey="hour" hide />
              <Tooltip />
              <Area dataKey="forecast" stroke="none" fill="var(--primary)" fillOpacity={0.08} />
              <Line dataKey="forecast" stroke="var(--primary)" strokeWidth={2} dot={false} />
              <Line dataKey="actual" stroke="var(--ink)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <HowToRead>
        <p>This site is split into three views. <b>Home</b> (this page) is an overview with a live backtest summary and an illustrative buffer calculator. <b>Forecast</b> shows one day of decision-time forecast vs metered actual in detail. <b>Accuracy</b> shows aggregate error statistics across all of January 2026.</p>
        <p>All figures are computed live by the FastAPI backend from Elexon BMRS data — nothing is a simulated testimonial or audited claim.</p>
      </HowToRead>

      <div className="section-head">
        <h2 className="card-title" style={{ fontSize: 24 }}>Generic weather forecasts don't pay imbalance fines. Trading desks do.</h2>
        <p className="card-sub" style={{ maxWidth: 760 }}>
          Standard day-ahead wind forecasts publish continuous multi-horizon updates, but a power buyer commits at one fixed
          decision point. The gap between "what the forecast said" and "what was actually delivered" at that point is the
          number that matters for sizing a safety margin.
        </p>
      </div>

      <div className="grid-2">
        <div className="card compare-card bad">
          <p className="card-eyebrow">CONVENTIONAL APPROACH</p>
          <h3 className="card-title" style={{ fontSize: 16 }}>Unstructured forecast reading</h3>
          <ul className="compare-list bad">
            {CONVENTIONAL.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
        <div className="card compare-card good">
          <p className="card-eyebrow">ENERGY FORECAST DESK</p>
          <h3 className="card-title" style={{ fontSize: 16 }}>Decision-anchored analysis</h3>
          <ul className="compare-list good">
            {DESK.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </div>

      <div className="section-head">
        <p className="eyebrow">CAPABILITIES</p>
        <h2 className="card-title" style={{ fontSize: 22 }}>Engineered for GB day-ahead balancing</h2>
      </div>
      <div className="feature-grid">
        {FEATURES.map((f) => (
          <div className="card feature-card" key={f.n}>
            <span className="feature-n">{f.n}</span>
            <h4>{f.t}</h4>
            <p>{f.d}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <p className="card-eyebrow">BACKTEST RESULTS</p>
            <h2 className="card-title">January 2026 UK day-ahead outturn backtest</h2>
            <p className="card-sub">Computed directly from Elexon BMRS FUELHH (actuals) and WINDFOR (forecast), {cutoff} UTC cutoff, {sum ? sum.n : '744'} half-hourly-averaged settlement periods. Not independently audited.</p>
          </div>
        </div>
        <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <div className="kpi"><div className="kpi-eyebrow">Mean Absolute Error</div><div className="kpi-value">{sum ? mw(sum.mae) : '…'} <small>MW</small></div><div className="kpi-sub">{sum ? `${sum.mae_pct_of_mean_actual.toFixed(1)}% of mean dispatch` : ''}</div></div>
          <div className="kpi emph"><div className="kpi-eyebrow">Calibrated P90 Buffer</div><div className="kpi-value risk">{sum ? signed(sum.p90) : '…'} <small>MW</small></div><div className="kpi-sub">Empirical, from Jan 2026 error distribution</div></div>
          <div className="kpi"><div className="kpi-eyebrow">Bias (mean error)</div><div className="kpi-value">{sum ? signed(sum.bias) : '…'} <small>MW</small></div><div className="kpi-sub">{sum ? `${sum.bias_pct_of_mean_actual.toFixed(1)}% of mean wind` : ''}</div></div>
          <div className="kpi"><div className="kpi-eyebrow">P90 Coverage</div><div className="kpi-value">~90<small>%</small></div><div className="kpi-sub">of hours within buffer, by construction of P90</div></div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <p className="card-eyebrow">INTERACTIVE SIZING</p>
          <h3 className="card-title" style={{ fontSize: 16 }}>Scale the buffer to your portfolio</h3>
          <p className="card-sub">Illustrative scaling only: applies the national over-forecast risk, as a % of mean GB wind output, to a declared portfolio capacity. This is not a calibrated per-portfolio model and does not include £/MWh imbalance price data.</p>
          <label className="calc-label">Portfolio wind capacity (MW)
            <input type="range" min="200" max="6000" step="100" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            <span className="calc-value">{capacity.toLocaleString()} MW</span>
          </label>
          <label className="calc-label">Risk tolerance
            <div className="segmented">
              <button className={tier === 'p90' ? 'on' : ''} onClick={() => setTier('p90')}>P90 (standard)</button>
              <button className={tier === 'p95' ? 'on' : ''} onClick={() => setTier('p95')}>P95 (defensive)</button>
            </div>
          </label>
        </div>
        <div className="card">
          <p className="card-eyebrow">OUTPUT</p>
          <h3 className="card-title" style={{ fontSize: 16 }}>Recommended safety buffer</h3>
          <div className="kpi emph" style={{ marginTop: 10 }}>
            <div className="kpi-eyebrow">Scaled {tier.toUpperCase()} buffer</div>
            <div className="kpi-value risk">{recommendedBuffer != null ? signed(recommendedBuffer) : '…'} <small>MW</small></div>
            <div className="kpi-sub">{bufferPctOfMean != null ? `≈ ${bufferPctOfMean.toFixed(1)}% of declared capacity, derived from the national ${tier.toUpperCase()} over-forecast as a % of mean GB wind` : ''}</div>
          </div>
        </div>
      </div>

      <div className="card about-card">
        <p className="card-eyebrow">ABOUT THIS PROJECT</p>
        <p className="card-sub" style={{ fontSize: 13 }}>
          Energy Forecast Desk is a day-ahead wind forecast accuracy analysis built on public Elexon BMRS data (FUELHH actuals,
          WINDFOR forecasts) for January 2026. All figures on this page are computed live by the FastAPI backend from the
          underlying dataset — nothing here is a simulated testimonial, audited result, or live trading feed.
        </p>
      </div>

      <div className="closing-cta">
        <div>
          <h3 className="card-title" style={{ fontSize: 20, marginBottom: 4 }}>Explore the live analysis</h3>
          <p className="note">Open the Forecast and Accuracy views, or read the API docs.</p>
        </div>
        <div className="hero-cta">
          <button className="btn-primary" onClick={() => onNavigate('forecast')}>Open Forecast Desk</button>
          <button className="btn-hairline" onClick={() => onNavigate('accuracy')}>Open Accuracy View</button>
        </div>
      </div>

      <footer className="desk-footer">
        <span>Energy Forecast Desk · Elexon BMRS static dataset (Jan 2026) · Cutoff assumption: {cutoff} UTC day-ahead gate closure</span>
        <nav><span>Data Methodology</span><span>BMRS Feed</span><span>Settlement API</span></nav>
      </footer>
    </section>
  )
}
