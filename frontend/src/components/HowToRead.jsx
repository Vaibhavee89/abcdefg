import { useState } from 'react'

export default function HowToRead({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="how-to-read card">
      <button className="how-to-read-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>How to read this page</span>
        <span className={`chevron${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && <div className="how-to-read-body">{children}</div>}
    </div>
  )
}
