import { useState } from 'react'

export default function InfoTip({ text }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      className="info-tip"
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-label={text}
    >
      ⓘ
      {open && <span className="info-tip-bubble" role="tooltip">{text}</span>}
    </span>
  )
}
