// Labels and small rules for feature 5 (item record, disputes, Admin page).
// No Vue and no API here, so they are easy to unit test.
import { initials as twoInitials, itemDigits } from './design'
import { DAY_MS, HOUR_MS, SINGAPORE } from './time'

// Dispute status in words, for the person who raised it and for the claimer
export const DISPUTE_LABELS = {
  raiser: {
    open: 'Waiting for an admin',
    upheld: 'Decided: the item is yours',
    withdrawn: 'The claim was withdrawn: the item is yours',
    closed: 'Decided: the claim was kept',
  },
  claimer: {
    open: 'Waiting for an admin',
    upheld: 'Decided: the item went to the other person',
    withdrawn: 'You withdrew your claim',
    closed: 'Decided: your claim was kept',
  },
}

// D-0141, the way the Admin page names a dispute
export function disputeCode(id) {
  return `D-${String(id).padStart(4, '0')}`
}

// Item numbers, as four digits like on every other page: 3298, 0421
export function itemCode(id) {
  return itemDigits(id)
}

export function lostCode(id) {
  return itemDigits(id)
}

// "Wei Ling" -> "WL", for the round name badges on the Admin page. The same
// rule as the header's avatar (utils/design.js), with '?' for a missing name.
export function initials(name) {
  return twoInitials(name) || '?'
}

// How a decided dispute ended, in the Admin page's words. `short` fits a
// table cell, `long` heads the decision card on the case page.
export const OUTCOMES = {
  upheld: {
    short: 'Returned to the person who disputed',
    long: 'Returned to the person who disputed the claim',
  },
  closed: { short: 'Claim kept', long: 'The claim was kept' },
  withdrawn: { short: 'Claim withdrawn', long: 'The claimer withdrew their claim' },
}

// Only ever go to a page inside the app, never to another site: a path that
// starts with one "/" (not "//"), else `fallback`. `avoid` is a path that
// would send the person round in a circle, such as '/verify-email'.
export function safeRedirect(path, fallback = '/', avoid = '') {
  const isSafe =
    typeof path === 'string' &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !(avoid && path.startsWith(avoid))
  return isSafe ? path : fallback
}

// Where "Back to the queue" goes from a case page: the Admin list the admin
// came from, with its tab, search and page (Vue Router keeps the previous
// address in history.state.back), else the Admin page itself
export function queuePath(back, fallback = '/admin') {
  return typeof back === 'string' && /^\/admin(\?|$)/.test(back) ? back : fallback
}

// The four-stop track under an item record: Posted, Matched, Handoff pending,
// Resolved. Each stop has the time it was reached, or null. `current` is the
// stop the item is waiting on, or -1 while nobody has claimed it.
export function recordProgress(record) {
  const timeline = record?.timeline || []
  const last = (event) => timeline.filter((entry) => entry.event === event).at(-1)?.at || null
  const claimedAt = last('claimed')
  // A handover or return from before a claim moved to someone else does not
  // count. The owner can confirm they have it back without the finder marking
  // it handed over first, so the return is taken on its own (as on the item
  // page, utils/item-page.js), not only after a handover.
  const sinceClaim = (event) => (claimedAt && last(event) > claimedAt ? last(event) : null)
  const handedOverAt = sinceClaim('handed_over')
  const returnedAt = sinceClaim('returned')
  const isReturned = ['returned', 'resolved'].includes(record?.state)
  const isMatched = isReturned || ['matched', 'claimed', 'disputed'].includes(record?.state)

  const stops = [
    { label: 'Posted', at: last('reported') || record?.item?.createdAt || null, reached: true },
    { label: 'Matched', at: claimedAt, reached: Boolean(claimedAt) || isMatched },
    {
      label: 'Handoff pending',
      at: handedOverAt || returnedAt,
      reached: Boolean(handedOverAt || returnedAt) || isReturned,
    },
    { label: 'Resolved', at: returnedAt, reached: Boolean(returnedAt) || isReturned },
  ]
  const waiting = ['open', 'archived'].includes(record?.state)
  const current = waiting ? -1 : stops.findIndex((stop) => !stop.reached)
  return { stops, current, handedOverAt, returnedAt }
}

export const DISPUTE_WINDOW_DAYS = 7

// After an item is returned it can still be disputed for 7 days. Returns how
// much of that window is left (0 to 1) and when it closes.
export function disputeWindow(returnedAt, now = new Date()) {
  if (!returnedAt) return null
  const length = DISPUTE_WINDOW_DAYS * DAY_MS
  const closesAt = new Date(new Date(returnedAt).getTime() + length)
  const left = Math.min(1, Math.max(0, (closesAt - now) / length))
  return { closesAt: closesAt.toISOString(), left, isOpen: left > 0 }
}

// 14 Oct, 11:20 in Singapore time, whatever the device's time zone
export function formatWhen(iso) {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SINGAPORE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const part = (type) => parts.find((entry) => entry.type === type).value
  return `${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`
}

// How long a case has waited: '5 min', '2 h', '1 d'
export function waitingFor(iso, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now - new Date(iso)) / 60000))
  if (minutes < 60) return `${minutes} min`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`
  return `${Math.floor(minutes / (24 * 60))} d`
}

// Whether to offer "This is my item" on an item record. The server checks
// everything again; this only hides a button that would be refused.
export function canDispute(record, user) {
  if (!record || !user) return false
  const { item, state } = record
  return (
    item.type === 'found' && ['claimed', 'returned'].includes(state) && item.postedBy !== user.id
  )
}

// When the claim that now stands on an item was made, from its record's
// timeline, or null
export function claimedAt(record) {
  const claims = (record?.timeline || []).filter((entry) => entry.event === 'claimed')
  return claims.at(-1)?.at || null
}

// Why this person cannot dispute an item, in one sentence, or '' when they
// can. Used by the dispute form so nobody fills it in only to be refused; the
// server checks everything again. (Whether they made the claim themselves is
// private, so only the server can say that.)
export function disputeBlocker(record, user, now = new Date()) {
  if (!record || !user) return ''
  const { item, state } = record
  if (user.role === 'admin') {
    return 'Admins decide disputes, so an admin account cannot raise one. Sign in with your student account if the item is yours.'
  }
  // The server refuses it (403), so say so before they write it all out
  if (user.suspendedAt) {
    return 'Your account is suspended, so you cannot raise a dispute. You can appeal the suspension.'
  }
  if (item.type !== 'found') return 'Only a found item that someone has claimed can be disputed.'
  if (item.postedBy === user.id) {
    return 'You reported finding this item, so you cannot dispute its claim.'
  }
  if (!['claimed', 'disputed', 'returned'].includes(state)) {
    return 'Nobody has claimed this item, so there is nothing to dispute. If it is yours, report it as lost and claim it from Matches.'
  }
  const window7 = disputeWindow(recordProgress(record).returnedAt, now)
  if (window7 && !window7.isOpen) {
    return `This item was returned more than ${DISPUTE_WINDOW_DAYS} days ago, so it can no longer be disputed.`
  }
  return ''
}

// The lost report the server attaches to a dispute (findOwnLostReport in
// server/controllers/disputes-controller.js): of the person's lost reports in
// the item's category, newest first, the newest one filed before the claim,
// else the newest. Its time shows the admin when they lost it.
export function attachedLostReport(reports, claimTime) {
  if (!reports?.length) return null
  return (claimTime && reports.find((report) => report.createdAt < claimTime)) || reports[0]
}

// The API's { error } message, or a fallback when the server cannot be reached
export function errorText(error) {
  return error?.response?.data?.error || 'Could not reach the server. Please try again.'
}

// True when a request failed because nothing useful came back from FoundIt:
// no answer at all (offline, server down), the time limit in api.js,
// or a 5xx from the host with no { error } of ours (a 502 or 504 page). Pages
// show components/ui/ConnectionProblem.vue (a page that can't load) or
// NotSentNote.vue (a form that didn't send) for these. Anything else is the
// server's own answer, and its words are shown as they are (errorText).
export function isConnectionError(error) {
  if (!error || error.code === 'ERR_CANCELED') return false
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true
  const response = error.response
  if (!response) return true
  return response.status >= 500 && !response.data?.error
}

// True when a send got no answer in time (the time limit in api.js, or a 502 or
// 504 from the host): the server may well have saved it. The page should check
// (load it again) rather than say it was not sent, and NotSentNote says so.
export function mayHaveSent(error) {
  if (!error) return false
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true
  const status = error.response?.status
  return (status === 502 || status === 504) && !error.response?.data?.error
}

// How long a case has waited, in words for the Admin queue: '5 min', '2 hrs',
// '1 day', '3 days'. `isLong` is true from one day on (shown in orange).
export function waitingWords(iso, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now - new Date(iso)) / 60000))
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
  if (minutes < 60) return { text: `${minutes} min`, isLong: false }
  if (minutes < 24 * 60) return { text: plural(Math.floor(minutes / 60), 'hr'), isLong: false }
  return { text: plural(Math.floor(minutes / (24 * 60)), 'day'), isLong: true }
}

// ---- Paging for the Admin lists ----
// The admin routes return whole lists, so the browser cuts them into pages.

export const PER_PAGE = 10

// Where a page sits in a list of `total` rows. `page` counts from 1 and is
// kept between 1 and the last page, so a list that shrinks (after a decision)
// never shows an empty page. `from` and `to` are for "Showing 11–20 of 23"
// (both 0 for an empty list).
export function pageInfo(total, page, perPage = PER_PAGE) {
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const current = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pageCount)
  const start = (current - 1) * perPage
  return {
    page: current,
    pageCount,
    total,
    from: total ? start + 1 : 0,
    to: Math.min(start + perPage, total),
  }
}

// The rows on one page of a list, with the same facts as pageInfo
export function pageOf(list, page, perPage = PER_PAGE) {
  const info = pageInfo(list.length, page, perPage)
  return { ...info, rows: list.slice(info.from - 1, info.to) }
}

// ---- A person's history on other cases (Admin case pages) ----

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`

// The `history` the admin API adds to each person, as short labels for the
// People card: [{ text: '2 disputes lost', tone: 'bad' }, ...]. 'bad' marks
// what suggests a deliberate false claim; everything else is 'plain'. An empty
// list means nothing on record.
export function historyLabels(history) {
  if (!history) return []
  const labels = []
  const bad = (text) => labels.push({ text, tone: 'bad' })
  const plain = (text) => labels.push({ text, tone: 'plain' })

  if (history.suspendedAt) bad('Suspended now')
  // Disputes on their claims: "1 of 2 disputes lost", or "2 disputes on claims, none lost"
  if (history.disputesLost > 0) {
    bad(`${history.disputesLost} of ${plural(history.disputesAgainst, 'dispute')} lost`)
  } else if (history.disputesAgainst > 0) {
    plain(`${plural(history.disputesAgainst, 'dispute')} on claims, none lost`)
  }
  if (history.claimsWithdrawn > 0) {
    bad(plural(history.claimsWithdrawn, 'claim withdrawn', 'claims withdrawn'))
  }
  if (history.warnings > 0) bad(plural(history.warnings, 'warning'))
  const pastSuspensions = history.suspensions - (history.suspendedAt ? 1 : 0)
  if (pastSuspensions > 0) bad(`Suspended ${plural(pastSuspensions, 'time')} before`)
  if (history.openReports > 0) bad(plural(history.openReports, 'open report'))
  if (history.actionedReports > 0) {
    plain(plural(history.actionedReports, 'report acted on', 'reports acted on'))
  }
  if (history.claimsDeclined > 0) {
    plain(plural(history.claimsDeclined, 'claim declined', 'claims declined'))
  }
  // Disputes they raised: "Raised 2 disputes, 1 went their way"
  if (history.disputesRaised > 0) {
    plain(
      `Raised ${plural(history.disputesRaised, 'dispute')}, ${history.disputesRaisedWon} went their way`,
    )
  }
  return labels
}

// ---- Comparing the found item with each lost report (Evidence step) ----

// Words that say nothing about an item
const STOPWORDS = new Set(
  'a an and the of in on at to for with my it its is was are this that from by or but has have had i me near left'.split(
    ' ',
  ),
)

export function keywords(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  )
}

const same = (a, b) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase())

// An item's colours, main colour first (up to 3). Older items only have the
// single `colour`.
export function colourList(item) {
  if (Array.isArray(item?.colours) && item.colours.length) return item.colours
  return item?.colour ? [item.colour] : []
}

// Which details of a lost report agree with the found item. `spots` is the
// GET /spots list, for buildings. place: 'spot' (the same spot on the trail),
// 'building' (the same building), or false.
export function compareWithFound(found, lost, spots = []) {
  if (!found || !lost) return null
  const spotOf = (id) => spots.find((spot) => spot.id === id)
  const foundSpotIds = (found.trail || []).map((point) => point.spotId)
  const foundBuildings = foundSpotIds.map((id) => spotOf(id)?.building).filter(Boolean)
  const lostSpotIds = (lost.trail || []).map((point) => point.spotId)
  let place = false
  if (lostSpotIds.some((id) => foundSpotIds.includes(id))) place = 'spot'
  else if (lostSpotIds.some((id) => foundBuildings.includes(spotOf(id)?.building))) {
    place = 'building'
  }
  const foundWords = keywords(`${found.title} ${found.description}`)
  const sharedWords = [...keywords(`${lost.title} ${lost.description}`)].filter((word) =>
    foundWords.has(word),
  )
  return {
    category: same(found.category, lost.category),
    // Any colour of one item that the other item has too
    colour: colourList(found).some((a) => colourList(lost).some((b) => same(a, b))),
    brand: same(found.brand, lost.brand),
    place,
    sharedWords,
  }
}

// How many of the four details (category, colour, brand, place) a lost report
// shares with the found item, or null without a report
export function detailsInCommon(found, lost, spots = []) {
  const match = compareWithFound(found, lost, spots)
  if (!match) return null
  return [match.category, match.colour, match.brand, match.place].filter(Boolean).length
}

// How long before or after the claim a lost report was filed:
// { before: true, text: '10 h before' } or { before: false, text: '2 days after' }
export function timingWords(filedAt, claimedAt) {
  const minutes = Math.round((new Date(claimedAt) - new Date(filedAt)) / 60000)
  const size = Math.abs(minutes)
  let text
  if (size < 60) text = `${size} min`
  else if (size < 48 * 60) text = `${Math.round(size / 60)} h`
  else text = plural(Math.round(size / (24 * 60)), 'day')
  return { before: minutes >= 0, text: `${text} ${minutes >= 0 ? 'before' : 'after'}` }
}

// ---- Queue tools on the Admin page ----

// Does a row match what the admin typed? Every word must match something:
// a name or title (any part of it), an item number ("No. 117", "117"), or a
// case code ("D-0141", "d141", "R-3"). `target` is { text: [...], itemId,
// disputeId, reportId }.
export function matchesQuery(query, target) {
  const words = (query || '')
    .toLowerCase()
    .replace(/no\.\s*/g, 'no.')
    .trim()
    .split(/\s+/)
  if (!words[0]) return true
  const text = (target.text || []).filter(Boolean).join(' ').toLowerCase()
  return words.every((word) => {
    const code = word.match(/^([dr])-?0*(\d+)$/)
    if (code) {
      const id = code[1] === 'd' ? target.disputeId : target.reportId
      return id !== undefined && Number(code[2]) === Number(id)
    }
    const number = word.match(/^(?:no\.|#)?0*(\d+)$/)
    if (number && target.itemId !== undefined && Number(number[1]) === Number(target.itemId)) {
      return true
    }
    return text.includes(word.replace(/^(no\.|#)/, ''))
  })
}

// "Needs attention" labels for a dispute in the queue:
// - the claimer has not answered an open dispute within 48 hours
// - the item had already been returned when it was disputed
// - an upheld dispute's return-by date passed before the item came back
export function disputeFlags(dispute, now = new Date()) {
  const flags = []
  const age = now - new Date(dispute.createdAt)
  if (dispute.status === 'open') {
    if (!dispute.respondedAt && age >= 48 * HOUR_MS) flags.push('No reply in 48 h')
    if (dispute.itemWasReturned) flags.push('Returned item reopened')
  }
  if (
    dispute.status === 'upheld' &&
    dispute.returnBy &&
    new Date(dispute.returnBy) < now &&
    !dispute.returnDone
  ) {
    flags.push('Return-by passed')
  }
  return flags
}

// Decisions over the last `days` days: how long they took on average (hours,
// or null with none), and how they went
export function decisionStats(disputes, now = new Date(), days = 30) {
  const since = now - days * DAY_MS
  const decided = disputes.filter(
    (dispute) => dispute.decidedAt && new Date(dispute.decidedAt) >= since,
  )
  const byAdmin = decided.filter((dispute) => ['upheld', 'closed'].includes(dispute.status))
  // Never below 0, even if two clocks disagree by a moment
  const hours = byAdmin.map((dispute) =>
    Math.max(0, (new Date(dispute.decidedAt) - new Date(dispute.createdAt)) / HOUR_MS),
  )
  return {
    averageHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    upheld: decided.filter((dispute) => dispute.status === 'upheld').length,
    kept: decided.filter((dispute) => dispute.status === 'closed').length,
    withdrawn: decided.filter((dispute) => dispute.status === 'withdrawn').length,
  }
}

// 0.4 -> '24 min', 5.2 -> '5 h', 30 -> '1.3 d'; null -> '–'
export function hoursWords(hours) {
  if (hours === null || hours === undefined) return '–'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 24) return `${Math.round(hours)} h`
  return `${Math.round((hours / 24) * 10) / 10} d`
}

// R-0003, the way the Admin page names a report
export function reportCode(id) {
  return `R-${String(id).padStart(4, '0')}`
}

// "A-0003", for an appeal against a suspension
export function appealCode(id) {
  return `A-${String(id).padStart(4, '0')}`
}

// What each action on a reported message or post does, for the confirm step
// on the report page. `needsReason` is false only for dismissing.
export function reportActionWords(action, { name = 'this person', thing = 'post' } = {}) {
  const words = {
    dismiss: {
      button: 'Dismiss the report',
      confirm: 'Yes, dismiss it',
      happens: `Nothing happens to ${name}. The report closes as unfounded.`,
      needsReason: false,
    },
    warn: {
      button: `Warn ${name.split(' ')[0]}`,
      confirm: `Yes, warn ${name.split(' ')[0]}`,
      happens: `A warning is logged against ${name}. Their account keeps working.`,
      needsReason: true,
    },
    remove: {
      button: `Remove the ${thing}`,
      confirm: `Yes, remove the ${thing}`,
      happens:
        thing === 'message'
          ? `The message text is hidden in the chat for both people.`
          : 'The post comes down from the feed and stops being matched.',
      needsReason: true,
    },
    suspend: {
      button: 'Suspend the account',
      confirm: `Yes, suspend ${name}`,
      happens: `${name} can no longer post, claim, chat, report or dispute until an admin lifts it.`,
      needsReason: true,
    },
    unsuspend: {
      button: 'Lift the suspension',
      confirm: 'Yes, lift it',
      happens: `${name} can use FoundIt again.`,
      needsReason: true,
    },
  }
  return words[action]
}

// What each entry in the admin action log means, in words
export const ACTION_LABELS = {
  uphold_dispute: 'Returned an item after a dispute',
  close_dispute: 'Kept a claim',
  dismiss_report: 'Dismissed a report',
  warn_user: 'Warned a user',
  remove_message: 'Removed a chat message',
  remove_item: 'Removed a post',
  suspend_user: 'Suspended a user',
  unsuspend_user: 'Lifted a suspension',
  decline_appeal: 'Kept a suspension after an appeal',
}

// ---- Verdicts: decided disputes on the My disputes page ----

// The chip on each row of My disputes, in words and colour (handoff.css tones)
export const VERDICT_CHIPS = {
  raiser: {
    open: { label: 'Waiting for an admin', tone: 'grey' },
    upheld: { label: 'The item is yours', tone: 'green' },
    withdrawn: { label: 'The item is yours', tone: 'green' },
    closed: { label: 'Claim kept', tone: 'red' },
  },
  claimer: {
    open: { label: 'Waiting for an admin', tone: 'grey' },
    upheld: { label: 'Went to the other person', tone: 'red' },
    withdrawn: { label: 'You withdrew', tone: 'grey' },
    closed: { label: 'Your claim was kept', tone: 'green' },
  },
}

// The verdicts someone should hear about, newest first: every dispute they
// raised that is no longer open, and every admin decision on their own claims
// (not their own withdrawal, which they already know about).
//   raised      GET /disputes/mine     onMyClaims  GET /disputes/on-my-claims
export function verdictsOf(raised, onMyClaims) {
  const asRaiser = raised.filter((dispute) => dispute.status !== 'open')
  const asClaimer = onMyClaims.filter((dispute) => !['open', 'withdrawn'].includes(dispute.status))
  return [...asRaiser, ...asClaimer].sort((a, b) =>
    (b.decidedAt || '').localeCompare(a.decidedAt || ''),
  )
}

// Which verdicts this person has opened, and which have already popped up, as
// { read: [disputeId], announced: [disputeId] }. Kept in this browser only
// (localStorage), one entry per account so a shared laptop keeps them apart.
// Storage can be blocked in a private window; then nothing is remembered.
const VERDICTS_KEY = 'foundit-verdicts'

export function readVerdictMarks(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${VERDICTS_KEY}-${userId}`) || '{}') || {}
    return { read: saved.read || [], announced: saved.announced || [] }
  } catch {
    return { read: [], announced: [] }
  }
}

export function writeVerdictMarks(userId, marks) {
  try {
    localStorage.setItem(`${VERDICTS_KEY}-${userId}`, JSON.stringify(marks))
  } catch {
    // Not remembered; at worst a verdict shows as new again after a refresh
  }
}
