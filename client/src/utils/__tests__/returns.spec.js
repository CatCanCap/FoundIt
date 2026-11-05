import { describe, it, expect } from 'vitest'
import {
  declinedNote,
  filterCounts,
  foundItemStatus,
  groupByItem,
  inFilter,
  pickFilter,
  pickTab,
  rowBucket,
  whyLink,
} from '../returns'

const phone = { id: 95, title: 'red iphone' }
const bottle = { id: 94, title: 'Blue Iphone 17' }
const row = (matchId, fields = {}) => ({
  matchId,
  role: 'finder',
  claimStatus: 'active',
  matchStatus: 'claimed',
  claimedAt: `2026-10-23T1${matchId % 10}:00:00Z`,
  handoff: null,
  foundItem: phone,
  lastMessage: null,
  ...fields,
})

// As in the screenshot: red iphone claimed three times, two declined
const rows = [
  row(3, { claimedAt: '2026-10-23T14:57:00Z' }),
  row(2, { claimStatus: 'declined', matchStatus: 'rejected', claimedAt: '2026-10-23T14:32:00Z' }),
  row(1, { claimStatus: 'declined', matchStatus: 'rejected', claimedAt: '2026-10-23T14:19:00Z' }),
  row(4, {
    foundItem: bottle,
    handoff: { status: 'pending' },
    claimedAt: '2026-10-23T13:44:00Z',
  }),
]

describe('rowBucket', () => {
  it('sorts each claim into open, declined, closed or resolved', () => {
    expect(rowBucket(rows[0])).toBe('open')
    expect(rowBucket(rows[1])).toBe('declined')
    expect(rowBucket(row(5, { claimStatus: 'overturned' }))).toBe('closed')
    expect(rowBucket(row(6, { matchStatus: 'confirmed' }))).toBe('resolved')
  })
})

describe('groupByItem', () => {
  it('shows an item claimed three times once, with the declined claims folded under it', () => {
    const groups = groupByItem(rows)
    expect(groups).toHaveLength(2)
    const iphone = groups.find((group) => group.item.id === 95)
    expect(iphone.main.matchId).toBe(3)
    expect(iphone.declined.map((entry) => entry.matchId)).toEqual([2, 1])
    expect(iphone.closed).toEqual([])
  })

  it('puts the chat with the newest message first, like a messaging app', () => {
    // No messages yet: the newer claim (red iphone, 14:57) comes first
    expect(groupByItem(rows).map((group) => group.item.id)).toEqual([95, 94])
    // A new message in the Blue Iphone 17 chat moves it to the top
    const messaged = [
      ...rows.slice(0, 3),
      { ...rows[3], lastMessage: { sentAt: '2026-10-23T16:00:00Z', fromMe: false } },
    ]
    expect(groupByItem(messaged).map((group) => group.item.id)).toEqual([94, 95])
    // Even when it is not your turn there (the owner waits for the finder)
    const waiting = [
      row(7, { role: 'owner', foundItem: bottle, claimedAt: '2026-10-24T09:00:00Z' }),
      rows[0],
    ]
    expect(groupByItem(waiting).map((group) => group.item.id)).toEqual([94, 95])
  })

  it('keeps an item with only declined claims, with no main row', () => {
    const [group] = groupByItem([rows[1]])
    expect(group.main).toBeNull()
    expect(group.declined).toHaveLength(1)
  })
})

describe('filters', () => {
  it('counts what each filter shows, with Open as the live claims', () => {
    const groups = groupByItem([
      ...rows,
      row(8, { foundItem: { id: 70 }, matchStatus: 'confirmed' }),
    ])
    expect(filterCounts(groups)).toEqual({ open: 2, declined: 1, closed: 0, resolved: 1, all: 3 })
    expect(inFilter(groups[0], 'all')).toBe(true)
  })

  it('reads the filter and tab from the address bar, defaulting to Open and claims', () => {
    expect(pickFilter('declined')).toBe('declined')
    expect(pickFilter('nonsense')).toBe('open')
    expect(pickFilter(undefined)).toBe('open')
    expect(pickTab('found')).toBe('found')
    expect(pickTab('other')).toBe('claims')
  })
})

describe('Things you found', () => {
  it('links a claimed find to its chat, and says whose turn it is', () => {
    expect(foundItemStatus(phone, rows)).toEqual({
      label: 'Check the claim',
      tone: 'brass',
      to: '/matches/3/handoff',
      action: 'Open chat',
    })
    expect(foundItemStatus(bottle, rows)).toMatchObject({ label: 'Hand it over', tone: 'brass' })
  })

  it('describes a find with no claim by its status', () => {
    const item = (status) => ({ id: 50, status })
    expect(foundItemStatus(item('open'))).toEqual({
      label: 'Waiting for its owner',
      tone: 'grey',
      to: '/items/50/record',
      action: 'View',
    })
    expect(foundItemStatus(item('resolved')).label).toBe('Back with its owner')
    expect(foundItemStatus(item('archived')).label).toBe('Closed after 30 days')
    expect(foundItemStatus(item('matched')).label).toBe('Claimed')
  })

  it('notes how many claims on a find were declined', () => {
    expect(declinedNote(phone, rows)).toBe('2 claims declined')
    expect(declinedNote(bottle, rows)).toBe('')
    expect(declinedNote(phone, [rows[1]])).toBe('1 claim declined')
  })
})

describe('whyLink', () => {
  it('sends a claim closed by a dispute to the dispute, and a declined one to its chat', () => {
    const closedRow = (role) => row(9, { role, claimStatus: 'overturned', foundItem: { id: 40 } })
    expect(whyLink(closedRow('owner'))).toBe('/disputes')
    expect(whyLink(closedRow('finder'))).toBe('/items/40/record')
    expect(whyLink(row(9, { role: 'owner', claimStatus: 'withdrawn' }))).toBe('/disputes')
    expect(whyLink(rows[1])).toBe('/matches/2/handoff')
  })
})
