// Words and checks for the sign-in and register pages (WS3). Kept apart from
// the pages so they can be unit tested.
import { safeRedirect } from './safeguards'

// The page someone was on their way to, as a query to pass along, so signing
// up from "Sign in to report" still ends on the report page. Only a page
// inside this app counts (see safeRedirect); anything else is dropped.
export function redirectQuery(redirect) {
  const path = safeRedirect(redirect, '')
  return path && path !== '/' ? { redirect: path } : {}
}

// Why the sign-in page opened, when a page sent the person here: one line
// above the form. '' when they came to sign in on their own.
export function redirectReason(redirect) {
  const path = safeRedirect(redirect, '')
  if (!path || path === '/') return ''
  if (/^\/matches\/\d+\/claim/.test(path)) return 'Sign in to claim this find.'
  if (/^\/matches\/\d+\/handoff/.test(path) || path.startsWith('/handoffs')) {
    return 'Sign in to see your handoffs.'
  }
  if (path.startsWith('/matches')) return 'Sign in to see your matches.'
  if (path.startsWith('/report')) return 'Sign in to report an item.'
  if (path.startsWith('/disputes') || path.includes('/dispute'))
    return 'Sign in to see your disputes.'
  if (path.startsWith('/admin')) return 'Sign in to open the Admin page.'
  return 'Sign in to carry on where you were.'
}

// The same rule as the server (server/controllers/auth-controller.js): an
// address at smu.edu.sg or one of its subdomains, e.g. scis.smu.edu.sg
const SMU_EMAIL = /^[^\s@]+@([a-z0-9-]+\.)*smu\.edu\.sg$/i
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 72

// What is wrong with the address, or '' when it is fine (or still empty:
// "required" on the field covers that when the form is sent)
export function emailProblem(email) {
  const value = email.trim()
  if (!value) return ''
  return SMU_EMAIL.test(value) ? '' : 'Use your SMU email, ending in smu.edu.sg.'
}

export function passwordProblem(password) {
  if (!password) return ''
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (password.length > MAX_PASSWORD) return `Keep it to ${MAX_PASSWORD} characters or fewer.`
  return ''
}

// The second password box on the register page. '' while it is still empty,
// as above.
export function confirmProblem(password, confirm) {
  if (!confirm) return ''
  return confirm === password ? '' : 'The two passwords don’t match.'
}

// The SMU addresses students and staff have, offered as chips once "@" is
// typed, so nobody has to type the rest. The plain smu.edu.sg comes first.
export const SMU_DOMAINS = [
  'smu.edu.sg',
  'scis.smu.edu.sg',
  'business.smu.edu.sg',
  'economics.smu.edu.sg',
  'accountancy.smu.edu.sg',
  'law.smu.edu.sg',
  'socsc.smu.edu.sg',
]

// Whole addresses to offer for what has been typed so far: none before the
// "@" or once the address is a full SMU one, else the domains that start with
// what follows the "@" ("alice@sc" -> ['alice@scis.smu.edu.sg']), at most `max`.
export function emailSuggestions(email, max = 4) {
  const value = email.trim()
  const at = value.indexOf('@')
  if (at < 1 || value.indexOf('@', at + 1) !== -1) return []
  if (SMU_EMAIL.test(value)) return []
  const user = value.slice(0, at)
  const typed = value.slice(at + 1).toLowerCase()
  return SMU_DOMAINS.filter((domain) => domain.startsWith(typed) && domain !== typed)
    .slice(0, max)
    .map((domain) => `${user}@${domain}`)
}

// True for an address the server will take
export function isSmuEmail(email) {
  return SMU_EMAIL.test(email.trim())
}
