import { describe, it, expect } from 'vitest'
import {
  disputeCode,
  itemCode,
  lostCode,
  initials,
  recordProgress,
  disputeWindow,
  formatWhen,
  waitingFor,
  canDispute,
  errorText,
  isConnectionError,
  mayHaveSent,
} from '../safeguards'

describe('item codes and initials', () => {
  it('names items and lost reports the way the design does', () => {
    expect(itemCode(3298)).toBe('3298')
    expect(itemCode(42)).toBe('0042')
    expect(lostCode(421)).toBe('0421')
  })

  it('takes the first letters of up to two words', () => {
    expect(initials('Wei Ling')).toBe('WL')
    expect(initials('marcus lim tan')).toBe('ML')
    expect(initials('')).toBe('?')
  })
})

describe('recordProgress', () => {
  const at = (event, time) => ({ event, at: `2026-10-14T${time}:00Z` })
  const progress = (state, timeline) => recordProgress({ state, item: {}, timeline })

  it('waits on nothing while the item is open', () => {
    const { stops, current } = progress('open', [at('reported', '03:24')])
    expect(stops.map((stop) => stop.reached)).toEqual([true, false, false, false])
    expect(current).toBe(-1)
  })

  it('waits on the handoff once claimed', () => {
    const { stops, current } = progress('claimed', [
      at('reported', '03:24'),
      at('claimed', '04:02'),
    ])
    expect(stops[1].at).toBe('2026-10-14T04:02:00Z')
    expect(current).toBe(2)
  })

  it('waits on the owner once handed over, and is done once returned', () => {
    const handedOver = [at('reported', '03:24'), at('claimed', '04:02'), at('handed_over', '09:30')]
    expect(progress('claimed', handedOver).current).toBe(3)
    const returned = progress('returned', [...handedOver, at('returned', '09:40')])
    expect(returned.current).toBe(-1)
    expect(returned.returnedAt).toBe('2026-10-14T09:40:00Z')
  })

  it('is done when the owner confirmed without the finder marking it handed over', () => {
    const { stops, current, returnedAt } = progress('returned', [
      at('reported', '03:24'),
      at('claimed', '04:02'),
      at('returned', '09:40'),
    ])
    expect(returnedAt).toBe('2026-10-14T09:40:00Z')
    expect(stops.map((stop) => stop.reached)).toEqual([true, true, true, true])
    expect(stops[2].at).toBe('2026-10-14T09:40:00Z')
    expect(current).toBe(-1)
  })

  it('ignores a handover from before the claim moved to someone else', () => {
    const { handedOverAt, current } = progress('claimed', [
      at('reported', '03:24'),
      at('claimed', '04:02'),
      at('handed_over', '05:00'),
      at('claimed', '08:00'),
    ])
    expect(handedOverAt).toBe(null)
    expect(current).toBe(2)
  })
})

describe('disputeWindow', () => {
  it('stays open for 7 days after the return', () => {
    const now = new Date('2026-10-17T09:40:00Z')
    const window = disputeWindow('2026-10-14T09:40:00Z', now)
    expect(window.closesAt).toBe('2026-10-21T09:40:00.000Z')
    expect(window.left).toBeCloseTo(4 / 7)
    expect(window.isOpen).toBe(true)
  })

  it('is closed after that, and missing before a return', () => {
    expect(disputeWindow('2026-10-01T00:00:00Z', new Date('2026-10-20T00:00:00Z')).isOpen).toBe(
      false,
    )
    expect(disputeWindow(null)).toBe(null)
  })
})

describe('disputeCode', () => {
  it('pads the id to four digits', () => {
    expect(disputeCode(141)).toBe('D-0141')
    expect(disputeCode(12345)).toBe('D-12345')
  })
})

describe('formatWhen', () => {
  it('shows Singapore time whatever the device time zone', () => {
    expect(formatWhen('2026-10-14T03:20:00Z')).toBe('14 Oct, 11:20')
  })

  it('shows nothing for no date', () => {
    expect(formatWhen(null)).toBe('')
  })
})

describe('waitingFor', () => {
  const now = new Date('2026-10-15T12:00:00Z')
  it.each([
    ['2026-10-15T11:55:00Z', '5 min'],
    ['2026-10-15T10:00:00Z', '2 h'],
    ['2026-10-14T09:00:00Z', '1 d'],
  ])('%s waited %s', (iso, expected) => {
    expect(waitingFor(iso, now)).toBe(expected)
  })
})

describe('canDispute', () => {
  const record = (state, overrides = {}) => ({
    state,
    item: { type: 'found', postedBy: 2, ...overrides },
  })
  const user = { id: 1 }

  it('offers "This is my item" on a claimed or returned found item', () => {
    expect(canDispute(record('claimed'), user)).toBe(true)
    expect(canDispute(record('returned'), user)).toBe(true)
  })

  it('hides it for the finder, logged-out visitors, lost items and other states', () => {
    expect(canDispute(record('claimed'), { id: 2 })).toBe(false)
    expect(canDispute(record('claimed'), null)).toBe(false)
    expect(canDispute(record('claimed', { type: 'lost' }), user)).toBe(false)
    expect(canDispute(record('open'), user)).toBe(false)
    expect(canDispute(record('disputed'), user)).toBe(false)
  })
})

// Helpers for the dispute form (imports are hoisted, so this second import
// works like the one at the top)
import { claimedAt, disputeBlocker, attachedLostReport } from '../safeguards'

describe('the dispute form helpers', () => {
  const now = new Date('2026-10-20T04:00:00Z')
  const record = (state, timeline = [], overrides = {}) => ({
    state,
    timeline,
    item: { type: 'found', postedBy: 2, ...overrides },
  })
  const user = { id: 1 }

  it('finds when the standing claim was made', () => {
    const timeline = [
      { event: 'reported', at: '2026-10-10T01:00:00Z' },
      { event: 'claimed', at: '2026-10-11T01:00:00Z' },
      { event: 'claimed', at: '2026-10-12T01:00:00Z' },
    ]
    expect(claimedAt(record('claimed', timeline))).toBe('2026-10-12T01:00:00Z')
    expect(claimedAt(record('open'))).toBeNull()
  })

  it('lets someone dispute a claimed, disputed or recently returned find', () => {
    expect(disputeBlocker(record('claimed'), user, now)).toBe('')
    expect(disputeBlocker(record('disputed'), user, now)).toBe('')
    const returned = record('returned', [
      { event: 'claimed', at: '2026-10-14T01:00:00Z' },
      { event: 'handed_over', at: '2026-10-15T01:00:00Z' },
      { event: 'returned', at: '2026-10-16T01:00:00Z' },
    ])
    expect(disputeBlocker(returned, user, now)).toBe('')
  })

  it('says why when they cannot', () => {
    expect(disputeBlocker(record('claimed'), { id: 2 }, now)).toMatch(/reported finding/)
    expect(disputeBlocker(record('claimed', [], { type: 'lost' }), user, now)).toMatch(/found item/)
    expect(disputeBlocker(record('open'), user, now)).toMatch(/Nobody has claimed/)
    const longAgo = record('returned', [
      { event: 'claimed', at: '2026-10-01T01:00:00Z' },
      { event: 'handed_over', at: '2026-10-02T01:00:00Z' },
      { event: 'returned', at: '2026-10-03T01:00:00Z' },
    ])
    expect(disputeBlocker(longAgo, user, now)).toMatch(/more than 7 days ago/)
    // The owner confirmed it back without the finder's "handed over" step
    const confirmedFirst = record('returned', [
      { event: 'claimed', at: '2026-10-01T01:00:00Z' },
      { event: 'returned', at: '2026-10-03T01:00:00Z' },
    ])
    expect(disputeBlocker(confirmedFirst, user, now)).toMatch(/more than 7 days ago/)
    expect(disputeBlocker(null, user, now)).toBe('')
  })

  it('tells a suspended student before they fill in the form', () => {
    const suspended = { ...user, suspendedAt: '2026-10-19T04:00:00Z' }
    expect(disputeBlocker(record('claimed'), suspended, now)).toMatch(/account is suspended/)
  })

  it('tells an admin they decide disputes instead of raising them', () => {
    expect(disputeBlocker(record('claimed'), { id: 9, role: 'admin' }, now)).toMatch(
      /Admins decide disputes/,
    )
  })

  it('picks the lost report the server will attach', () => {
    const reports = [
      { id: 3, createdAt: '2026-10-15T00:00:00Z' },
      { id: 2, createdAt: '2026-10-09T00:00:00Z' },
      { id: 1, createdAt: '2026-10-05T00:00:00Z' },
    ]
    expect(attachedLostReport(reports, '2026-10-10T00:00:00Z').id).toBe(2)
    expect(attachedLostReport(reports, '2026-10-01T00:00:00Z').id).toBe(3)
    expect(attachedLostReport(reports, null).id).toBe(3)
    expect(attachedLostReport([], '2026-10-10T00:00:00Z')).toBeNull()
  })
})

describe('errorText', () => {
  it('uses the API message, or a fallback', () => {
    expect(errorText({ response: { data: { error: 'Admins only' } } })).toBe('Admins only')
    expect(errorText(new Error('Network Error'))).toMatch(/Could not reach the server/)
  })
})

describe('mayHaveSent', () => {
  it('is true when the send got no answer in time', () => {
    expect(mayHaveSent({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' })).toBe(true)
    expect(mayHaveSent({ code: 'ETIMEDOUT' })).toBe(true)
    expect(mayHaveSent({ response: { status: 504 } })).toBe(true)
    expect(mayHaveSent({ response: { status: 502, data: '<html>Bad gateway</html>' } })).toBe(true)
  })

  it('is false when the request never left, or the server answered', () => {
    expect(mayHaveSent(null)).toBe(false)
    expect(mayHaveSent({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(false)
    expect(
      mayHaveSent({ response: { status: 500, data: { error: 'Something went wrong' } } }),
    ).toBe(false)
    expect(mayHaveSent({ response: { status: 409, data: { error: 'Already exists' } } })).toBe(
      false,
    )
  })
})

describe('isConnectionError', () => {
  it('is true when no answer came back, or the request timed out', () => {
    expect(isConnectionError({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(true)
    expect(isConnectionError(new Error('Network Error'))).toBe(true)
    expect(
      isConnectionError({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' }),
    ).toBe(true)
    expect(isConnectionError({ code: 'ETIMEDOUT' })).toBe(true)
  })

  it('is true for a 5xx from the host with none of our { error } words', () => {
    expect(isConnectionError({ response: { status: 502, data: '<html>Bad gateway</html>' } })).toBe(
      true,
    )
    expect(isConnectionError({ response: { status: 504 } })).toBe(true)
  })

  it('is false for any answer the server wrote itself', () => {
    expect(
      isConnectionError({ response: { status: 500, data: { error: 'Something went wrong' } } }),
    ).toBe(false)
    expect(
      isConnectionError({ response: { status: 404, data: { error: 'Item not found' } } }),
    ).toBe(false)
    expect(isConnectionError({ response: { status: 400, data: {} } })).toBe(false)
  })

  it('is false for a cancelled request or no error at all', () => {
    expect(isConnectionError({ code: 'ERR_CANCELED' })).toBe(false)
    expect(isConnectionError(null)).toBe(false)
    expect(isConnectionError(undefined)).toBe(false)
  })
})

// Helpers added for the Admin queue and its pages (imports are hoisted, so
// this second import works like the one at the top)
import { waitingWords, pageInfo, pageOf, PER_PAGE } from '../safeguards'

describe('waitingWords', () => {
  const now = new Date('2026-10-16T12:00:00Z')

  it('says minutes, hours or days, and flags a wait of a day or more', () => {
    expect(waitingWords('2026-10-16T11:55:00Z', now)).toEqual({ text: '5 min', isLong: false })
    expect(waitingWords('2026-10-16T11:00:00Z', now)).toEqual({ text: '1 hr', isLong: false })
    expect(waitingWords('2026-10-16T10:00:00Z', now)).toEqual({ text: '2 hrs', isLong: false })
    expect(waitingWords('2026-10-15T12:00:00Z', now)).toEqual({ text: '1 day', isLong: true })
    expect(waitingWords('2026-10-13T11:00:00Z', now)).toEqual({ text: '3 days', isLong: true })
  })
})

describe('paging the Admin lists', () => {
  const list = Array.from({ length: 23 }, (_, index) => index + 1)

  it('cuts a list into pages of 10', () => {
    expect(PER_PAGE).toBe(10)
    expect(pageOf(list, 1)).toMatchObject({ page: 1, pageCount: 3, total: 23, from: 1, to: 10 })
    expect(pageOf(list, 3).rows).toEqual([21, 22, 23])
    expect(pageOf(list, 3)).toMatchObject({ from: 21, to: 23 })
  })

  it('keeps the page inside the list, even after it shrinks', () => {
    expect(pageOf(list, 9).page).toBe(3)
    expect(pageOf(list, 0).page).toBe(1)
    expect(pageOf(list, 'abc').page).toBe(1)
    expect(pageOf(list.slice(0, 12), 3).rows).toEqual([11, 12])
  })

  it('has one empty page for an empty list', () => {
    expect(pageOf([], 2)).toEqual({ rows: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 })
  })

  it('works from the length alone, for the pager', () => {
    expect(pageInfo(23, 2)).toEqual({ page: 2, pageCount: 3, total: 23, from: 11, to: 20 })
    expect(pageInfo(10, 1).pageCount).toBe(1)
    expect(pageInfo(11, 1).pageCount).toBe(2)
  })

  it('takes another page size', () => {
    expect(pageOf(list, 2, 5).rows).toEqual([6, 7, 8, 9, 10])
  })
})

// Helpers for the history, evidence and queue tools on the Admin pages
import {
  historyLabels,
  keywords,
  compareWithFound,
  timingWords,
  matchesQuery,
  disputeFlags,
  decisionStats,
  hoursWords,
} from '../safeguards'

describe('historyLabels', () => {
  const clean = {
    disputesRaised: 0,
    disputesRaisedWon: 0,
    disputesAgainst: 0,
    disputesLost: 0,
    claimsWithdrawn: 0,
    claimsDeclined: 0,
    warnings: 0,
    suspensions: 0,
    suspendedAt: null,
    openReports: 0,
    actionedReports: 0,
  }

  it('says nothing for a clean record or a missing one', () => {
    expect(historyLabels(clean)).toEqual([])
    expect(historyLabels(undefined)).toEqual([])
  })

  it('marks what points to a deliberate false claim', () => {
    const labels = historyLabels({
      ...clean,
      disputesAgainst: 3,
      disputesLost: 2,
      claimsWithdrawn: 1,
      warnings: 1,
      suspensions: 2,
      suspendedAt: '2026-10-16T00:00:00Z',
      openReports: 1,
    })
    expect(labels).toEqual([
      { text: 'Suspended now', tone: 'bad' },
      { text: '2 of 3 disputes lost', tone: 'bad' },
      { text: '1 claim withdrawn', tone: 'bad' },
      { text: '1 warning', tone: 'bad' },
      { text: 'Suspended 1 time before', tone: 'bad' },
      { text: '1 open report', tone: 'bad' },
    ])
  })

  it('keeps the rest plain', () => {
    const labels = historyLabels({
      ...clean,
      disputesAgainst: 2,
      disputesRaised: 3,
      disputesRaisedWon: 1,
      claimsDeclined: 1,
      actionedReports: 2,
    })
    expect(labels.map((label) => label.text)).toEqual([
      '2 disputes on claims, none lost',
      '2 reports acted on',
      '1 claim declined',
      'Raised 3 disputes, 1 went their way',
    ])
    expect(labels.every((label) => label.tone === 'plain')).toBe(true)
  })
})

describe('comparing a lost report with the found item', () => {
  const spots = [
    { id: 1, building: 'SCIS 1', floor: 'Level 2' },
    { id: 2, building: 'SCIS 1', floor: 'Level 3' },
    { id: 3, building: 'Library', floor: 'Level 1' },
  ]
  const found = {
    title: 'White AirPods Pro case',
    description: 'Engraved WL on the back',
    category: 'Earbuds',
    colour: 'White',
    brand: 'Apple',
    trail: [{ spotId: 1 }],
  }

  it('keeps the words that say something about the item', () => {
    expect([...keywords('The AirPods, left on a desk!')]).toEqual(['airpods', 'desk'])
  })

  it('finds the details that agree, ignoring case', () => {
    const lost = {
      title: 'AirPods',
      description: 'engraved WL',
      category: 'Earbuds',
      colour: 'white',
      brand: '',
      trail: [{ spotId: 3 }, { spotId: 1 }],
    }
    expect(compareWithFound(found, lost, spots)).toEqual({
      category: true,
      colour: true,
      brand: false,
      place: 'spot',
      sharedWords: ['airpods', 'engraved'],
    })
  })

  it('counts the same building on another floor', () => {
    const lost = { ...found, trail: [{ spotId: 2 }] }
    expect(compareWithFound(found, lost, spots).place).toBe('building')
    expect(compareWithFound(found, { ...found, trail: [{ spotId: 3 }] }, spots).place).toBe(false)
  })

  it('counts any shared colour when items have several, main colour first', () => {
    const navyWhite = { ...found, colour: 'Navy', colours: ['Navy', 'White'] }
    const whiteOnly = { ...found, colour: 'White', colours: ['White'] }
    const black = { ...found, colour: 'Black', colours: ['Black'] }
    expect(compareWithFound(navyWhite, whiteOnly, spots).colour).toBe(true)
    expect(compareWithFound(navyWhite, black, spots).colour).toBe(false)
    expect(colourList({ colour: 'Red' })).toEqual(['Red'])
    expect(colourList({})).toEqual([])
  })

  it('has nothing to compare without a lost report', () => {
    expect(compareWithFound(found, null, spots)).toBeNull()
  })

  it('says how long before or after the claim a report was filed', () => {
    const claim = '2026-10-14T12:00:00Z'
    expect(timingWords('2026-10-14T02:00:00Z', claim)).toEqual({
      before: true,
      text: '10 h before',
    })
    expect(timingWords('2026-10-14T12:30:00Z', claim)).toEqual({
      before: false,
      text: '30 min after',
    })
    expect(timingWords('2026-10-11T12:00:00Z', claim)).toEqual({
      before: true,
      text: '3 days before',
    })
  })
})

describe('matchesQuery', () => {
  const target = {
    text: ['Silver Macbook laptop', 'Wei Ling', 'Daniel Tan'],
    itemId: 117,
    disputeId: 141,
  }

  it('matches everything when nothing is typed', () => {
    expect(matchesQuery('', target)).toBe(true)
    expect(matchesQuery('   ', target)).toBe(true)
  })

  it('finds titles and names, any case, every word', () => {
    expect(matchesQuery('macbook', target)).toBe(true)
    expect(matchesQuery('wei TAN', target)).toBe(true)
    expect(matchesQuery('macbook umbrella', target)).toBe(false)
  })

  it('finds item numbers and case codes however they are written', () => {
    for (const query of ['No. 117', 'no.117', '117', '#117', 'D-0141', 'd141', 'D-141']) {
      expect(matchesQuery(query, target)).toBe(true)
    }
    expect(matchesQuery('D-0142', target)).toBe(false)
    expect(matchesQuery('R-0141', target)).toBe(false)
    expect(matchesQuery('R-3', { text: [], reportId: 3 })).toBe(true)
  })
})

describe('disputeFlags', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  const open = { status: 'open', createdAt: '2026-10-18T00:00:00Z', respondedAt: null }

  it('flags a claimer who has not replied in 48 hours', () => {
    expect(disputeFlags(open, now)).toEqual(['No reply in 48 h'])
    expect(disputeFlags({ ...open, respondedAt: '2026-10-18T05:00:00Z' }, now)).toEqual([])
    expect(disputeFlags({ ...open, createdAt: '2026-10-19T00:00:00Z' }, now)).toEqual([])
  })

  it('flags a returned item that was disputed', () => {
    expect(
      disputeFlags({ ...open, respondedAt: open.createdAt, itemWasReturned: true }, now),
    ).toEqual(['Returned item reopened'])
  })

  it('flags an upheld dispute whose return-by date passed before the item came back', () => {
    const upheld = { status: 'upheld', createdAt: open.createdAt, returnBy: '2026-10-19T00:00:00Z' }
    expect(disputeFlags(upheld, now)).toEqual(['Return-by passed'])
    expect(disputeFlags({ ...upheld, returnDone: true }, now)).toEqual([])
    expect(disputeFlags({ ...upheld, returnBy: '2026-10-21T00:00:00Z' }, now)).toEqual([])
  })
})

describe('decisionStats', () => {
  const now = new Date('2026-10-20T12:00:00Z')

  it('averages the time to decide and splits the outcomes over 30 days', () => {
    const stats = decisionStats(
      [
        { status: 'upheld', createdAt: '2026-10-18T00:00:00Z', decidedAt: '2026-10-18T10:00:00Z' },
        { status: 'closed', createdAt: '2026-10-17T00:00:00Z', decidedAt: '2026-10-17T20:00:00Z' },
        {
          status: 'withdrawn',
          createdAt: '2026-10-16T00:00:00Z',
          decidedAt: '2026-10-19T00:00:00Z',
        },
        { status: 'upheld', createdAt: '2026-08-01T00:00:00Z', decidedAt: '2026-08-02T00:00:00Z' },
        { status: 'open', createdAt: '2026-10-19T00:00:00Z', decidedAt: null },
      ],
      now,
    )
    expect(stats).toEqual({ averageHours: 15, upheld: 1, kept: 1, withdrawn: 1 })
  })

  it('has no average without decisions', () => {
    expect(decisionStats([], now).averageHours).toBeNull()
  })

  it('writes hours in words', () => {
    expect(hoursWords(null)).toBe('–')
    expect(hoursWords(0.4)).toBe('24 min')
    expect(hoursWords(5.2)).toBe('5 h')
    expect(hoursWords(30)).toBe('1.3 d')
  })
})

describe('links and words for the Admin pages', () => {
  it('only redirects inside the app', () => {
    expect(safeRedirect('/report')).toBe('/report')
    expect(safeRedirect('//evil.example.com')).toBe('/')
    expect(safeRedirect('https://evil.example.com', '/feed')).toBe('/feed')
    expect(safeRedirect(undefined, '/feed')).toBe('/feed')
    expect(safeRedirect('/verify-email?x=1', '/', '/verify-email')).toBe('/')
  })

  it('goes back to the Admin list the admin came from', () => {
    expect(queuePath('/admin?tab=reports&page=2')).toBe('/admin?tab=reports&page=2')
    expect(queuePath('/admin')).toBe('/admin')
    expect(queuePath('/admin/disputes/3')).toBe('/admin')
    expect(queuePath('/feed', '/admin?tab=reports')).toBe('/admin?tab=reports')
    expect(queuePath(null)).toBe('/admin')
  })

  it('names each decided outcome, short and long', () => {
    expect(OUTCOMES.closed.short).toBe('Claim kept')
    expect(OUTCOMES.upheld.long).toBe('Returned to the person who disputed the claim')
  })

  it('says what each report action does, and which need a reason', () => {
    const words = (action) => reportActionWords(action, { name: 'Daniel Tan', thing: 'message' })
    expect(words('warn').button).toBe('Warn Daniel')
    expect(words('suspend').confirm).toBe('Yes, suspend Daniel Tan')
    expect(words('remove').happens).toMatch(/message text is hidden/)
    expect(words('dismiss').needsReason).toBe(false)
    expect(words('suspend').needsReason).toBe(true)
  })
})

import { colourList, safeRedirect, queuePath, OUTCOMES, reportActionWords } from '../safeguards'
