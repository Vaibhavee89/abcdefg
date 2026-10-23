import { useEffect, useState } from 'react'
import { get } from './api'
import Landing from './pages/Landing'
import Forecast from './pages/Forecast'
import Accuracy from './pages/Accuracy'
import './App.css'

const PRESET_CUTOFFS = [
  { value: '09:20', label: '09:20 · EPEX GB' },
  { value: '09:50', label: '09:50 · N2EX' },
]
const VALID_TABS = ['home', 'forecast', 'accuracy']
// Used only until /meta loads (first paint needs a synchronous value); the
// real decision-date range comes from the API, not a hardcoded constant.
const FALLBACK_DATE = '2026-01-14'
const FALLBACK_CUTOFF = '09:20'

function readUrlState() {
  const p = new URLSearchParams(window.location.search)
  const tab = VALID_TABS.includes(p.get('tab')) ? p.get('tab') : 'home'
  const cutoff = /^([01]\d|2[0-3]):[0-5]\d$/.test(p.get('cutoff') || '') ? p.get('cutoff') : FALLBACK_CUTOFF
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.get('date') || '') ? p.get('date') : FALLBACK_DATE
  return { tab, cutoff, date }
}

function readStoredTheme() {
  try {
    const t = localStorage.getItem('theme')
    return t === 'dark' || t === 'light' ? t : 'light'
  } catch {
    return 'light'
  }
}

function useUtcClock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return t.toISOString().slice(11, 19)
}

export default function App() {
  const init = useState(readUrlState)[0]
  const [tab, setTab] = useState(init.tab)
  const [cutoff, setCutoff] = useState(init.cutoff)
  const [date, setDate] = useState(init.date)
  const [advancedCutoff, setAdvancedCutoff] = useState(!PRESET_CUTOFFS.some((c) => c.value === init.cutoff))
  const [theme, setTheme] = useState(readStoredTheme)
  const [meta, setMeta] = useState(null)
  const clock = useUtcClock()

  useEffect(() => {
    get('/meta').then(setMeta).catch(() => {})
  }, [])

  // Once the real coverage is known, clamp the current date into range —
  // covers a stale/out-of-range date arriving via a shared URL.
  useEffect(() => {
    if (!meta) return
    const { first, last } = meta.coverage.decisions
    setDate((d) => (d < first ? first : d > last ? last : d))
  }, [meta])

  const clampDate = (d) => {
    if (!meta) return d
    const { first, last } = meta.coverage.decisions
    return d < first ? first : d > last ? last : d
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
  }, [theme])

  useEffect(() => {
    const p = new URLSearchParams()
    p.set('tab', tab)
    p.set('cutoff', cutoff)
    if (tab === 'forecast') p.set('date', date)
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`)
  }, [tab, cutoff, date])

  return (
    <div className="app">
      <div className="brand-strip" />
      <div className="topbar">
        <div className="brand">
          <div className="brandmark" style={{ cursor: 'pointer' }} onClick={() => setTab('home')}><span className="dot" />ENERGY FORECAST DESK</div>
          <nav className="topnav">
            <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}>Home</button>
            <button className={tab === 'forecast' ? 'on' : ''} onClick={() => setTab('forecast')}>Forecast</button>
            <button className={tab === 'accuracy' ? 'on' : ''} onClick={() => setTab('accuracy')}>Accuracy</button>
          </nav>
        </div>
        <div className="topbar-right">
          <span className="pill"><span className="live-dot" /> UTC {clock}</span>
          <div className="cutoff-chips">
            {PRESET_CUTOFFS.map((c) => (
              <button
                key={c.value}
                className={!advancedCutoff && cutoff === c.value ? 'chip-btn on' : 'chip-btn'}
                onClick={() => { setAdvancedCutoff(false); setCutoff(c.value) }}
              >{c.label}</button>
            ))}
            <button className={advancedCutoff ? 'chip-btn on' : 'chip-btn'} onClick={() => setAdvancedCutoff(true)}>Advanced</button>
            {advancedCutoff && (
              <input
                type="time"
                className="cutoff-custom"
                value={cutoff}
                onChange={(e) => e.target.value && setCutoff(e.target.value)}
              />
            )}
          </div>
          <button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? '◐ Light' : '◑ Dark'}
          </button>
        </div>
      </div>
      {tab === 'home' && <Landing cutoff={cutoff} onNavigate={setTab} />}
      {tab === 'forecast' && <Forecast cutoff={cutoff} date={date} setDate={(d) => setDate(clampDate(d))} meta={meta} />}
      {tab === 'accuracy' && <Accuracy cutoff={cutoff} />}
    </div>
  )
}
