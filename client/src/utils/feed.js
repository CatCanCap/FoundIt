// Helpers for the feed. The feed loads every item from the last 30 days at
// once, then filters and counts them in the browser, so switching and
// searching are instant.
import { buildingLabel } from './campus-layout'
import { COLOUR_HEX, categoryFamily, placeName, statusPill } from './design'
import { DAY_MS, SINGAPORE } from './time'

export const WINDOW_DAYS = 30
// The most items the feed asks for on each side
export const FEED_LIMIT = 500
const TYPES = ['found', 'lost']
// The category chips, in order. Each chip covers a group of categories (see
// categoryFamily in utils/design.js). 'other' covers everything else.
export const FAMILIES = ['electronics', 'bottles', 'keys', 'cards', 'umbrellas', 'bags', 'other']

// Extra words for a chip whose name doesn't say everything it covers
export const FAMILY_HINTS = {
  other: 'Clothing, stationery and anything else',
}

export function defaultFilters() {
  return { type: 'found', family: '', q: '' }
}

// Reads the filters from the address bar, like ?type=lost&family=bottles&q=flask.
// Anything unexpected is ignored.
export function filtersFromQuery(query) {
  const filters = defaultFilters()
  const text = (key) => (typeof query[key] === 'string' ? query[key] : '')
  if (TYPES.includes(text('type'))) filters.type = text('type')
  if (FAMILIES.includes(text('family'))) filters.family = text('family')
  filters.q = text('q').slice(0, 100)
  return filters
}

// Turns the filters into the address bar's query, leaving out the defaults
export function filtersToQuery(filters) {
  const query = {}
  if (filters.type !== 'found') query.type = filters.type
  if (filters.family) query.family = filters.family
  if (filters.q.trim()) query.q = filters.q.trim()
  return query
}

// How many items show on one page: two rows of 4 on a laptop, four of 2 on a phone
export const PAGE_SIZE = 8

// Reads ?page=3 from the address bar. Anything that isn't 1 or more means page 1.
export function pageFromQuery(query) {
  const page = typeof query.page === 'string' ? Number(query.page) : NaN
  return Number.isInteger(page) && page >= 1 ? page : 1
}

// How many pages the items need (at least 1)
export function pageCount(total, size = PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / size))
}

// Which way a finger swipe across the feed turns the page: 1 for the next page
// (swiped left), -1 for the one before (swiped right), or 0 when it was not a
// sideways swipe (too short, too slow, or mostly up and down, which is the
// page scrolling).
//   start, end  { x, y, time } where the finger went down and came up
export function swipeStep(start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return 0
  if (end.time - start.time > 800) return 0
  return dx < 0 ? 1 : -1
}

// True when a category or a search is picked
export function hasActiveFilters(filters) {
  return Boolean(filters.family || filters.q.trim())
}

// What to ask GET /api/items for: one type, from the last 30 days.
// view=feed asks for only the items the public feed may show.
export function buildItemParams(type, now = new Date()) {
  return {
    view: 'feed',
    type,
    from: new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString(),
    limit: FEED_LIMIT,
  }
}

// True when an item fits the search. The search can be an item number
// ("0412" or "412"), a building, or any words from the item's details. A
// number also matches words, so "14" finds item 0014 and "iPhone 14".
export function matchesSearch(item, q, spotsById) {
  const text = q.trim().toLowerCase()
  if (!text) return true

  // Only digits: the item's number
  if (/^\d+$/.test(text) && Number(text) === Number(item.id)) return true

  // Otherwise every word must appear in the item's details or places

  const places = item.trail.flatMap((point) => {
    const spot = spotsById.get(point.spotId)
    return spot ? [spot.building, buildingLabel(spot.building), spot.area] : []
  })
  const haystack = [item.title, item.brand, item.colour, item.category, item.description, ...places]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return text.split(/\s+/).every((word) => haystack.includes(word))
}

// The items that fit the picked category and the search
export function applyFilters(items, filters, spotsById) {
  return items.filter((item) => {
    const rightFamily = !filters.family || categoryFamily(item.category) === filters.family
    return rightFamily && matchesSearch(item, filters.q, spotsById)
  })
}

// Posted in the last 7 days
export function isThisWeek(item, now = new Date()) {
  return now.getTime() - new Date(item.createdAt).getTime() < 7 * DAY_MS
}

// The status words the rest of the app uses (see STATUS_PILLS in utils/design.js)
const STATE_OF_STATUS = {
  open: 'open',
  matched: 'claimed',
  resolved: 'returned',
  archived: 'archived',
}

// An item's status in those words, like 'claimed' for a matched item
export function itemState(item) {
  return STATE_OF_STATUS[item.status] || item.status
}

// What the back of a tag asks, and where its button goes, for the person
// looking. Returns { question, label, to }, plus score (0 to 100) for a find
// they have a match on, or badge ("Your claim") for their own report, find or
// claim. Both show on the picture, so those leave the question empty: only a
// question that sets up the button ("Is this yours?") stays above it.
//   userId          the logged-in student's id, or null
//   matchesByFind   their matches (from GET /api/matches/mine) by found item id
// A find they have a match on can be claimed, a find they claimed opens the
// chat, and an open find with no match asks them to report it lost so the
// matching can link the two. A find someone else claimed or got back leads
// to "This is my item". Someone's lost report asks whether they found it.
// Someone not signed in gets { guest: true } and only "See full details": every
// other button would stop at the sign-in page, and the item's page says why to
// sign in ("Sign in to claim").
export function tagAsk(item, { userId = null, matchesByFind = new Map() } = {}) {
  if (userId === null) {
    return { question: '', label: 'See full details', to: `/items/${item.id}/record`, guest: true }
  }
  if (item.postedBy === userId) {
    return item.type === 'lost'
      ? {
          question: '',
          badge: 'Your report',
          label: 'See possible finds',
          to: `/matches/finds/${item.id}`,
        }
      : { question: '', badge: 'Your find', label: 'See its page', to: `/items/${item.id}/record` }
  }
  if (item.type === 'lost') {
    return { question: 'Seen it?', label: 'Report it found', to: '/report/found' }
  }
  const match = matchesByFind.get(item.id)
  if (match && ['claimed', 'confirmed'].includes(match.status)) {
    return { question: '', badge: 'Your claim', label: 'Open the chat', to: `/matches/${match.id}` }
  }
  if (item.status === 'open') {
    if (match?.status === 'suggested') {
      // The button asks the question; the score shows on the picture
      return {
        question: '',
        score: Math.round(match.score),
        label: 'Claim it',
        to: `/matches/${match.id}/claim`,
      }
    }
    return { question: 'Is this yours?', label: 'Report it lost', to: '/report/lost' }
  }
  return { question: 'Is this yours?', label: "Say it's yours", to: `/items/${item.id}/dispute` }
}

// What a found item says instead of its place, when the server leaves the
// place and time out (placeHidden). Only the finder, admins and people whose
// lost report already named that building around that time see them, so
// nobody can read them off the feed and claim something that is not theirs.
export const HIDDEN_PLACE = 'Place hidden'

// Where, for a card or row: the building's short name ("LKS Library"), plus
// "+ 2 more" when a lost item has more places
export function tagPlace(item, spotsById) {
  if (item.placeHidden) return { building: HIDDEN_PLACE, detail: '' }
  if (item.trail.length === 0) return { building: '', detail: '' }
  const spot = spotsById.get(item.trail[0].spotId)
  const others = item.trail.length - 1
  return {
    building: placeName(spot),
    detail: others > 0 ? `+ ${others} more` : '',
  }
}

// The day in Singapore as a number, so two moments can be compared by day
// whatever timezone the browser is in. 'en-CA' writes dates as 2026-10-14.
function singaporeDay(date) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone: SINGAPORE })
    .format(date)
    .split('-')
    .map(Number)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

// When it was found, or when the owner last had it, in Singapore time. The
// day and the time come separately so a page can style the time:
// { day: 'Today', time: '14:05' }, { day: 'Yesterday', time: '' },
// { day: 'Mon 12 Oct', time: '' }, or { day: '12 Oct 2025', time: '' } for
// another year
export function whenParts(item, now = new Date()) {
  if (item.placeHidden || item.trail.length === 0) return { day: '', time: '' }
  const when = new Date(item.trail[item.trail.length - 1].to)
  const daysAgo = singaporeDay(now) - singaporeDay(when)
  if (daysAgo === 0) {
    const time = when.toLocaleTimeString('en-GB', {
      timeZone: SINGAPORE,
      hour: '2-digit',
      minute: '2-digit',
    })
    return { day: 'Today', time }
  }
  if (daysAgo === 1) return { day: 'Yesterday', time: '' }
  const sameYear =
    when.toLocaleDateString('en-GB', { timeZone: SINGAPORE, year: 'numeric' }) ===
    now.toLocaleDateString('en-GB', { timeZone: SINGAPORE, year: 'numeric' })
  return {
    day: when.toLocaleDateString(
      'en-GB',
      sameYear
        ? { timeZone: SINGAPORE, weekday: 'short', day: 'numeric', month: 'short' }
        : { timeZone: SINGAPORE, day: 'numeric', month: 'short', year: 'numeric' },
    ),
    time: '',
  }
}

// The same in one line: "Today, 14:05", "Yesterday", "Mon 12 Oct"
export function describeWhen(item, now = new Date()) {
  const { day, time } = whenParts(item, now)
  return time ? `${day}, ${time}` : day
}

// "Good morning", "Good afternoon" or "Good evening", by Singapore time
export function greeting(now = new Date()) {
  const hour = Number(now.toLocaleString('en-GB', { timeZone: SINGAPORE, hour: '2-digit' }))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// How far apart two moments are, in words: "20 minutes", "3 hours", "2 days"
export function gapInWords(from, to) {
  const minutes = Math.round(Math.abs(new Date(to) - new Date(from)) / 60000)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.round(hours / 24)
  return `${days} days`
}

// The name to greet someone by: "Alice Tan" becomes "Alice", and
// "Wei Ling Tan" becomes "Wei Ling" (everything but the surname)
export function greetingName(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length <= 2) return words[0] || ''
  return words.slice(0, -1).join(' ')
}

// The item's category in lower case, for "Your water bottle turned up"
export function itemWord(category) {
  return (category || 'item').toLowerCase()
}

// The rebuilt feed's cards and list (components/feed/) -------------------------

// The item's colours as dots on its card, main colour first: up to three
// { name, hex }. A colour with no swatch (Multicolour) is left out.
export function colourDots(item) {
  const names = Array.isArray(item.colours) && item.colours.length ? item.colours : [item.colour]
  return names
    .filter((name) => COLOUR_HEX[name])
    .slice(0, 3)
    .map((name) => ({ name, hex: COLOUR_HEX[name] }))
}

// The status a row shows. Most items are open, so an open one shows none:
// only a status that is different is worth a label ("Claimed")
export function rowStatus(item) {
  const state = itemState(item)
  return state === 'open' ? null : statusPill(state)
}

// How many items of each category family fit the search, for the counts
// beside the categories: { '': every one, electronics: 3, bottles: 0, … }
export function familyCounts(items, q, spotsById) {
  const counts = Object.fromEntries(['', ...FAMILIES].map((family) => [family, 0]))
  for (const item of items) {
    if (!matchesSearch(item, q, spotsById)) continue
    counts[''] += 1
    counts[categoryFamily(item.category)] += 1
  }
  return counts
}
