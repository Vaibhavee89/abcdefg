import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'

// registerType: 'autoUpdate' handles silently installing + activating new
// service worker versions and reloading the page once the new one takes
// control, so a deploy's fixes (like this) show up after a normal reload
// instead of needing the tab to be closed and reopened.
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
