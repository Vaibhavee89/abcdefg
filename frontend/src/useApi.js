import { useEffect, useState } from 'react'

/**
 * Runs `fetcher(signal)` whenever deps change or retry() is called.
 * Keeps the previous `data` around while a new fetch is in flight (loading=true),
 * so callers can render stale content dimmed instead of blanking on refresh.
 *
 * When deps change again (or the component unmounts) before the current fetch
 * resolves, its AbortController is aborted — flipping a date/cutoff rapidly
 * cancels the now-irrelevant in-flight requests instead of just letting them
 * finish and discarding the result, so a slow stale response can never land
 * after a newer one and flash outdated data.
 */
export function useApi(fetcher, deps) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetcher(controller.signal)
      .then((result) => {
        setData(result)
        setLoading(false)
      })
      .catch((e) => {
        if (e.name === 'AbortError') return // superseded by a newer fetch; ignore
        setError(e.message || 'Failed to load')
        setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, retry: () => setTick((t) => t + 1) }
}
