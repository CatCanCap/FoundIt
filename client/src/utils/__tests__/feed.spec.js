import { describe, it, expect } from 'vitest'
import {
  HIDDEN_PLACE,
  tagAsk,
  defaultFilters,
  filtersFromQuery,
  filtersToQuery,
  hasActiveFilters,
  PAGE_SIZE,
  pageFromQuery,
  pageCount,
  buildItemParams,
  matchesSearch,
  applyFilters,
  isThisWeek,
  itemState,
  tagPlace,
  whenParts,
  describeWhen,
  greeting,
  greetingName,
  gapInWords,
  rowStatus,
  familyCounts,
  colourDots,
  swipeStep,
} from '../feed'

const spotsById = new Map([
  [5, { id: 5, building: 'SCIS 1', floor: 'Level 2', area: 'lift lobby' }],
  [9, { id: 9, building: 'Li Ka Shing Library', floor: 'Level 1', area: 'entrance' }],
])
const point = (spotId, to = '2026-10-16T02:00:00Z') => ({ spotId, from: to, to })

function item(id, overrides = {}) {
  return {
    id,
    type: 'found',
    title: `Item ${id}`,
    category: 'Umbrella',
    colour: 'Black',
    brand: 'Totes',
    description: '',
    status: 'open',
    createdAt: '2026-10-16T02:00:00Z',
    trail: [point(5)],
    ...overrides,
  }
}

// 16 Oct 2026, 15:00 in Singapore
const now = new Date('2026-10-16T07:00:00Z')

describe('filters in the address bar', () => {
  it('shows found items of every category by default', () => {
    expect(filtersFromQuery({})).toEqual(defaultFilters())
    expect(defaultFilters()).toEqual({ type: 'found', family: '', q: '' })
    expect(filtersToQuery(defaultFilters())).toEqual({})
    expect(hasActiveFilters(defaultFilters())).toBe(false)
  })

  it('round-trips the type, the category family and the search', () => {
    const query = { type: 'lost', family: 'bottles', q: 'flask' }
    expect(filtersToQuery(filtersFromQuery(query))).toEqual(query)
    expect(hasActiveFilters(filtersFromQuery(query))).toBe(true)
  })

  it('accepts Bags and Other, which have chips of their own', () => {
    expect(filtersFromQuery({ family: 'bags' }).family).toBe('bags')
    expect(filtersFromQuery({ family: 'other' }).family).toBe('other')
  })

  it('ignores values it does not understand', () => {
    expect(filtersFromQuery({ type: 'stolen', family: 'shoes', q: ['a'] })).toEqual(
      defaultFilters(),
    )
  })
})

describe('pages', () => {
  it('reads the page from the address bar, falling back to the first', () => {
    expect(pageFromQuery({ page: '3' })).toBe(3)
    expect(pageFromQuery({})).toBe(1)
    expect(pageFromQuery({ page: '0' })).toBe(1)
    expect(pageFromQuery({ page: '2.5' })).toBe(1)
    expect(pageFromQuery({ page: 'two' })).toBe(1)
    expect(pageFromQuery({ page: ['2'] })).toBe(1)
  })

  it('counts pages of eight, with at least one', () => {
    expect(PAGE_SIZE).toBe(8)
    expect(pageCount(0)).toBe(1)
    expect(pageCount(8)).toBe(1)
    expect(pageCount(9)).toBe(2)
    expect(pageCount(47)).toBe(6)
  })
})

describe('buildItemParams', () => {
  it('asks for the feed view of one type over the last 30 days', () => {
    expect(buildItemParams('lost', now)).toEqual({
      view: 'feed',
      type: 'lost',
      from: new Date('2026-09-16T07:00:00Z').toISOString(),
      limit: 500,
    })
  })
})

describe('matchesSearch and applyFilters', () => {
  it('finds an item, found or lost, by its number as the tags show it', () => {
    expect(matchesSearch(item(3307), '3307', spotsById)).toBe(true)
    expect(matchesSearch(item(3307), '3306', spotsById)).toBe(false)
    expect(matchesSearch(item(412, { type: 'lost' }), '0412', spotsById)).toBe(true)
    expect(matchesSearch(item(412, { type: 'lost' }), '412', spotsById)).toBe(true)
    // The old "No." and "L-" forms are not item numbers any more
    expect(matchesSearch(item(3307), 'No. 3307', spotsById)).toBe(false)
    expect(matchesSearch(item(412, { type: 'lost' }), 'L-0412', spotsById)).toBe(false)
  })

  it('also finds a number in the words, so "14" finds an iPhone 14', () => {
    const phone = item(2, { title: 'Black iPhone 14' })
    expect(matchesSearch(phone, '14', spotsById)).toBe(true)
    expect(matchesSearch(item(14), '14', spotsById)).toBe(true)
    expect(matchesSearch(phone, '15', spotsById)).toBe(false)
  })

  it('finds an item by building, short building name or words', () => {
    const library = item(1, { trail: [point(9)] })
    expect(matchesSearch(library, 'library', spotsById)).toBe(true)
    expect(matchesSearch(library, 'LKS', spotsById)).toBe(true)
    expect(matchesSearch(item(2), 'black totes', spotsById)).toBe(true)
    expect(matchesSearch(item(2), 'black nike', spotsById)).toBe(false)
  })

  it('keeps only the chosen category family', () => {
    const items = [item(1), item(2, { category: 'Water Bottle' }), item(3, { category: 'Laptop' })]
    const kept = applyFilters(items, { type: 'found', family: 'bottles', q: '' }, spotsById)
    expect(kept.map((i) => i.id)).toEqual([2])
  })
})

describe('counting', () => {
  it('knows what was posted this week', () => {
    expect(isThisWeek(item(1, { createdAt: '2026-10-10T08:00:00Z' }), now)).toBe(true)
    expect(isThisWeek(item(1, { createdAt: '2026-10-09T06:00:00Z' }), now)).toBe(false)
  })
})

describe('itemState', () => {
  it('uses the item record words for each status', () => {
    expect(itemState({ status: 'open' })).toBe('open')
    expect(itemState({ status: 'matched' })).toBe('claimed')
    expect(itemState({ status: 'resolved' })).toBe('returned')
  })
})

describe('places', () => {
  it('gives only the short building name for a tag', () => {
    expect(tagPlace(item(1, { trail: [point(9)] }), spotsById)).toEqual({
      building: 'LKS Library',
      detail: '',
    })
  })

  it('counts the other places of a lost item', () => {
    const lost = item(1, { trail: [point(5), point(9), point(9)] })
    expect(tagPlace(lost, spotsById).detail).toBe('+ 2 more')
  })

  it('copes with a spot it does not know', () => {
    expect(tagPlace(item(1, { trail: [point(99)] }), spotsById).building).toBe('Unknown place')
  })

  it('says the place is hidden when the server left it out', () => {
    const hidden = item(1, {
      placeHidden: true,
      trail: [{ spotId: null, roomId: null, from: null, to: null }],
    })
    expect(tagPlace(hidden, spotsById)).toEqual({ building: HIDDEN_PLACE, detail: '' })
    expect(whenParts(hidden, now)).toEqual({ day: '', time: '' })
    // A building search cannot find it either
    expect(matchesSearch(hidden, 'SCIS', spotsById)).toBe(false)
  })
})

describe('times', () => {
  const at = (to) => item(1, { trail: [point(5, to)] })

  it('splits today into the day and a brass time, in Singapore time', () => {
    expect(whenParts(at('2026-10-16T06:05:00Z'), now)).toEqual({ day: 'Today', time: '14:05' })
    expect(describeWhen(at('2026-10-15T16:30:00Z'), now)).toBe('Today, 00:30')
  })

  it('says yesterday, then the weekday, then the year', () => {
    expect(describeWhen(at('2026-10-15T03:00:00Z'), now)).toBe('Yesterday')
    expect(describeWhen(at('2026-10-12T03:00:00Z'), now)).toBe('Mon 12 Oct')
    expect(describeWhen(at('2025-12-30T03:00:00Z'), now)).toBe('30 Dec 2025')
  })

  it('greets by the time of day in Singapore', () => {
    expect(greeting(new Date('2026-10-16T01:00:00Z'))).toBe('Good morning')
    expect(greeting(now)).toBe('Good afternoon')
    expect(greeting(new Date('2026-10-16T12:00:00Z'))).toBe('Good evening')
  })

  it('greets by given name', () => {
    expect(greetingName('Alice Tan')).toBe('Alice')
    expect(greetingName('Wei Ling Tan')).toBe('Wei Ling')
    expect(greetingName('alex')).toBe('alex')
    expect(greetingName('')).toBe('')
  })

  it('puts gaps into words', () => {
    expect(gapInWords('2026-10-16T02:00:00Z', '2026-10-16T02:20:00Z')).toBe('20 minutes')
    expect(gapInWords('2026-10-16T02:00:00Z', '2026-10-16T05:00:00Z')).toBe('3 hours')
    expect(gapInWords('2026-10-14T02:00:00Z', '2026-10-16T02:00:00Z')).toBe('2 days')
  })
})

describe('colourDots', () => {
  it('gives up to three colours with their swatches, main colour first', () => {
    expect(colourDots({ colours: ['Navy', 'White'] })).toEqual([
      { name: 'Navy', hex: '#1f2a5a' },
      { name: 'White', hex: '#f5f5f5' },
    ])
    expect(colourDots({ colours: ['Red', 'Blue', 'Green', 'Black'] }).map((c) => c.name)).toEqual([
      'Red',
      'Blue',
      'Green',
    ])
  })

  it('leaves out a colour with no swatch, and falls back to the older single colour', () => {
    expect(colourDots({ colours: ['Multicolour', 'Black'] })).toEqual([
      { name: 'Black', hex: '#1a1a1a' },
    ])
    expect(colourDots({ colours: [], colour: 'Grey' })).toEqual([{ name: 'Grey', hex: '#808080' }])
    expect(colourDots({ colours: [], colour: null })).toEqual([])
  })
})

describe('swipeStep', () => {
  const at = (x, y, time = 0) => ({ x, y, time })

  it('turns to the next page on a swipe left, and back on a swipe right', () => {
    expect(swipeStep(at(300, 400), at(150, 420, 300))).toBe(1)
    expect(swipeStep(at(100, 400), at(260, 390, 300))).toBe(-1)
  })

  it('ignores short, slow and mostly up-and-down swipes', () => {
    expect(swipeStep(at(300, 400), at(260, 400, 200))).toBe(0)
    expect(swipeStep(at(300, 400), at(100, 400, 1200))).toBe(0)
    expect(swipeStep(at(300, 400), at(200, 250, 300))).toBe(0)
  })
})

describe('rowStatus', () => {
  it('shows nothing for an open item, and the words for any other', () => {
    expect(rowStatus(item(1))).toBe(null)
    expect(rowStatus(item(1, { type: 'lost' }))).toBe(null)
    expect(rowStatus(item(1, { status: 'matched' }))).toEqual({ label: 'Claimed', tone: 'navy' })
    expect(rowStatus(item(1, { status: 'resolved' })).label).toBe('Back with its owner')
  })
})

describe('familyCounts', () => {
  it('counts every category family, within the search', () => {
    const items = [
      item(1),
      item(2, { category: 'Water Bottle', title: 'Navy flask' }),
      item(3, { category: 'Water Bottle', title: 'Green bottle' }),
      item(4, { category: 'Clothing', title: 'Grey hoodie' }),
    ]
    const all = familyCounts(items, '', spotsById)
    expect(all['']).toBe(4)
    expect(all.bottles).toBe(2)
    expect(all.umbrellas).toBe(1)
    expect(all.other).toBe(1)
    expect(all.keys).toBe(0)

    const flask = familyCounts(items, 'flask', spotsById)
    expect(flask['']).toBe(1)
    expect(flask.bottles).toBe(1)
    expect(flask.umbrellas).toBe(0)
  })
})

describe('tagAsk', () => {
  const find = { id: 7, type: 'found', status: 'open', postedBy: 2 }
  const ask = (item, userId = 5, matches = []) =>
    tagAsk(item, { userId, matchesByFind: new Map(matches.map((m) => [m.itemId, m])) })

  it('lets a student claim a find they have a match on', () => {
    expect(ask(find, 5, [{ id: 40, itemId: 7, status: 'suggested', score: 81.6 }])).toEqual({
      question: '',
      score: 82,
      label: 'Claim it',
      to: '/matches/40/claim',
    })
  })

  it('opens the chat for a find they already claimed', () => {
    const claimed = { ...find, status: 'matched' }
    expect(ask(claimed, 5, [{ id: 40, itemId: 7, status: 'claimed', score: 80 }])).toEqual({
      question: '',
      badge: 'Your claim',
      label: 'Open the chat',
      to: '/matches/40',
    })
  })

  it('asks for a lost report when there is no match', () => {
    expect(ask(find)).toEqual({
      question: 'Is this yours?',
      label: 'Report it lost',
      to: '/report/lost',
    })
  })

  it('only offers the item page to someone not signed in', () => {
    const guest = { question: '', label: 'See full details', to: '/items/7/record', guest: true }
    expect(ask(find, null)).toEqual(guest)
    // Even with a match or a claim on it, and for a lost report
    expect(ask({ ...find, status: 'matched' }, null)).toEqual(guest)
    expect(ask({ id: 8, type: 'lost', status: 'open', postedBy: 2 }, null)).toMatchObject({
      guest: true,
      to: '/items/8/record',
    })
  })

  it('leads to "This is my item" for a find someone else claimed or got back', () => {
    expect(ask({ ...find, status: 'matched' }).to).toBe('/items/7/dispute')
    expect(ask({ ...find, status: 'resolved' }).to).toBe('/items/7/dispute')
    // A match on it is no use once someone else has claimed it
    expect(
      ask({ ...find, status: 'matched' }, 5, [{ id: 40, itemId: 7, status: 'suggested' }]).to,
    ).toBe('/items/7/dispute')
  })

  it("asks whether they found someone's lost report", () => {
    expect(ask({ id: 8, type: 'lost', status: 'open', postedBy: 2 })).toEqual({
      question: 'Seen it?',
      label: 'Report it found',
      to: '/report/found',
    })
  })

  it('points a student to their own reports', () => {
    const report = ask({ id: 8, type: 'lost', status: 'open', postedBy: 5 })
    expect(report).toMatchObject({ question: '', badge: 'Your report', to: '/matches/finds/8' })
    const own = ask({ ...find, postedBy: 5 })
    expect(own).toMatchObject({ question: '', badge: 'Your find', to: '/items/7/record' })
  })
})
