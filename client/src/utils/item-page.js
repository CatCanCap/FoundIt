// Rules and words for the item page (WS5, Figma section 08: V13, V13a, V13c
// and V13d), the page a feed card opens. No Vue and no API here, so they are
// easy to unit test.
//
// The page reads GET /api/items/:id/record: { item, state, disputeOpen, timeline }.
// state is open, matched, claimed, returned, disputed, resolved or archived.
import { formatWhen } from './safeguards'
import { DAY_MS, HOUR_MS } from './time'

export const DISPUTE_WINDOW_DAYS = 7

// The latest time an event happened on the timeline, or null
export function eventAt(timeline, event) {
  const found = (timeline || []).filter((entry) => entry.event === event)
  return found.length > 0 ? found[found.length - 1].at : null
}

// Where the item is up to, for the box under its facts:
//   waiting     nobody has claimed it (V13a "Is this yours?")
//   matched     claimed, the handoff is under way (V13 "Matched with someone")
//   handedOver  the finder handed it over; the owner has not confirmed (V13c)
//   returned    back with its owner (V13d, with the 7-day dispute window)
//   disputed    paused while an admin decides
//   closed      archived, or a lost report that was resolved or matched
export function itemStage(record) {
  if (!record) return 'closed'
  const { item, state, timeline } = record
  if (state === 'disputed') return 'disputed'
  if (state === 'returned') return 'returned'
  if (state === 'claimed') {
    const claimedAt = eventAt(timeline, 'claimed')
    const handedAt = eventAt(timeline, 'handed_over')
    return handedAt && (!claimedAt || handedAt >= claimedAt) ? 'handedOver' : 'matched'
  }
  if (item.type === 'found' && (state === 'open' || state === 'matched')) return 'waiting'
  if (item.type === 'lost' && state === 'open') return 'waiting'
  return 'closed'
}

// The four dots (Figma V13): Posted, Matched, Handoff pending, Resolved
export function recordTrack(record) {
  const stage = itemStage(record)
  const timeline = record?.timeline || []
  const posted = eventAt(timeline, 'reported') || record?.item?.createdAt || null
  const claimed = eventAt(timeline, 'claimed')
  const handed = eventAt(timeline, 'handed_over')
  const returned = eventAt(timeline, 'returned')
  const after = (stages) => stages.includes(stage)

  const steps = [
    { label: 'Posted', at: posted, state: 'done' },
    {
      label: 'Matched',
      at: claimed,
      state: after(['matched', 'handedOver', 'returned', 'disputed']) ? 'done' : 'todo',
    },
    {
      label: 'Handoff pending',
      // The owner can confirm without the finder marking it handed over first
      at: handed || returned,
      state: after(['handedOver', 'returned'])
        ? 'done'
        : after(['matched', 'disputed'])
          ? 'current'
          : 'todo',
    },
    { label: 'Resolved', at: returned, state: stage === 'returned' ? 'done' : 'todo' },
  ]
  return steps.map((step) => ({
    ...step,
    when:
      step.state === 'todo'
        ? 'Not yet'
        : step.state === 'current'
          ? 'In progress'
          : formatWhen(step.at) || 'Done',
  }))
}

// The latest dispute decision on the item, for the people in it (the server
// leaves disputes out of the timeline for everyone else):
//   { event: 'dispute_upheld' | 'dispute_closed' | 'claim_withdrawn', at } or null
// The words for each decision are kept here, in this file, so the item page
// does not depend on another workstream's word list (one that changed on dev
// once already and left the page unable to load)
export const DECISION_WORDS = {
  dispute_upheld: 'An admin gave it to the person who disputed the claim',
  dispute_closed: 'An admin kept the claim',
  claim_withdrawn: 'The claim was withdrawn',
}
const DECISIONS = Object.keys(DECISION_WORDS)
export function lastDecision(timeline) {
  const decided = (timeline || []).filter((entry) => DECISIONS.includes(entry.event))
  return decided.length > 0 ? decided[decided.length - 1] : null
}

// "An admin gave it to the person who disputed the claim"
export function decisionWords(decision) {
  return decision ? DECISION_WORDS[decision.event] || 'The dispute was decided' : ''
}

// The 7 days after it was returned in which someone can still dispute it:
// { open, closesAt, left: '6d 23h left' }
export function disputeWindow(returnedAt, now = new Date()) {
  if (!returnedAt) return { open: false, closesAt: null, left: '' }
  const closes = new Date(Date.parse(returnedAt) + DISPUTE_WINDOW_DAYS * DAY_MS)
  const ms = closes - now
  if (ms <= 0) return { open: false, closesAt: closes.toISOString(), left: 'Closed' }
  const days = Math.floor(ms / DAY_MS)
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS)
  return { open: true, closesAt: closes.toISOString(), left: `${days}d ${hours}h left` }
}

// "Earbuds, white"
export function categoryLine(item) {
  const colour = item?.colour ? item.colour.toLowerCase() : ''
  return [item?.category, colour].filter(Boolean).join(', ')
}

// The logged-in person's own way into this item, if they have one:
//   { kind: 'chat', to }    they are the finder or the claimer of a claim that stands
//   { kind: 'claim', to }   one of their lost reports matched this find
//   null                    neither
// claims:  GET /api/claims/mine     reports: GET /api/matches/mine (.reports)
export function myLink(itemId, { claims = [], reports = [] } = {}) {
  const id = Number(itemId)
  // Only a claim that stands: a declined or moved claim's chat is closed, and
  // linking to it would also hide "This is my item" from that person
  const claim = claims.find(
    (row) => Number(row.foundItem?.id) === id && (!row.claimStatus || row.claimStatus === 'active'),
  )
  if (claim) return { kind: 'chat', to: `/matches/${claim.matchId}/handoff` }
  for (const report of reports) {
    const match = report.matches.find(
      (entry) => Number(entry.item?.id) === id && entry.status === 'suggested',
    )
    if (match) return { kind: 'claim', to: `/matches/${match.id}/claim` }
  }
  return null
}
