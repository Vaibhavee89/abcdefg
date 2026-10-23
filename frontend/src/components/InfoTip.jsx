import { useRef, useState } from 'react'

// The bubble is positioned via the icon's actual screen coordinates
// (position: fixed) rather than CSS position:absolute relative to the icon.
// That avoids depending on the icon's ancestor chain having no clipping
// overflow/stacking context in the way — which is unreliable inside things
// like table cells — and keeps the bubble correctly placed regardless of
// where the icon is used.
export default function InfoTip({ text }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ top: r.top, left: r.left + r.width / 2 })
  }
  const hide = () => setPos(null)

  return (
    <span
      ref={ref}
      className="info-tip"
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-label={text}
    >
      ⓘ
      {pos && (
        <span
          className="info-tip-bubble"
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
