// Words and small rules for the claim and handoff pages (WS5, Figma section 07
// "Handoff and chat" and section 08 "Item record and return"). No Vue and no
// API here, so they are easy to unit test.
//
// The pages read GET /api/claims/:matchId, which answers with an "overview":
//   { role: 'owner' | 'finder', match, claim, foundItem, lostItem, handoff, disputeOpen }
import { formatWhen } from './safeguards'
import { DAY_MS, SINGAPORE } from './time'

// Where a handoff is up to, from the overview:
//   unclaimed   no claim yet (the owner can claim it)
//   checking    claimed; the finder checks the detail (Figma V12.1, V12.2)
//   pending     the finder accepted and planned the handoff (V12.3, V12.4)
//   handedOver  the finder handed it over or dropped it off (V12.5)
//   resolved    the owner confirmed, or the daily job did (V12.6)
//   closed      the claim was declined, or moved to someone else after a dispute
export function handoffStage(overview) {
  if (!overview) return 'unclaimed'
  const { match, claim, handoff } = overview
  // Checked first: an item can be returned and then disputed (up to 7 days
  // later), and if an admin gives it to someone else this claim is closed,
  // even though its handoff once completed
  if (match.status === 'rejected' || overview.closed) return 'closed'
  if (match.status === 'confirmed' || handoff?.status === 'completed') return 'resolved'
  if (!claim) return 'unclaimed'
  if (!handoff) return 'checking'
  return handoff.status === 'handed_over' ? 'handedOver' : 'pending'
}

// The chip at the top right of the handoff page
export function stageChip(stage, disputeOpen = false) {
  if (disputeOpen && stage !== 'resolved') return { label: 'Paused', tone: 'red' }
  if (stage === 'resolved') return { label: 'Resolved', tone: 'green' }
  if (stage === 'pending' || stage === 'handedOver')
    return { label: 'Handoff pending', tone: 'brass' }
  if (stage === 'closed') return { label: 'Closed', tone: 'grey' }
  return { label: 'Matched', tone: 'brass' }
}

// Nobody learns who claimed an item except the claimer and admins (Claim.toPublic
// on the server),
// so the two people are named by their part in the handoff, not by name
export function partnerName(role) {
  return role === 'owner' ? 'The finder' : 'The owner'
}

export function partnerInitials(role) {
  return role === 'owner' ? 'F' : 'O'
}

// "Found your Navy Hydro Flask" / "Claimed the Navy Hydro Flask", with the item's
// own name, or plain "item" when there is none
export function partnerLine(role, title = '') {
  const thing = title || 'item'
  return role === 'owner' ? `Found your ${thing}` : `Claimed the ${thing}`
}

// The grey note at the top of the chat, with the item's name
export function chatIntro(role, title = '') {
  const thing = title || 'this item'
  return role === 'owner'
    ? `You claimed the ${thing}. Claims are logged to your SMU account.`
    : `The owner claimed the ${thing}. Check their detail against it.`
}

// Whether a claim ended through a dispute: an admin gave the item to the
// person who disputed it, or the claimer withdrew
export function closedByDispute(closed) {
  return closed?.status === 'overturned' || closed?.status === 'withdrawn'
}

// The decided dispute about this item, from GET /api/disputes/on-my-claims
// (the claimer's view: status, decisionReason, returnBy), newest first, or null
export function disputeForItem(disputes, itemId) {
  const decided = (disputes || []).filter(
    (dispute) => Number(dispute.itemId) === Number(itemId) && dispute.status !== 'open',
  )
  decided.sort((a, b) => (b.decidedAt || '').localeCompare(a.decidedAt || ''))
  return decided[0] || null
}

// Why the chat closed, in words for each person. closed comes from the
// overview: { status: 'declined' | 'withdrawn' | 'overturned', reason }
export function closedText(closed, role) {
  if (!closed) return { title: 'This chat has closed', body: '' }
  if (closed.status === 'declined') {
    return role === 'owner'
      ? {
          title: 'The finder declined your claim',
          body: 'Your lost report is open again, so new finds can still match it.',
        }
      : {
          title: 'You declined this claim',
          body: 'The item is back on the feed. Keep it safe until its owner claims it.',
        }
  }
  if (closed.status === 'withdrawn') {
    return role === 'owner'
      ? { title: 'You withdrew your claim', body: 'The item went to the person who disputed it.' }
      : { title: 'The claim was withdrawn', body: 'The item now goes to someone else.' }
  }
  return {
    title: 'An admin closed this claim',
    body:
      role === 'owner'
        ? 'An admin decided the item belongs to someone else. My disputes has the full decision.'
        : 'An admin decided the item belongs to someone else. The item page shows what happened.',
  }
}

// Whether the owner can still claim this match: nobody has claimed it, the
// match is still a suggestion, and both items are still open and listed
export function canClaim(overview) {
  if (!overview || overview.role !== 'owner' || overview.claim || overview.closed) return false
  const { match, foundItem, lostItem } = overview
  if (match?.status !== 'suggested') return false
  if (foundItem?.status !== 'open' || foundItem?.hiddenAt) return false
  return !lostItem || lostItem.status === 'open'
}

// Why the claim page has no form, in words: { title, body }
export function unavailableText(overview) {
  if (overview?.closed) return closedText(overview.closed, 'owner')
  const { foundItem, lostItem } = overview || {}
  if (foundItem?.status === 'resolved') {
    return { title: 'Already back with its owner', body: 'This find has been returned.' }
  }
  if (foundItem?.status === 'matched') {
    return {
      title: 'Someone else has claimed this',
      body: 'Another student claimed this find first. If you think it is yours, the item page lets you dispute it.',
    }
  }
  if (lostItem && lostItem.status !== 'open') {
    return {
      title: 'Your lost report is closed',
      body: 'Claims are made from an open lost report.',
    }
  }
  return {
    title: 'No longer available',
    body: 'This find was taken off the feed, or the match was dismissed.',
  }
}

// The line under the title: "Claimed by you · 14 Oct, 09:12"
export function stageLine(overview) {
  const stage = handoffStage(overview)
  const owner = overview?.role === 'owner'
  const { claim, handoff } = overview || {}
  const handedOverWord = handoff?.method === 'drop-off' ? 'dropped it off' : 'handed it over'
  switch (stage) {
    case 'checking':
      return owner
        ? `Claimed by you · ${formatWhen(claim.createdAt)}`
        : `The owner claimed this · ${formatWhen(claim.createdAt)}`
    case 'pending':
      return owner
        ? `The finder accepted your claim · ${formatWhen(handoff.createdAt)}`
        : `You accepted the claim · ${formatWhen(handoff.createdAt)}`
    case 'handedOver':
      return owner
        ? `The finder ${handedOverWord} · ${formatWhen(handoff.handedOverAt)}`
        : `You ${handedOverWord} · ${formatWhen(handoff.handedOverAt)}`
    case 'resolved':
      return handoff?.completedAt ? `Resolved · ${formatWhen(handoff.completedAt)}` : 'Resolved'
    case 'closed':
      return 'This claim was closed'
    default:
      return owner ? 'Not claimed yet' : 'Waiting for the owner to claim it'
  }
}

// The four dots under an item (Figma V13): Posted, Matched, Handoff pending, Resolved
export function returnTrack(overview) {
  const stage = handoffStage(overview)
  const { foundItem, claim, handoff } = overview || {}
  const claimed = Boolean(claim) || ['pending', 'handedOver', 'resolved'].includes(stage)
  const resolvedAt = handoff?.completedAt || null
  return [
    { label: 'Posted', at: foundItem?.createdAt || null, state: 'done' },
    {
      label: 'Matched',
      at: claim?.createdAt || null,
      state: claimed ? 'done' : 'todo',
    },
    {
      label: 'Handoff pending',
      at: handoff?.handedOverAt || handoff?.createdAt || null,
      state:
        stage === 'resolved' || stage === 'handedOver'
          ? 'done'
          : stage === 'pending' || stage === 'checking'
            ? 'current'
            : 'todo',
    },
    { label: 'Resolved', at: resolvedAt, state: stage === 'resolved' ? 'done' : 'todo' },
  ].map((step) => ({
    ...step,
    when: step.at ? formatWhen(step.at) : step.state === 'current' ? 'In progress' : 'Not yet',
  }))
}

// Seven days after the finder hands it over, the daily job completes it
export const AUTO_RESOLVE_DAYS = 7

// "21 Oct" for "it resolves itself on 21 Oct (in 7 days)", or '' before handover
export function autoResolveDate(handoff) {
  if (!handoff?.handedOverAt) return ''
  const date = new Date(Date.parse(handoff.handedOverAt) + AUTO_RESOLVE_DAYS * DAY_MS)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SINGAPORE,
    day: 'numeric',
    month: 'short',
  }).format(date)
}

// "Drop-off" or "Meet-up"
export function methodLabel(method) {
  return method === 'drop-off' ? 'Drop-off' : 'Meet-up'
}

// A spot's place on the map as [lng, lat] (the order Mapbox uses), or null
export function lngLat(spot) {
  const lat = spot?.coordinates?.lat ?? spot?.lat
  const lng = spot?.coordinates?.lng ?? spot?.lng
  if (lat === undefined || lng === undefined || lat === null || lng === null) return null
  return [Number(lng), Number(lat)]
}

// Metres between two [lng, lat] points on campus (close enough for short walks)
export function metresApart(a, b) {
  const toRad = Math.PI / 180
  const lat = ((a[1] + b[1]) / 2) * toRad
  const dx = (b[0] - a[0]) * toRad * Math.cos(lat)
  const dy = (b[1] - a[1]) * toRad
  return Math.sqrt(dx * dx + dy * dy) * 6371000
}

// The Mapbox Directions request for a walk from one [lng, lat] to another
// (the same VITE_MAPBOX_TOKEN as the campus map)
export function directionsUrl(from, to, token) {
  const path = `${from[0]},${from[1]};${to[0]},${to[1]}`
  const query = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    access_token: token,
  })
  return `https://api.mapbox.com/directions/v5/mapbox/walking/${path}?${query}`
}

// "6 min walk · 450 m", from a Directions route ({ duration } in seconds,
// { distance } in metres)
export function routeSummary(route) {
  if (!route) return ''
  const minutes = Math.max(1, Math.round(route.duration / 60))
  const metres = Math.round(route.distance)
  const distance = metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`
  return `${minutes} min walk · ${distance}`
}

// Walking directions to a campus spot in another map app, for when the
// Mapbox map cannot be shown (no token, or no WebGL). No map key needed.
export function walkingLink(spot) {
  const lat = spot?.coordinates?.lat ?? spot?.lat
  const lng = spot?.coordinates?.lng ?? spot?.lng
  if (lat === undefined || lng === undefined) return ''
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`
}

// Whether a chat message was sent by the person looking at it
export function isMine(message, userId) {
  return Boolean(userId) && message.senderId === userId
}

// "You · 09:24" or "The finder · 09:20"
export function messageMeta(message, userId, role) {
  const who = isMine(message, userId) ? 'You' : partnerName(role)
  return `${who} · ${clockTime(message.sentAt)}`
}

// Messages from one person in the same minute share one time line, under the
// last of them, instead of each repeating it:
//   [{ message, showMeta, grouped, day }]
//   showMeta  this message ends its group, so the time goes under it
//   grouped   the next message is from the same group (sit closer to it)
//   day       "Today", "Yesterday" or "Mon 14 Oct" on the first message of
//             each day, for the divider above it; '' on the others
export function groupMessages(messages, now = new Date()) {
  return messages.map((message, index) => {
    const next = messages[index + 1]
    const before = messages[index - 1]
    const sameGroup =
      Boolean(next) &&
      next.senderId === message.senderId &&
      dayKey(next.sentAt) === dayKey(message.sentAt) &&
      clockTime(next.sentAt) === clockTime(message.sentAt)
    const newDay = !before || dayKey(before.sentAt) !== dayKey(message.sentAt)
    return {
      message,
      showMeta: !sameGroup,
      grouped: sameGroup,
      day: newDay ? dayLabel(message.sentAt, now) : '',
    }
  })
}

// "2026-10-14", the day in Singapore, to compare two times
function dayKey(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: SINGAPORE }).format(new Date(iso))
}

// "Today", "Yesterday" or "Mon 14 Oct", in Singapore time
export function dayLabel(iso, now = new Date()) {
  if (!iso) return ''
  const day = dayKey(iso)
  if (day === dayKey(now.toISOString())) return 'Today'
  if (day === dayKey(new Date(now.getTime() - DAY_MS).toISOString())) return 'Yesterday'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SINGAPORE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(new Date(iso))
    .replace(',', '')
}

// 09:24 in Singapore time
export function clockTime(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SINGAPORE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

// New messages from a poll, added after the ones on screen without doubles.
// A message already on screen is swapped for the server's copy, so a change
// to it (an admin removing it) shows.
export function mergeMessages(current, incoming) {
  const byId = new Map(incoming.map((message) => [message.id, message]))
  const updated = current.map((message) => byId.get(message.id) || message)
  const seen = new Set(current.map((message) => message.id))
  return [...updated, ...incoming.filter((message) => !seen.has(message.id))]
}

// The sentAt of the newest message, to ask the API only for newer ones
export function lastSentAt(messages) {
  return messages.length > 0 ? messages[messages.length - 1].sentAt : undefined
}

// "3rd", "11th", "22nd"
export function ordinal(n) {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'
  return `${n}${suffix}`
}

// "1,285"
export function countText(n) {
  return new Intl.NumberFormat('en-SG').format(n)
}

// "1 day", "2 days"; "the same day" for 0
export function daysText(days) {
  if (days === 0) return 'the same day'
  return days === 1 ? '1 day' : `${days} days`
}

// Where a row from GET /api/claims/mine is up to, as a key. The badge and the
// filters compare these keys, never the words, so rewording a label is safe.
//   declined, closed, resolved
//   paused      a dispute is open, so it waits for an admin (nobody's turn)
//   check       the finder checks the claim       (your turn)
//   waitFinder  the owner waits for that check
//   handOver    the finder hands it over          (your turn)
//   planned     the owner waits for the handover
//   confirm     the owner confirms they have it   (your turn)
//   waitOwner   the finder waits for that
export function rowState(row) {
  if (row.claimStatus === 'declined') return 'declined'
  if (row.claimStatus && row.claimStatus !== 'active') return 'closed'
  if (row.matchStatus === 'confirmed' || row.handoff?.status === 'completed') return 'resolved'
  if (row.disputeOpen) return 'paused'
  if (!row.handoff) return row.role === 'finder' ? 'check' : 'waitFinder'
  if (row.handoff.status === 'handed_over') return row.role === 'owner' ? 'confirm' : 'waitOwner'
  return row.role === 'finder' ? 'handOver' : 'planned'
}

export const ROW_WORDS = {
  declined: 'Declined',
  closed: 'Closed',
  resolved: 'Resolved',
  paused: 'Paused for a dispute',
  check: 'Check the claim',
  waitFinder: 'Waiting for the finder',
  handOver: 'Hand it over',
  planned: 'Handoff planned',
  confirm: 'Confirm you have it',
  waitOwner: 'Waiting for the owner',
}

const YOUR_TURN = ['check', 'handOver', 'confirm']

// The words on a row of the Returns page: what it waits for
export function waitingFor(row) {
  return ROW_WORDS[rowState(row)]
}

// ---------------------------------------------------------------- badges
// Which chats are new to you. The last message you saw in each chat is kept in
// this browser only (localStorage), so another device starts fresh. Each
// person has their own entry, so on a shared computer the next person never
// gets the last one's marks. Storage can be blocked in a private window; then
// every chat just counts as seen.
const SEEN_KEY = 'foundit-chat-seen'

export function readSeen(userId) {
  if (userId === null || userId === undefined) return {}
  try {
    return JSON.parse(localStorage.getItem(`${SEEN_KEY}-${userId}`) || '{}') || {}
  } catch {
    return {}
  }
}

export function writeSeen(userId, seen) {
  if (userId === null || userId === undefined) return
  try {
    localStorage.setItem(`${SEEN_KEY}-${userId}`, JSON.stringify(seen))
  } catch {
    // Not remembered; the badge comes back after a refresh
  }
}

// Claims on your finds that this browser has already announced, so each new
// claim pops up once, even if it came in while you were away. null means this
// person has never checked in this browser before (then nothing old pops up).
const ANNOUNCED_KEY = 'foundit-claims-announced'

export function readAnnounced(userId) {
  if (userId === null || userId === undefined) return null
  try {
    const saved = localStorage.getItem(`${ANNOUNCED_KEY}-${userId}`)
    return saved === null ? null : new Set(JSON.parse(saved))
  } catch {
    return null
  }
}

export function writeAnnounced(userId, matchIds) {
  if (userId === null || userId === undefined) return
  try {
    localStorage.setItem(`${ANNOUNCED_KEY}-${userId}`, JSON.stringify([...matchIds]))
  } catch {
    // Not remembered; at worst a claim pops up again after a refresh
  }
}

// The chat messages you reported, so "Reported" stays after a reload. Kept in
// this browser only, per person; on another device the server's "already
// reported" answer shows it as reported instead.
const REPORTED_KEY = 'foundit-reported-messages'

export function readReported(userId) {
  if (userId === null || userId === undefined) return new Set()
  try {
    const ids = JSON.parse(localStorage.getItem(`${REPORTED_KEY}-${userId}`) || '[]')
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

export function writeReported(userId, ids) {
  if (userId === null || userId === undefined) return
  try {
    localStorage.setItem(`${REPORTED_KEY}-${userId}`, JSON.stringify([...ids]))
  } catch {
    // Not remembered; reporting it again still shows "Reported"
  }
}

// A claim on one of your finds that is waiting for you to check it
export function isFreshClaim(row) {
  return row.role === 'finder' && row.claimStatus === 'active' && !row.handoff
}

// A row from GET /api/claims/mine has a message you have not seen yet
export function hasNewMessage(row, seen = {}) {
  const last = row.lastMessage
  if (!last || last.fromMe) return false
  const seenAt = seen[row.matchId]
  return !seenAt || last.sentAt > seenAt
}

// It is your turn: check the claim, hand it over, or confirm you have it
export function isYourTurn(row) {
  return YOUR_TURN.includes(rowState(row))
}

// How many handoffs need you, for the header's Handoffs badge
export function attentionCount(rows, seen = {}) {
  return rows.filter((row) => isYourTurn(row) || hasNewMessage(row, seen)).length
}
