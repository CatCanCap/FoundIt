// Words and links for the Matches page (WS3, Figma V09 and V10). Kept apart
// from the page so they can be unit tested.
import { COLOUR_HEX, categoryFamily, itemDigits, mainColour, placeName } from './design'
import { areaLabel } from './campus-map'
import { HIDDEN_PLACE } from './feed'
import { MAX_COLOURS } from './report'
import { SINGAPORE } from './time'

// The feed, showing found items of the report's kind (?family=bottles), for an
// owner whose report has no finds yet. Matching only offers finds of the same or
// a related category, so a find filed differently is only found by looking.
export function feedSearchLink(category) {
  return { path: '/feed', query: { family: categoryFamily(category) } }
}

// The lost report's number, as on every other page: "0412"
export function lostCode(id) {
  return itemDigits(id)
}

// "Water Bottle" -> "water bottle", for "3 finds look like your water bottle."
export function itemNoun(category) {
  return category ? category.toLowerCase() : 'item'
}

// "1 find looks like" / "3 finds look like"
export function findsLookLike(count) {
  return count === 1 ? '1 find looks like' : `${count} finds look like`
}

// Where the found item turned up: { building: 'LKS Library', area: 'Service Desk' },
// with the building's short name as on the map
export function whereFound(item, spotsById) {
  // The server left the place out (see HIDDEN_PLACE in utils/feed.js)
  if (item.placeHidden) return { building: HIDDEN_PLACE, area: '' }
  const point = item.trail?.[0]
  const spot = point ? spotsById.get(point.spotId) : null
  return {
    building: placeName(spot),
    area: spot ? areaLabel(spot.area) : '',
  }
}

// The rest of "Found at SCIS 1, seminar rooms, today at 14:05." after the
// building: the area, then the day in words ("today", "yesterday",
// "on Thu 22 Oct") and the time when there is one. `when` is
// whenParts(item) from utils/feed.js: { day: 'Today', time: '14:05' }.
export function foundWhereWhen(area, when) {
  const { day = '', time = '' } = when || {}
  const dayWords = ['Today', 'Yesterday'].includes(day) ? day.toLowerCase() : day ? `on ${day}` : ''
  const at = dayWords && time ? ` at ${time}` : ''
  return `${area ? `, ${area}` : ''}${dayWords ? `, ${dayWords}${at}` : ''}.`
}

// The engine's reasons ("same category", "within a day") as the design writes
// them: a capital first letter
export function reasonText(reason) {
  return reason ? reason[0].toUpperCase() + reason.slice(1) : ''
}

// A match's reasons as { lead, detail } pairs, ready for a two-sided line:
// "Same brand" on the left, "Hydro Flask" on the right. GET /api/matches/mine
// sends them as reasonParts (server/matching/reasons.js), so the page never
// has to pick the engine's sentences apart. Each lead gets a capital letter.
export function reasonPartsOf(match) {
  const parts = Array.isArray(match.reasonParts)
    ? match.reasonParts
    : (match.reasons || []).map((reason) => ({ lead: reason, detail: '' }))
  return parts.map((part) => ({ lead: reasonLead(part), detail: part.detail || '' }))
}

// The engine's "both mention" (also in saved matches, so it stays as it is
// there) reads "Same mention" on the page, or "Same mentions" for several words
function reasonLead(part) {
  if (part.lead !== 'both mention') return reasonText(part.lead)
  return String(part.detail || '').includes(',') ? 'Same mentions' : 'Same mention'
}

// The colour to draw an item's picture in when it has no photo: its main
// colour (the same swatch ItemIcon uses, from utils/design.js), or
// 'currentColor' (the page's grey) when the colour has no swatch (Clear,
// Multicolour) or isn't given
export function itemTone(item) {
  return COLOUR_HEX[mainColour(item)] || 'currentColor'
}

// The short line on an "Other finds" row: what matched, without the details.
// "Same category, same colour."
export function shortReasons(match, count = 3) {
  const leads = reasonPartsOf(match)
    .slice(0, count)
    .map((part) => part.lead.toLowerCase())
  if (leads.length === 0) return ''
  return `${reasonText(leads.join(', '))}.`
}

// Where "This is mine" and "See where it's at" go (WS5's pages): a match that
// is already claimed goes straight to its handoff, so the claim page does not
// flash up first
export function claimLink(match) {
  return match.status === 'claimed' || match.status === 'confirmed'
    ? `/matches/${match.id}/handoff`
    : `/matches/${match.id}/claim`
}

// A find still waiting for your answer whose found item is no longer open:
// someone else claimed it, or it went back to its owner, before the page
// caught up. Returns { state, label, note, recordLink } so the page shows a
// status pill (state and label, see StatusPill) and a line instead of "This
// is mine", or null while the find can still be claimed. recordLink is the
// item record, where "This is my item" opens a dispute; null when the find is
// gone altogether.
export function takenFind(match) {
  const item = match.item
  if (match.status !== 'suggested' || !item?.status || item.status === 'open') return null
  const recordLink = `/items/${item.id}/record`
  if (item.status === 'matched') {
    return {
      state: 'claimed',
      label: 'Claimed by someone else',
      note: 'Think it’s yours? You can dispute the claim from the item’s page.',
      recordLink,
    }
  }
  if (item.status === 'resolved') {
    return {
      state: 'resolved',
      label: 'Back with its owner',
      note: 'Think it’s yours? You can still dispute it for 7 days after it was returned.',
      recordLink,
    }
  }
  return {
    state: 'archived',
    label: 'No longer listed',
    note: 'The finder’s report has been taken down.',
    recordLink: null,
  }
}

// The finds page for one of your lost reports that is no longer on the
// Matches page (only open reports and ones being returned are). The heading
// runs like "1 find looks like your wallet.": { lead, accent, note }, with
// accent in the serif.
export function closedReportNote(item) {
  if (item.status === 'resolved') {
    return {
      lead: 'You got',
      accent: `your ${itemNoun(item.category)} back.`,
      note: 'This report is closed, so new finds are no longer matched to it. Its page keeps the whole story.',
    }
  }
  if (item.status === 'archived') {
    return {
      lead: 'This report',
      accent: 'was archived.',
      note: 'It had no news for 30 days, so it stopped matching. Lost it again? A new report starts fresh.',
    }
  }
  return {
    lead: 'This report',
    accent: 'is closed.',
    note: 'New finds are no longer matched to it.',
  }
}

// A report being returned (status 'matched') has one claimed match: the one
// whose handoff the owner is in. Null while the report is still open.
export function claimedMatch(report) {
  if (report.item.status !== 'matched') return null
  return (
    report.matches.find((match) => match.status === 'claimed' || match.status === 'confirmed') ||
    null
  )
}

// Which group a report is in on the Matches page: 'back' while it is being
// returned, 'finds' while finds look like it, 'none' while nothing does yet
export function reportKind(report) {
  if (report.item.status === 'matched') return 'back'
  return report.matches.length > 0 ? 'finds' : 'none'
}

// The filters over the tags on the Matches page, in the order they show.
// The key goes in the address bar as ?show=finds; All has no key.
export const REPORT_FILTERS = [
  { key: '', label: 'All' },
  { key: 'finds', label: 'Finds to check' },
  { key: 'back', label: 'Being returned' },
  { key: 'none', label: 'No finds yet' },
]

// The filter in the address bar, or '' (All) for anything else
export function reportFilterFromQuery(query) {
  const key = typeof query.show === 'string' ? query.show : ''
  return REPORT_FILTERS.some((filter) => filter.key === key) ? key : ''
}

// The words on a report's tag: "2 finds", "Being returned" or "No finds yet"
export function reportTagLabel(report) {
  const kind = reportKind(report)
  if (kind === 'back') return 'Being returned'
  if (kind === 'none') return 'No finds yet'
  return report.matches.length === 1 ? '1 find' : `${report.matches.length} finds`
}

// The Matches page offers a search box once there are this many reports
export const REPORT_SEARCH_FROM = 9

// The reports whose words hold every word searched for, in any order: "black
// sony" finds "Black Sony WH-1000XM4 headphones". It looks in the name,
// category, brand, colours, description and report number ("0412").
export function searchReports(reports, text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return reports
  return reports.filter((report) => {
    const item = report.item
    const reportText = [
      item.title,
      item.category,
      item.brand,
      item.description,
      lostCode(item.id),
      ...coloursOf(item),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return words.every((word) => reportText.includes(word))
  })
}

// The header's MATCHES badge counts finds like unread mail: those still
// waiting for an answer that you haven't looked at yet. A find counts as seen
// once its report's finds page has been opened. Which ones you've seen, and
// which declined claims you hid, are kept in this browser only (localStorage),
// one entry per account so a shared lab PC keeps students apart. If storage is
// blocked, nothing is remembered.
const SEEN_MATCHES_KEY = 'foundit-matches-seen'
const HIDDEN_DECLINED_KEY = 'foundit-hidden-declined'

function readIds(key, userId) {
  if (userId === null || userId === undefined) return new Set()
  try {
    const ids = JSON.parse(localStorage.getItem(`${key}-${userId}`) || '[]')
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

function writeIds(key, userId, ids) {
  if (userId === null || userId === undefined) return
  try {
    localStorage.setItem(`${key}-${userId}`, JSON.stringify([...ids]))
  } catch {
    // Not remembered; it comes back after a refresh
  }
}

export const readSeenMatches = (userId) => readIds(SEEN_MATCHES_KEY, userId)
export const writeSeenMatches = (userId, seen) => writeIds(SEEN_MATCHES_KEY, userId, seen)
export const readHiddenDeclined = (userId) => readIds(HIDDEN_DECLINED_KEY, userId)
export const writeHiddenDeclined = (userId, hidden) => writeIds(HIDDEN_DECLINED_KEY, userId, hidden)

// Finds still waiting for an answer that you haven't seen yet
export function unseenCount(reports, seen = new Set()) {
  return reports.reduce(
    (total, report) =>
      total +
      report.matches.filter((match) => match.status === 'suggested' && !seen.has(match.id)).length,
    0,
  )
}

// The fields of a lost report the owner can change on the Matches page. Words
// are form values ('' when empty); colours are a list of up to 3 names, main
// colour first; photoUrl is the Cloudinary link ('' for none).
// PATCH /api/items/:id takes no trail yet.
export const TEXT_FIELDS = ['title', 'category', 'brand', 'description']
export const EDITABLE_FIELDS = [...TEXT_FIELDS, 'colours', 'photoUrl']
// The same colour limit as the report forms (utils/report.js), passed on for
// the edit form
export { MAX_COLOURS }

// An item's colours, main colour first. An item saved before items had a
// colour list has only its one `colour`.
export function coloursOf(item) {
  if (Array.isArray(item.colours) && item.colours.length > 0) return item.colours
  return item.colour ? [item.colour] : []
}

export function draftOf(item) {
  return {
    ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, item[key] || ''])),
    colours: [...coloursOf(item)],
    photoUrl: item.photoUrl || '',
  }
}

// Only what changed, trimmed, ready for PATCH /api/items/:id. An empty brand
// or description clears it; an empty colour list clears the colours, and an
// empty photoUrl removes the photo.
export function changedFields(item, draft) {
  const original = draftOf(item)
  const changes = {}
  for (const key of TEXT_FIELDS) {
    const value = draft[key].trim()
    if (value !== original[key].trim()) changes[key] = value
  }
  if (draft.colours.join('|') !== original.colours.join('|')) changes.colours = [...draft.colours]
  if (draft.photoUrl !== original.photoUrl) changes.photoUrl = draft.photoUrl
  return changes
}

// What is wrong with the form, or '' when it can be saved. The same limits as
// the API (server/controllers/items-controller.js).
export function checkDraft(draft) {
  if (!draft.title.trim()) return 'Give your item a name.'
  if (draft.title.trim().length > 100) return 'Keep the name to 100 characters.'
  if (!draft.category) return 'Pick a category.'
  if (draft.colours.length > MAX_COLOURS) return `Pick at most ${MAX_COLOURS} colours.`
  if (draft.brand.length > 50) return 'Keep the brand to 50 characters.'
  if (draft.description.length > 2000) return 'Keep the description to 2000 characters.'
  return ''
}

// One stop on a lost report's trail, as separate pieces for the page to lay
// out: { place: 'SCIS 1, Level 2', area: 'Lift Lobby',
// when: 'Mon 12 Oct, 10:00 to 12:00' }, in Singapore time
export function trailStops(item, spotsById) {
  const day = (date) =>
    date.toLocaleDateString('en-GB', {
      timeZone: SINGAPORE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  const time = (date) =>
    date.toLocaleTimeString('en-GB', { timeZone: SINGAPORE, hour: '2-digit', minute: '2-digit' })
  // A find whose place and time the server left out: one stop that says so
  // (new Date(null) would read as 1 January 1970)
  if (item.placeHidden) return [{ place: HIDDEN_PLACE, area: '', when: '' }]
  return (item.trail || []).map((point) => {
    const from = new Date(point.from)
    const to = new Date(point.to)
    const valid = !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())
    const spot = spotsById.get(point.spotId)
    return {
      place: spot ? `${placeName(spot)}, ${spot.floor}` : 'Unknown place',
      area: spot ? areaLabel(spot.area) : '',
      when: valid ? `${day(from)}, ${time(from)} to ${time(to)}` : '',
    }
  })
}

// The pill on a lost report: its colour (a StatusPill state) and words.
// The feed's words are about found items ("Waiting for its owner"), so a lost
// report gets its own.
export function reportStatus(item) {
  if (item.status === 'matched') return { state: 'claimed', label: 'Being returned' }
  if (item.status === 'resolved') return { state: 'resolved', label: 'Back with you' }
  return { state: 'open', label: 'Still looking' }
}

// "The finder declined your claim on 22 Oct.", in Singapore time
export function declinedLine(declinedAt) {
  const time = Date.parse(declinedAt)
  if (Number.isNaN(time)) return 'The finder declined your claim.'
  const day = new Date(time).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    timeZone: SINGAPORE,
  })
  return `The finder declined your claim on ${day}.`
}

// ---- Why it matched, shown on both reports (the finds page) ---------------

// Which part of the two reports a reason is about, so picking the reason can
// light up that part of both: 'category', 'colour', 'brand', 'words', 'place'
// or 'time', or null for a reason that is about none of them. The leads are
// the engine's (server/matching/), in either case.
export function reasonKind(lead) {
  const text = String(lead || '').toLowerCase()
  if (text.includes('category')) return 'category'
  if (text.includes('colour') || text === 'both have') return 'colour'
  if (text === 'same brand') return 'brand'
  if (text === 'both mention' || /^same mentions?$/.test(text)) return 'words'
  if (/^(same (room|area|place|floor|building)|nearby buildings|trail covers)/.test(text)) {
    return 'place'
  }
  if (text === 'within a day' || /days? apart$/.test(text)) return 'time'
  return null
}

// The words to mark in both reports for one reason: the brand, the words
// both mention, or the colours they share. [] for a reason about a place or
// a time, which lights up a whole line instead.
//   part   { lead, detail } from reasonPartsOf
//   lost, found   the two items
export function reasonTerms(part, lost, found) {
  const kind = reasonKind(part.lead)
  const listed = (separator) =>
    String(part.detail || '')
      .split(separator)
      .map((word) => word.trim())
      .filter(Boolean)
  if (kind === 'brand') return part.detail ? [part.detail.trim()] : []
  if (kind === 'words') return listed(',')
  if (kind === 'colour') {
    // "both have: Black and White", "similar colour: Navy and Blue"; plain
    // "same colour" names none, so it is the colours the two share
    if (part.detail) return listed(' and ')
    const theirs = new Set(coloursOf(found).map((name) => name.toLowerCase()))
    return coloursOf(lost).filter((name) => theirs.has(name.toLowerCase()))
  }
  return []
}

// Every reason of a match with its kind and the words it marks:
// [{ lead, detail, kind, terms }]
export function reasonMarks(match, lost) {
  return reasonPartsOf(match).map((part) => ({
    ...part,
    kind: reasonKind(part.lead),
    terms: reasonTerms(part, lost, match.item),
  }))
}

function escapeForPattern(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A piece of text cut up around the words the reasons mark, for <mark>:
// [{ text: 'Black ', kinds: [] }, { text: 'Coach', kinds: ['brand'] }, ...].
// A word matches from its start, so "card" marks "cards" too, in any case.
//   marks  [{ kind, terms }] from reasonMarks
export function markText(text, marks) {
  const value = String(text || '')
  if (!value) return []
  const terms = marks.flatMap((mark) =>
    mark.terms.map((term) => ({ term: term.toLowerCase(), kind: mark.kind })),
  )
  if (terms.length === 0) return [{ text: value, kinds: [] }]
  // Longest first, so "Hydro Flask" is marked whole rather than just "Hydro"
  const words = [...new Set(terms.map((entry) => entry.term))].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${words.map(escapeForPattern).join('|')})[\\p{L}\\p{N}]*`,
    'giu',
  )
  const pieces = []
  let from = 0
  for (const found of value.matchAll(pattern)) {
    if (found.index > from) pieces.push({ text: value.slice(from, found.index), kinds: [] })
    const lower = found[0].toLowerCase()
    const kinds = [
      ...new Set(terms.filter((entry) => lower.startsWith(entry.term)).map((entry) => entry.kind)),
    ]
    pieces.push({ text: found[0], kinds })
    from = found.index + found[0].length
  }
  if (from < value.length) pieces.push({ text: value.slice(from), kinds: [] })
  return pieces
}
