// Rules and words for the Returns page (WS5, /returns): the "Claims and chats"
// tab (your handoffs, grouped and filtered) and the "Things you found" tab.
// No Vue and no API here, so they are easy to unit test.
//
// The rows come from GET /api/claims/mine (one per match, its newest claim);
// the found items from GET /api/items?type=found&postedBy=<you>.
import { isYourTurn, rowState, waitingFor } from './handoff'

// The filter chips on "Claims and chats", Open first because it is the default
export const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'declined', label: 'Declined' },
  { key: 'closed', label: 'Closed' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
]

export const TABS = [
  { key: 'claims', label: 'Claims and chats' },
  { key: 'found', label: 'Things you found' },
]

// Which filter a row belongs to:
//   open      the claim stands and the item is not back yet (it needs someone)
//   resolved  the item is back with its owner
//   declined  the finder declined the claim
//   closed    withdrawn, or an admin gave the item to someone else
export function rowBucket(row) {
  const state = rowState(row)
  return ['declined', 'closed', 'resolved'].includes(state) ? state : 'open'
}

// When a row last had news: its newest chat message, or the claim itself
function lastActivity(row) {
  const claimed = row.claimedAt || ''
  const messaged = row.lastMessage?.sentAt || ''
  return messaged > claimed ? messaged : claimed
}

// One group per found item, so an item claimed three times shows once: its
// live (or resolved) claim as the main row, and the declined or closed ones
// folded under it ("Declined (2)").
//   [{ key, item, main, declined: [rows], closed: [rows], latest }]
// Newest first, like a messaging app: the chat with the latest message (or
// the latest claim, before anyone has written) is at the top.
export function groupByItem(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = row.foundItem?.id ?? `match-${row.matchId}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        item: row.foundItem || null,
        main: null,
        declined: [],
        closed: [],
        latest: '',
      })
    }
    const group = groups.get(key)
    const bucket = rowBucket(row)
    if (bucket === 'declined') group.declined.push(row)
    else if (bucket === 'closed') group.closed.push(row)
    else if (!group.main || (bucket === 'open' && rowBucket(group.main) !== 'open')) {
      // An open claim outranks a resolved one; the one it replaces is kept below
      if (group.main) group.closed.push(group.main)
      group.main = row
    } else {
      group.closed.push(row)
    }
    const active = lastActivity(row)
    if (active > group.latest) group.latest = active
  }
  return [...groups.values()].sort((a, b) => b.latest.localeCompare(a.latest))
}

// Whether a group shows under a filter
export function inFilter(group, filter) {
  if (filter === 'all') return true
  if (filter === 'declined') return group.declined.length > 0
  if (filter === 'closed') return group.closed.length > 0
  return Boolean(group.main) && rowBucket(group.main) === filter
}

// How many groups each filter chip shows: { open: 1, declined: 1, ... }
export function filterCounts(groups) {
  return Object.fromEntries(
    FILTERS.map(({ key }) => [key, groups.filter((group) => inFilter(group, key)).length]),
  )
}

// A filter from the address bar (?show=declined), or Open
export function pickFilter(value) {
  return FILTERS.some((filter) => filter.key === value) ? value : 'open'
}

// A tab from the address bar (?tab=found), or Claims and chats
export function pickTab(value) {
  return TABS.some((tab) => tab.key === value) ? value : 'claims'
}

// What an item you found is up to, for "Things you found":
//   { label, tone, to, action }
// tone is brass (needs you), navy (under way), green (done) or grey.
// rows are your handoff rows, to link to the chat when a claim stands.
export function foundItemStatus(item, rows = []) {
  const live = rows.find(
    (row) => row.foundItem?.id === item.id && rowBucket(row) === 'open' && row.role === 'finder',
  )
  if (live) {
    return {
      label: waitingFor(live),
      tone: isYourTurn(live) ? 'brass' : 'navy',
      to: `/matches/${live.matchId}/handoff`,
      action: 'Open chat',
    }
  }
  const record = `/items/${item.id}/record`
  if (item.status === 'resolved') {
    return { label: 'Back with its owner', tone: 'green', to: record, action: 'View' }
  }
  if (item.status === 'archived') {
    return { label: 'Closed after 30 days', tone: 'grey', to: record, action: 'View' }
  }
  if (item.status === 'matched') {
    return { label: 'Claimed', tone: 'navy', to: record, action: 'View' }
  }
  return { label: 'Waiting for its owner', tone: 'grey', to: record, action: 'View' }
}

// Where "See why" goes for a claim that didn't go through: a declined claim's
// closed chat shows the finder's reason; a claim closed by a dispute goes to
// the dispute: My disputes for the person who claimed, the item page (with its
// dispute timeline) for the finder
export function whyLink(row) {
  if (row.claimStatus === 'overturned' || row.claimStatus === 'withdrawn') {
    if (row.role === 'owner') return '/disputes'
    if (row.foundItem?.id) return `/items/${row.foundItem.id}/record`
  }
  return `/matches/${row.matchId}/handoff`
}

// "2 claims declined" under a found item, or ''
export function declinedNote(item, rows = []) {
  const count = rows.filter(
    (row) => row.foundItem?.id === item.id && row.claimStatus === 'declined',
  ).length
  if (count === 0) return ''
  return count === 1 ? '1 claim declined' : `${count} claims declined`
}
