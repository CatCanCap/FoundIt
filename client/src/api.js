import axios from 'axios'

export const TOKEN_KEY = 'foundit_token'

// A request that gets no answer in this time fails like any network error,
// so a stalled server can't leave a page (or the app's start-up) waiting forever.
// Reads get 15 seconds. Writes get 30: saving a report runs matching first, and
// on a cold start that took over 10 seconds, so the page said "Not sent" while
// the server had saved it (2026-11-04). A page can still pass its own timeout.
export const REQUEST_TIMEOUT_MS = 15000
export const WRITE_TIMEOUT_MS = 30000

// One axios instance for the whole app. Import this instead of axios.
const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : '/api'),
  timeout: REQUEST_TIMEOUT_MS,
})

// Send the login token with every request, and give writes their longer limit
api.interceptors.request.use((config) => {
  const isRead = !config.method || config.method.toLowerCase() === 'get'
  if (!isRead && config.timeout === REQUEST_TIMEOUT_MS) config.timeout = WRITE_TIMEOUT_MS
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
