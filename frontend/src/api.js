const BASE = import.meta.env.VITE_API_URL || ''

export async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}${path}${qs ? '?' + qs : ''}`)
  if (!res.ok) throw new Error(`${path} failed (${res.status})`)
  return res.json()
}
