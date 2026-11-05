// The last pages someone opened, for the trail on the page-not-found screen.
// Kept in sessionStorage because a mistyped address reloads the whole app,
// which wipes anything held in memory. It lasts as long as the browser tab,
// and logging out clears it (stores/auth.js).
import { checkRoute } from '@/router/guard'
import { safeRedirect } from '@/utils/safeguards'

const STORAGE_KEY = 'foundit-last-places'
const SHOWN = 2
// A few more than are shown, as some may be closed to you by the time the
// trail is drawn (after logging out, say)
const REMEMBERED = 5

function savedPlaces() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY))
    return Array.isArray(saved) ? saved.filter((place) => typeof place === 'string') : []
  } catch {
    return []
  }
}

function savePlaces(places) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(places))
  } catch {
    // Storage can be blocked (private windows); the trail just has no stops
  }
}

// A page worth going back to: not the not-found page itself (meta.noTrail),
// not the sign-in pages, and not a page with no name, like the design kit
function isPlace(route) {
  if (route.meta?.noTrail || route.meta?.authBand) return false
  return route.path === '/' || Boolean(route.meta?.title)
}

// "Item 12", so two items in a row can be told apart
function placeLabel(route) {
  const name = route.meta?.title || 'Home'
  return route.params?.id ? `${name} ${route.params.id}` : name
}

// Called after every page change (router/index.js). A page opened again moves
// to the end, and a new query (the feed's filters) replaces the old one.
export function rememberPlace(route) {
  if (!isPlace(route)) return
  const others = savedPlaces().filter((place) => place.split(/[?#]/)[0] !== route.path)
  savePlaces([...others, route.fullPath].slice(-REMEMBERED))
}

export function forgetPlaces() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing was saved if storage is blocked
  }
}

// The last two places, oldest first: [{ to, label }]. Could be none, for
// anyone arriving from a link outside FoundIt. Each address is checked again,
// because the tab may have changed hands or logged out since it was saved.
//   resolve  turns an address into a route, usually router.resolve
//   auth     the auth store
export function lastPlaces(resolve, auth) {
  const places = []
  for (const saved of savedPlaces()) {
    const address = safeRedirect(saved, '')
    if (!address) continue
    const route = resolve(address)
    if (isPlace(route) && checkRoute(route, auth) === true) {
      places.push({ to: address, label: placeLabel(route) })
    }
  }
  return places.slice(-SHOWN)
}
