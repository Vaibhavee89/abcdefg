import { useEffect, useState } from 'react'
import Landing from './pages/Landing'
import Forecast from './pages/Forecast'
import Accuracy from './pages/Accuracy'
import './App.css'

const PRESET_CUTOFFS = ['09:00', '09:30']
const VALID_TABS = ['home', 'forecast', 'accuracy']
const DEFAULT_DATE = '2026-01-14'
const clampDate = (d) => (d < '2026-01-01' ? '2026-01-01' : d > '2026-01-31' ? '2026-01-31' : d)

function readUrlState() {
  const p = new URLSearchParams(window.location.search)
  const tab = VALID_TABS.includes(p.get('tab')) ? p.get('tab') : 'home'
  const cutoff = /^([01]\d|2[0-3]):[0-5]\d$/.test(p.get('cutoff') || '') ? p.get('cutoff') : '09:00'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.get('date') || '') ? clampDate(p.get('date')) : DEFAULT_DATE
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
  const [advancedCutoff, setAdvancedCutoff] = useState(!PRESET_CUTOFFS.includes(init.cutoff))
  const [theme, setTheme] = useState(readStoredTheme)
  const clock = useUtcClock()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
  }, [theme])

  useEffect(() => {
    const p = new URLSearchParams()
    p.set('tab', tab)
    p.set('cutoff', cutoff)
    p.set('date', date)
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`)
  }, [tab, cutoff, date])

  return (
    <div className="app">
      <div className="brand-strip" />
      <div className="topbar">
        <div className="brand">
          <div className="brandmark" style={{ cursor: 'pointer' }} onClick={() => setTab('home')}><span className="dot" />WIND FORECAST DESK</div>
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
                key={c}
                className={!advancedCutoff && cutoff === c ? 'chip-btn on' : 'chip-btn'}
                onClick={() => { setAdvancedCutoff(false); setCutoff(c) }}
              >{c}</button>
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
      {tab === 'forecast' && <Forecast cutoff={cutoff} date={date} setDate={(d) => setDate(clampDate(d))} />}
      {tab === 'accuracy' && <Accuracy cutoff={cutoff} />}
    </div>
  )
}
