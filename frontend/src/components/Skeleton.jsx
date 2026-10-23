export function SkeletonBlock({ height = 16, width = '100%' }) {
  return <div className="skeleton" style={{ height, width }} />
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card">
      <SkeletonBlock height={10} width="40%" />
      <div style={{ height: 10 }} />
      <SkeletonBlock height={28} width="60%" />
      <div style={{ height: 10 }} />
      {Array.from({ length: lines }).map((_, i) => <div key={i} style={{ marginTop: 6 }}><SkeletonBlock height={10} /></div>)}
    </div>
  )
}

export function RetryBanner({ message, onRetry }) {
  return (
    <div className="retry-banner">
      <span>⚠ {message || 'Something went wrong loading this data.'}</span>
      <button className="btn-hairline" onClick={onRetry}>Retry</button>
    </div>
  )
}
