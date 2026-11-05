// Words and sums for the landing page (views/LandingView.vue). Kept apart from
// the page so they can be unit tested.
import { placeName } from './design'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const SINGAPORE = 'Asia/Singapore'

// The newest finds someone could still claim: open, with a place, newest first
export function newestOpen(items, count = 5) {
  return items
    .filter((item) => item.status === 'open' && item.trail?.length)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, count)
}

// How many finds were handed in over the last 7 days, and the 7 before that
export function weekCounts(items, now = new Date()) {
  const counts = { thisWeek: 0, lastWeek: 0 }
  for (const item of items) {
    const age = now.getTime() - Date.parse(item.createdAt)
    if (age < 0) continue
    if (age < 7 * DAY_MS) counts.thisWeek += 1
    else if (age < 14 * DAY_MS) counts.lastWeek += 1
  }
  return counts
}

// "12 handed in over the last 7 days, 9 the week before"
export function weekLine({ thisWeek, lastWeek }) {
  const finds = thisWeek === 1 ? '1 find' : `${thisWeek} finds`
  return `${finds} handed in over the last 7 days, ${lastWeek} the week before`
}

// How long ago a find was posted: "Just now", "12 min ago", "3 h ago", then
// the day in Singapore time ("Mon 26 Oct")
export function handedInAgo(createdAt, now = new Date()) {
  const age = now.getTime() - Date.parse(createdAt)
  if (age < MINUTE_MS) return 'Just now'
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)} min ago`
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)} h ago`
  return new Date(createdAt).toLocaleDateString('en-GB', {
    timeZone: SINGAPORE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

// Where a find was picked up: "LKS Library · Level 2"
export function placeLine(spot) {
  if (!spot) return ''
  return spot.floor ? `${placeName(spot)} · ${spot.floor}` : placeName(spot)
}
