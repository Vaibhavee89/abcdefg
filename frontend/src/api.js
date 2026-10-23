const BASE = import.meta.env.VITE_API_URL || ''
const API_PREFIX = '/api/v1'

export async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}${API_PREFIX}${path}${qs ? '?' + qs : ''}`)
  if (!res.ok) {
    // backend errors are always { error: { code, message } } (see backend/app/main.py)
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message || `${path} failed (${res.status})`)
  }
  return res.json()
}
