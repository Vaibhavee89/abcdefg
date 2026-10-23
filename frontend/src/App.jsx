import { useEffect, useState } from 'react'
import Landing from './pages/Landing'
import Forecast from './pages/Forecast'
import Accuracy from './pages/Accuracy'
import './App.css'

function useUtcClock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return t.toISOString().slice(11, 19)
}

export default function App() {
  const [tab, setTab] = useState('home')
  const [cutoff, setCutoff] = useState('09:00')
  const [theme, setTheme] = useState('light')
  const clock = useUtcClock()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

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
          <span className="pill">Cutoff:
            <select className="cutoff-select" value={cutoff} onChange={(e) => setCutoff(e.target.value)}>
              {['07:00', '09:00', '09:30', '11:00'].map((c) => <option key={c} value={c}>{c} UTC</option>)}
            </select>
          </span>
          <button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? '◐ Light' : '◑ Dark'}
          </button>
        </div>
      </div>
      {tab === 'home' && <Landing cutoff={cutoff} onNavigate={setTab} />}
      {tab === 'forecast' && <Forecast cutoff={cutoff} />}
      {tab === 'accuracy' && <Accuracy cutoff={cutoff} />}
    </div>
  )
}
