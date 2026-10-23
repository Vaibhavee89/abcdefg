import { useEffect, useRef, useState } from 'react'

/**
 * Runs `fetcher()` whenever deps change or retry() is called.
 * Keeps the previous `data` around while a new fetch is in flight (loading=true),
 * so callers can render stale content dimmed instead of blanking on refresh.
 */
export function useApi(fetcher, deps) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    fetcher()
      .then((result) => {
        if (seq.current !== id) return
        setData(result)
        setLoading(false)
      })
      .catch((e) => {
        if (seq.current !== id) return
        setError(e.message || 'Failed to load')
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, retry: () => setTick((t) => t + 1) }
}
