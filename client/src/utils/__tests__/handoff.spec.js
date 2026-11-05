import { describe, it, expect } from 'vitest'
import {
  ROW_WORDS,
  canClaim,
  dayLabel,
  rowState,
  unavailableText,
  closedByDispute,
  disputeForItem,
  attentionCount,
  hasNewMessage,
  isYourTurn,
  readSeen,
  readAnnounced,
  writeAnnounced,
  readReported,
  writeReported,
  writeSeen,
  autoResolveDate,
  countText,
  daysText,
  handoffStage,
  isMine,
  lastSentAt,
  mergeMessages,
  messageMeta,
  ordinal,
  partnerName,
  returnTrack,
  stageChip,
  stageLine,
  waitingFor,
  walkingLink,
  chatIntro,
  closedText,
  groupMessages,
  metresApart,
  partnerLine,
  lngLat,
  directionsUrl,
  routeSummary,
} from '../handoff'

const claim = { id: 5, detail: 'Cat sticker', createdAt: '2026-10-14T01:12:00Z' }
const pending = {
  id: 9,
  method: 'drop-off',
  status: 'pending',
  createdAt: '2026-10-14T01:31:00Z',
  handedOverAt: null,
  completedAt: null,
}
const handedOver = { ...pending, status: 'handed_over', handedOverAt: '2026-10-14T09:30:00Z' }
const completed = { ...handedOver, status: 'completed', completedAt: '2026-10-15T02:02:00Z' }

function overview(fields = {}) {
  return {
    role: 'owner',
    match: { id: 1, status: 'claimed' },
    claim,
    foundItem: { id: 2, createdAt: '2026-10-14T03:24:00Z' },
    handoff: null,
    disputeOpen: false,
    ...fields,
  }
}

describe('handoffStage', () => {
  it('follows the claim and the handoff', () => {
    expect(handoffStage(null)).toBe('unclaimed')
    expect(handoffStage(overview({ claim: null, match: { status: 'suggested' } }))).toBe(
      'unclaimed',
    )
    expect(handoffStage(overview())).toBe('checking')
    expect(handoffStage(overview({ handoff: pending }))).toBe('pending')
    expect(handoffStage(overview({ handoff: handedOver }))).toBe('handedOver')
    expect(handoffStage(overview({ handoff: completed, match: { status: 'confirmed' } }))).toBe(
      'resolved',
    )
    expect(handoffStage(overview({ claim: null, match: { status: 'rejected' } }))).toBe('closed')
  })
})

describe('stageChip', () => {
  it('names the stage as the design does, and shows a pause for a dispute', () => {
    expect(stageChip('checking').label).toBe('Matched')
    expect(stageChip('pending').label).toBe('Handoff pending')
    expect(stageChip('handedOver').label).toBe('Handoff pending')
    expect(stageChip('resolved')).toEqual({ label: 'Resolved', tone: 'green' })
    expect(stageChip('pending', true)).toEqual({ label: 'Paused', tone: 'red' })
    expect(stageChip('resolved', true).label).toBe('Resolved')
  })
})

describe('stageLine', () => {
  it('says what happened last, from each side, in Singapore time', () => {
    expect(stageLine(overview())).toBe('Claimed by you · 14 Oct, 09:12')
    expect(stageLine(overview({ role: 'finder' }))).toBe('The owner claimed this · 14 Oct, 09:12')
    expect(stageLine(overview({ handoff: pending }))).toBe(
      'The finder accepted your claim · 14 Oct, 09:31',
    )
    expect(stageLine(overview({ role: 'finder', handoff: handedOver }))).toBe(
      'You dropped it off · 14 Oct, 17:30',
    )
    expect(stageLine(overview({ handoff: { ...handedOver, method: 'meetup' } }))).toBe(
      'The finder handed it over · 14 Oct, 17:30',
    )
    expect(stageLine(overview({ handoff: completed }))).toBe('Resolved · 15 Oct, 10:02')
  })
})

describe('returnTrack', () => {
  it('gives the four dots under an item their times', () => {
    const steps = returnTrack(overview({ handoff: handedOver }))
    expect(steps.map((step) => step.label)).toEqual([
      'Posted',
      'Matched',
      'Handoff pending',
      'Resolved',
    ])
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'done', 'todo'])
    expect(steps[0].when).toBe('14 Oct, 11:24')
    expect(steps[2].when).toBe('14 Oct, 17:30')
    expect(steps[3].when).toBe('Not yet')
  })

  it('says "Not yet" before anyone claims it', () => {
    const steps = returnTrack(overview({ claim: null, match: { status: 'suggested' } }))
    expect(steps.map((step) => step.state)).toEqual(['done', 'todo', 'todo', 'todo'])
    expect(steps[1].when).toBe('Not yet')
  })
})

describe('autoResolveDate', () => {
  it('is 7 days after it was handed over, and empty before', () => {
    expect(autoResolveDate(pending)).toBe('')
    expect(autoResolveDate(handedOver)).toBe('21 Oct')
  })
})

describe('chat helpers', () => {
  const message = { id: 1, senderId: 7, sentAt: '2026-10-14T01:20:00Z', text: 'Hi' }

  it('tells my messages from the other person’s, without names', () => {
    expect(isMine(message, 7)).toBe(true)
    expect(isMine(message, 8)).toBe(false)
    expect(isMine(message, undefined)).toBe(false)
    expect(messageMeta(message, 7, 'owner')).toBe('You · 09:20')
    expect(messageMeta(message, 8, 'owner')).toBe('The finder · 09:20')
    expect(messageMeta(message, 8, 'finder')).toBe('The owner · 09:20')
    expect(partnerName('owner')).toBe('The finder')
  })

  it('adds polled messages without doubles, and finds the newest time', () => {
    const second = { ...message, id: 2, sentAt: '2026-10-14T01:24:00Z' }
    expect(mergeMessages([message], [message, second]).map((m) => m.id)).toEqual([1, 2])
    expect(lastSentAt([message, second])).toBe('2026-10-14T01:24:00Z')
    expect(lastSentAt([])).toBeUndefined()
  })
})

describe('walkingLink', () => {
  it('opens walking directions to a spot, and nothing without one', () => {
    expect(walkingLink({ coordinates: { lat: 1.2966, lng: 103.8499 } })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=1.2966,103.8499&travelmode=walking',
    )
    expect(walkingLink(null)).toBe('')
  })
})

describe('words for the resolved page', () => {
  it('writes ordinals, counts and days', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
    ])
    expect(countText(1285)).toBe('1,285')
    expect(daysText(0)).toBe('the same day')
    expect(daysText(1)).toBe('1 day')
    expect(daysText(2)).toBe('2 days')
  })
})

describe('waitingFor', () => {
  it('says whose turn it is on the handoffs list', () => {
    expect(waitingFor({ role: 'finder', matchStatus: 'claimed', handoff: null })).toBe(
      'Check the claim',
    )
    expect(waitingFor({ role: 'owner', matchStatus: 'claimed', handoff: null })).toBe(
      'Waiting for the finder',
    )
    expect(waitingFor({ role: 'finder', matchStatus: 'claimed', handoff: pending })).toBe(
      'Hand it over',
    )
    expect(waitingFor({ role: 'owner', matchStatus: 'claimed', handoff: handedOver })).toBe(
      'Confirm you have it',
    )
    expect(waitingFor({ role: 'owner', matchStatus: 'confirmed', handoff: completed })).toBe(
      'Resolved',
    )
  })
})

describe('badges', () => {
  const fromThem = { sentAt: '2026-10-14T01:24:00Z', fromMe: false }
  const row = (fields) => ({
    matchId: 7,
    role: 'owner',
    matchStatus: 'claimed',
    handoff: pending,
    ...fields,
  })

  it('marks a chat new until you have seen its newest message, never your own', () => {
    expect(hasNewMessage(row({ lastMessage: null }))).toBe(false)
    expect(hasNewMessage(row({ lastMessage: { ...fromThem, fromMe: true } }))).toBe(false)
    expect(hasNewMessage(row({ lastMessage: fromThem }))).toBe(true)
    expect(hasNewMessage(row({ lastMessage: fromThem }), { 7: '2026-10-14T01:24:00Z' })).toBe(false)
    expect(hasNewMessage(row({ lastMessage: fromThem }), { 7: '2026-10-14T01:00:00Z' })).toBe(true)
  })

  it('counts the handoffs that need you: your turn, or a new message', () => {
    expect(isYourTurn(row({ role: 'finder', handoff: null }))).toBe(true)
    expect(isYourTurn(row({ role: 'owner', handoff: null }))).toBe(false)
    const rows = [
      row({ matchId: 1, role: 'finder', handoff: null }),
      row({ matchId: 2, lastMessage: fromThem }),
      row({ matchId: 3 }),
      row({ matchId: 4, matchStatus: 'confirmed', lastMessage: fromThem }),
    ]
    expect(attentionCount(rows)).toBe(3)
    expect(attentionCount(rows, { 2: fromThem.sentAt, 4: fromThem.sentAt })).toBe(1)
  })

  it('remembers what each person has seen in this browser', () => {
    localStorage.clear()
    expect(readSeen(1)).toEqual({})
    writeSeen(1, { 7: '2026-10-14T01:24:00Z' })
    expect(readSeen(1)).toEqual({ 7: '2026-10-14T01:24:00Z' })
    // Someone else on the same computer starts with nothing
    expect(readSeen(2)).toEqual({})
    // Nobody logged in: nothing is read or saved
    writeSeen(null, { 8: '2026-10-14T01:24:00Z' })
    expect(readSeen(null)).toEqual({})
    localStorage.setItem('foundit-chat-seen-1', 'not json')
    expect(readSeen(1)).toEqual({})
  })

  it('remembers which claims were announced, per person', () => {
    localStorage.clear()
    expect(readAnnounced(1)).toBeNull()
    writeAnnounced(1, new Set([11]))
    expect(readAnnounced(1)).toEqual(new Set([11]))
    expect(readAnnounced(2)).toBeNull()
  })

  it('remembers which messages each person reported', () => {
    localStorage.clear()
    expect(readReported(1)).toEqual(new Set())
    writeReported(1, new Set([4, 9]))
    expect(readReported(1)).toEqual(new Set([4, 9]))
    expect(readReported(2)).toEqual(new Set())
    expect(readReported(null)).toEqual(new Set())
    localStorage.setItem('foundit-reported-messages-1', 'not json')
    expect(readReported(1)).toEqual(new Set())
  })

  it('swaps a message on screen for the server copy, so a removal shows', () => {
    const shown = { id: 1, text: 'my number is 9123', removedAt: null }
    const removed = { id: 1, text: '', removedAt: '2026-10-14T02:00:00Z' }
    const fresh = { id: 2, text: 'see you at 3' }
    const merged = mergeMessages([shown], [removed, fresh])
    expect(merged).toEqual([removed, fresh])
  })
})

describe('Mapbox walking directions', () => {
  it('reads a spot as [lng, lat], the order Mapbox uses', () => {
    expect(lngLat({ coordinates: { lat: 1.2966, lng: 103.8499 } })).toEqual([103.8499, 1.2966])
    expect(lngLat({ lat: 1.2, lng: 103.8 })).toEqual([103.8, 1.2])
    expect(lngLat(null)).toBeNull()
    expect(lngLat({ coordinates: { lat: null, lng: null } })).toBeNull()
  })

  it('asks the Directions API for a walking route', () => {
    const url = directionsUrl([103.8494, 1.2973], [103.8499, 1.2966], 'pk.test')
    expect(url).toBe(
      'https://api.mapbox.com/directions/v5/mapbox/walking/103.8494,1.2973;103.8499,1.2966' +
        '?geometries=geojson&overview=full&access_token=pk.test',
    )
  })

  it('says how long the walk is', () => {
    expect(routeSummary({ duration: 372, distance: 451.6 })).toBe('6 min walk · 452 m')
    expect(routeSummary({ duration: 20, distance: 30 })).toBe('1 min walk · 30 m')
    expect(routeSummary({ duration: 1500, distance: 1840 })).toBe('25 min walk · 1.8 km')
    expect(routeSummary(null)).toBe('')
  })
})

describe('wording with the item name', () => {
  it('names the item instead of saying "item"', () => {
    expect(partnerLine('owner', 'Navy Hydro Flask')).toBe('Found your Navy Hydro Flask')
    expect(partnerLine('finder', 'Navy Hydro Flask')).toBe('Claimed the Navy Hydro Flask')
    expect(partnerLine('finder')).toBe('Claimed the item')
    expect(chatIntro('finder', 'Wallet')).toBe(
      'The owner claimed the Wallet. Check their detail against it.',
    )
  })

  it('explains why a chat closed, for each person', () => {
    expect(closedText({ status: 'declined' }, 'owner').title).toBe('The finder declined your claim')
    expect(closedText({ status: 'declined' }, 'finder').title).toBe('You declined this claim')
    expect(closedText({ status: 'overturned' }, 'owner').title).toBe('An admin closed this claim')
    expect(closedText({ status: 'overturned' }, 'owner').body).toContain('My disputes')
    expect(closedText({ status: 'overturned' }, 'finder').body).toContain('The item page')
    expect(closedText(null, 'owner').title).toBe('This chat has closed')
  })

  it('marks declined and closed rows on the handoffs list', () => {
    expect(waitingFor({ claimStatus: 'declined', role: 'owner' })).toBe('Declined')
    expect(waitingFor({ claimStatus: 'overturned', role: 'owner' })).toBe('Closed')
    expect(isYourTurn({ claimStatus: 'declined', role: 'finder', handoff: null })).toBe(false)
  })
})

describe('chat grouping and news', () => {
  const at = (id, senderId, sentAt) => ({ id, senderId, sentAt, text: 'x' })

  it('shares one time line among messages from one person in the same minute', () => {
    const rows = groupMessages([
      at(1, 2, '2026-10-14T01:20:05Z'),
      at(2, 2, '2026-10-14T01:20:40Z'),
      at(3, 1, '2026-10-14T01:20:50Z'),
      at(4, 1, '2026-10-14T01:21:10Z'),
    ])
    expect(rows.map((row) => [row.showMeta, row.grouped])).toEqual([
      [false, true],
      [true, false],
      [true, false],
      [true, false],
    ])
  })

  it('measures metres between two campus points', () => {
    const metres = metresApart([103.8494, 1.2973], [103.8499, 1.2966])
    expect(metres).toBeGreaterThan(90)
    expect(metres).toBeLessThan(100)
  })
})

describe('claims closed by a dispute', () => {
  it('counts a claim as closed even if its item had been returned first', () => {
    const returnedThenGiven = {
      role: 'owner',
      match: { status: 'rejected' },
      claim: null,
      handoff: { status: 'completed', completedAt: '2026-10-25T09:00:00Z' },
      closed: { status: 'overturned', decidedAt: '2026-10-25T09:25:00Z', reason: null },
    }
    expect(handoffStage(returnedThenGiven)).toBe('closed')
    expect(handoffStage({ ...returnedThenGiven, match: { status: 'confirmed' } })).toBe('closed')
  })

  it('knows which closings came from a dispute', () => {
    expect(closedByDispute({ status: 'overturned' })).toBe(true)
    expect(closedByDispute({ status: 'withdrawn' })).toBe(true)
    expect(closedByDispute({ status: 'declined' })).toBe(false)
    expect(closedByDispute(null)).toBe(false)
  })

  it('finds the decided dispute about an item, newest first', () => {
    const disputes = [
      {
        id: 1,
        itemId: 40,
        status: 'upheld',
        decidedAt: '2026-10-25T09:25:00Z',
        decisionReason: 'old',
      },
      {
        id: 2,
        itemId: 40,
        status: 'upheld',
        decidedAt: '2026-10-26T09:25:00Z',
        decisionReason: 'new',
      },
      { id: 3, itemId: 40, status: 'open', decidedAt: null },
      { id: 4, itemId: 41, status: 'upheld', decidedAt: '2026-10-27T09:25:00Z' },
    ]
    expect(disputeForItem(disputes, 40).decisionReason).toBe('new')
    expect(disputeForItem(disputes, 99)).toBeNull()
    expect(disputeForItem(undefined, 40)).toBeNull()
  })
})

describe('row states for the badge and filters', () => {
  const row = (fields) => ({
    role: 'finder',
    claimStatus: 'active',
    matchStatus: 'claimed',
    handoff: null,
    ...fields,
  })

  it('names where each row is up to with a key', () => {
    expect(rowState(row())).toBe('check')
    expect(rowState(row({ role: 'owner' }))).toBe('waitFinder')
    expect(rowState(row({ handoff: { status: 'pending' } }))).toBe('handOver')
    expect(rowState(row({ role: 'owner', handoff: { status: 'pending' } }))).toBe('planned')
    expect(rowState(row({ role: 'owner', handoff: { status: 'handed_over' } }))).toBe('confirm')
    expect(rowState(row({ handoff: { status: 'handed_over' } }))).toBe('waitOwner')
    expect(rowState(row({ matchStatus: 'confirmed' }))).toBe('resolved')
    expect(rowState(row({ claimStatus: 'declined' }))).toBe('declined')
    expect(rowState(row({ claimStatus: 'overturned' }))).toBe('closed')
  })

  it('shows a paused handoff as paused for both people, and nobody to act', () => {
    const paused = { disputeOpen: true, handoff: { status: 'pending' } }
    expect(rowState(row(paused))).toBe('paused')
    expect(rowState(row({ ...paused, role: 'owner' }))).toBe('paused')
    expect(waitingFor(row(paused))).toBe('Paused for a dispute')
    expect(isYourTurn(row(paused))).toBe(false)
    expect(isYourTurn(row({ role: 'owner', disputeOpen: true }))).toBe(false)
    // A returned item that is disputed later stays resolved here, as on the chat page
    expect(rowState(row({ ...paused, matchStatus: 'confirmed' }))).toBe('resolved')
  })

  it('keeps the badge right even when the words change', () => {
    const original = ROW_WORDS.check
    ROW_WORDS.check = 'Is it theirs? Have a look'
    try {
      expect(isYourTurn(row())).toBe(true)
      expect(waitingFor(row())).toBe('Is it theirs? Have a look')
      expect(attentionCount([row(), row({ role: 'owner' })])).toBe(1)
    } finally {
      ROW_WORDS.check = original
    }
  })
})

describe('canClaim and unavailableText', () => {
  const open = {
    role: 'owner',
    match: { status: 'suggested' },
    claim: null,
    foundItem: { status: 'open', hiddenAt: null },
    lostItem: { status: 'open' },
  }

  it('allows a claim only while both items are open and listed', () => {
    expect(canClaim(open)).toBe(true)
    expect(canClaim({ ...open, role: 'finder' })).toBe(false)
    expect(canClaim({ ...open, claim: { id: 1 } })).toBe(false)
    expect(canClaim({ ...open, match: { status: 'rejected' } })).toBe(false)
    expect(canClaim({ ...open, foundItem: { status: 'matched' } })).toBe(false)
    expect(
      canClaim({ ...open, foundItem: { status: 'open', hiddenAt: '2026-10-20T00:00:00Z' } }),
    ).toBe(false)
    expect(canClaim({ ...open, lostItem: { status: 'resolved' } })).toBe(false)
    expect(canClaim(null)).toBe(false)
  })

  it('says why a find cannot be claimed', () => {
    expect(unavailableText({ ...open, foundItem: { status: 'matched' } }).title).toBe(
      'Someone else has claimed this',
    )
    expect(unavailableText({ ...open, foundItem: { status: 'resolved' } }).title).toBe(
      'Already back with its owner',
    )
    expect(unavailableText({ ...open, lostItem: { status: 'archived' } }).title).toBe(
      'Your lost report is closed',
    )
    expect(unavailableText({ ...open, closed: { status: 'declined' } }).title).toBe(
      'The finder declined your claim',
    )
    expect(unavailableText({ ...open, match: { status: 'rejected' } }).title).toBe(
      'No longer available',
    )
  })
})

describe('day dividers in the chat', () => {
  const now = new Date('2026-10-16T04:00:00Z') // Fri 16 Oct, noon in Singapore
  const msg = (id, sentAt, senderId = 1) => ({ id, senderId, sentAt })

  it('says Today, Yesterday or the date, in Singapore time', () => {
    expect(dayLabel('2026-10-16T01:00:00Z', now)).toBe('Today')
    expect(dayLabel('2026-10-15T10:00:00Z', now)).toBe('Yesterday')
    // 23:30 on the 13th in UTC is already the 14th in Singapore
    expect(dayLabel('2026-10-13T23:30:00Z', now)).toBe('Wed 14 Oct')
  })

  it('marks the first message of each day only', () => {
    const rows = groupMessages(
      [
        msg(1, '2026-10-14T01:00:00Z'),
        msg(2, '2026-10-14T02:00:00Z'),
        msg(3, '2026-10-16T01:00:00Z'),
      ],
      now,
    )
    expect(rows.map((row) => row.day)).toEqual(['Wed 14 Oct', '', 'Today'])
  })

  it('never groups two messages from different days, even at the same minute', () => {
    const rows = groupMessages(
      [msg(1, '2026-10-14T01:00:00Z'), msg(2, '2026-10-15T01:00:00Z')],
      now,
    )
    expect(rows[0].grouped).toBe(false)
    expect(rows[0].showMeta).toBe(true)
  })
})
