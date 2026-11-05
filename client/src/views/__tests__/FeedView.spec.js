import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ default: { get: vi.fn() }, TOKEN_KEY: 'foundit_token' }))

import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import FeedView from '../FeedView.vue'

const spots = [
  { id: 5, building: 'SCIS 1', floor: 'Level 2', area: 'lift lobby' },
  { id: 9, building: 'Li Ka Shing Library', floor: 'Level 1', area: 'entrance' },
]

const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString()

function item(id, overrides = {}) {
  return {
    id,
    type: 'found',
    title: `Item ${id}`,
    category: 'Umbrella',
    colour: 'Black',
    brand: 'Totes',
    description: '',
    photoUrl: null,
    status: 'open',
    postedBy: 2,
    createdAt: recent,
    trail: [{ spotId: 5, from: recent, to: recent }],
    ...overrides,
  }
}

let responses
// Resolves when a test lets GET /api/matches/mine answer (null answers at once)
let matchesGate = null
const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
// A click as a mouse gives it (detail 1) or as Enter or Space give it (detail 0)
const clickWithDetail = async (target, detail) => {
  target.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }))
  await flushPromises()
}
const itemCalls = () => api.get.mock.calls.filter(([url]) => url === '/items')

async function mountFeed(path = '/feed', user = null, { attach = false } = {}) {
  setActivePinia(createPinia())
  if (user) {
    const auth = useAuthStore()
    auth.token = 'abc'
    auth.user = user
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/feed', component: FeedView },
      { path: '/items/:id/record', component: { template: '<div />' } },
      { path: '/report', component: { template: '<div />' } },
      { path: '/report/found', component: { template: '<div />' } },
      { path: '/admin', component: { template: '<div />' } },
      { path: '/matches', component: { template: '<div />' } },
    ],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(FeedView, {
    global: { plugins: [router] },
    ...(attach ? { attachTo: document.body } : {}),
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  matchesGate = null
  vi.clearAllMocks()
  responses = {
    found: [
      item(1),
      item(2, { category: 'Water Bottle', title: 'Navy Hydro Flask', status: 'matched' }),
    ],
    lost: [item(3, { type: 'lost', title: 'Lost wallet', category: 'Wallet' })],
    mine: [],
    matches: {},
  }
  api.get.mockImplementation(async (url, { params } = {}) => {
    if (url === '/spots') return { data: spots }
    if (url === '/colours') {
      return {
        data: [
          { name: 'Navy', hex: '#1f2a5a' },
          { name: 'Multicolour', hex: null },
        ],
      }
    }
    // Your open lost reports with their matches, each with its found item, as
    // GET /api/matches/mine gives them (the header loads this on every page)
    if (url === '/matches/mine') {
      // A test can hold the answer back with matchesGate
      if (matchesGate) await matchesGate
      return {
        data: {
          reports: responses.mine
            .filter((report) => ['open', 'matched'].includes(report.status))
            .map((report) => ({
              item: report,
              matches: (responses.matches[report.id] || []).map((match) => ({
                ...match,
                item: item(match.foundItemId, { title: 'Navy Hydro Flask', ...match.itemExtras }),
              })),
            })),
        },
      }
    }
    if (url === '/items') return { data: responses[params.type] }
    if (url.startsWith('/admin/'))
      return { data: url.includes('disputes') ? [{ createdAt: recent }] : [] }
    throw new Error(`Unexpected ${url}`)
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('FeedView', () => {
  it('loads the feed view of found and lost items once, for the last 30 days', async () => {
    await mountFeed()
    const types = itemCalls().map(([, { params }]) => params)
    expect(types).toHaveLength(2)
    expect(types.map((p) => p.type).sort()).toEqual(['found', 'lost'])
    expect(types.every((p) => p.view === 'feed' && p.limit === 500 && p.from)).toBe(true)
  })

  it('draws a find with no photo in its main colour, or grey without one', async () => {
    responses.found = [
      item(1, { colours: ['Navy', 'Multicolour'] }),
      item(2, { colours: ['Multicolour'] }),
      item(3, { colours: [], colour: null }),
    ]
    const { wrapper } = await mountFeed()
    const drawn = (id) =>
      byTestId(wrapper, `feed-card-${id}`).find('[data-testid="feed-card-icon"]').element.style
        .color
    expect(drawn(1)).toBe('rgb(31, 42, 90)')
    // No swatch (Multicolour) or no colour: the tag's grey
    expect(drawn(2)).toBe('currentcolor')
    expect(drawn(3)).toBe('currentcolor')
  })

  it('shows each find as a tag; signed out, its back only leads to the record', async () => {
    const { wrapper } = await mountFeed()
    const tag = byTestId(wrapper, 'feed-card-1')
    expect(tag.element.tagName).toBe('BUTTON')
    expect(tag.find('[data-testid="feed-card-title"]').text()).toBe('Item 1')
    expect(tag.find('[data-testid="feed-card-icon"]').exists()).toBe(true)
    expect(tag.find('[data-testid="feed-card-status"]').text()).toBe('Waiting for its owner')
    expect(byTestId(wrapper, 'feed-card-2').find('[data-testid="feed-card-status"]').text()).toBe(
      'Claimed',
    )
    // Signed out: one button to the record, with no question and no other action
    expect(byTestId(wrapper, 'feed-back-details-1').attributes('href')).toBe('/items/1/record')
    expect(byTestId(wrapper, 'feed-back-details-1').text()).toBe('See full details')
    expect(byTestId(wrapper, 'feed-back-open-1').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-back-1').find('.feed-tag__question').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-back-details-2').attributes('href')).toBe('/items/2/record')
  })

  it("leads a signed-in student's tag back on, with a quiet link to the record", async () => {
    const { wrapper } = await mountFeed('/feed', { id: 9, name: 'Chloe Ng', role: 'user' })
    expect(byTestId(wrapper, 'feed-back-details-1').attributes('href')).toBe('/items/1/record')
    expect(byTestId(wrapper, 'feed-back-details-1').text()).toBe('See full details →')
    // An open find with no match: report it lost, so the matching can link them
    expect(byTestId(wrapper, 'feed-back-open-1').attributes('href')).toBe('/report/lost')
    // A claimed one: "This is my item"
    expect(byTestId(wrapper, 'feed-back-open-2').attributes('href')).toBe('/items/2/dispute')
  })

  it('turns a tag over to its back when tapped, one tag at a time', async () => {
    responses.found = [
      item(1, { colours: ['Navy', 'White'], description: 'Has a sticker of a cat' }),
      item(2),
    ]
    const { wrapper } = await mountFeed()
    const front = byTestId(wrapper, 'feed-card-1')
    const back = byTestId(wrapper, 'feed-back-1')
    expect(front.attributes('aria-expanded')).toBe('false')
    expect(back.attributes('inert')).toBeDefined()

    await front.trigger('click')
    expect(front.attributes('aria-expanded')).toBe('true')
    expect(back.attributes('inert')).toBeUndefined()
    // No colour chip on the photo: the colours are on the item's page
    expect(byTestId(wrapper, 'feed-back-colours-1').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-back-description-1').text()).toBe('Has a sticker of a cat')
    expect(byTestId(wrapper, 'feed-back-description-2').text()).toBe('No description given.')

    // Turning another tag turns the first one back
    await byTestId(wrapper, 'feed-card-2').trigger('click')
    expect(front.attributes('aria-expanded')).toBe('false')
    expect(byTestId(wrapper, 'feed-card-2').attributes('aria-expanded')).toBe('true')

    // Tapping the back, and Esc, turn it back
    await byTestId(wrapper, 'feed-back-2').trigger('click')
    expect(byTestId(wrapper, 'feed-card-2').attributes('aria-expanded')).toBe('false')
    await front.trigger('click')
    await back.trigger('keydown', { key: 'Escape' })
    expect(front.attributes('aria-expanded')).toBe('false')
  })

  it('moves the focus to the back only when the tag was turned with the keyboard', async () => {
    const { wrapper } = await mountFeed(
      '/feed',
      { id: 9, name: 'Chloe Ng', role: 'user' },
      {
        attach: true,
      },
    )
    // A tap or mouse click: the focus stays put, so no ring appears
    await clickWithDetail(byTestId(wrapper, 'feed-card-1'), 1)
    await flushPromises()
    expect(byTestId(wrapper, 'feed-back-1').element.contains(document.activeElement)).toBe(false)
    await byTestId(wrapper, 'feed-back-1').trigger('keydown', { key: 'Escape' })
    // Enter or Space: a click with no detail, and the focus goes to the button
    await clickWithDetail(byTestId(wrapper, 'feed-card-1'), 0)
    await flushPromises()
    expect(document.activeElement).toBe(byTestId(wrapper, 'feed-back-open-1').element)
    wrapper.unmount()
  })

  it("leads a tag's back to claiming it when the student has a match on it", async () => {
    responses.found = [item(1), item(2), item(3, { postedBy: 1 })]
    responses.mine = [item(7, { type: 'lost', postedBy: 1 })]
    responses.matches = {
      7: [{ id: 50, lostItemId: 7, foundItemId: 2, score: 81.6, status: 'suggested' }],
    }
    const { wrapper } = await mountFeed('/feed', { id: 1, name: 'Wei Ling Tan', role: 'user' })
    const back = byTestId(wrapper, 'feed-back-2')
    // The score sits on the picture, and the button asks the question
    expect(byTestId(wrapper, 'feed-back-score-2').text()).toBe('82% match')
    expect(back.find('.feed-tag__question').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-back-open-2').text()).toBe('Claim it')
    // A find with no match keeps its question, and has no score
    expect(byTestId(wrapper, 'feed-back-score-1').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-back-1').find('.feed-tag__question').text()).toBe(
      'Is this yours?',
    )
    // Their own find: a "Your find" badge on the picture, and no question
    expect(byTestId(wrapper, 'feed-back-badge-3').text()).toBe('Your find')
    expect(byTestId(wrapper, 'feed-back-3').find('.feed-tag__question').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-back-open-2').attributes('href')).toBe('/matches/50/claim')
    expect(byTestId(wrapper, 'feed-back-open-1').attributes('href')).toBe('/report/lost')
  })

  it('counts the found items and lost reports, and switches between them', async () => {
    const { wrapper, router } = await mountFeed()
    expect(byTestId(wrapper, 'feed-type-found').text()).toContain('2')
    expect(byTestId(wrapper, 'feed-type-lost').text()).toContain('1')
    // The count is this week's; the list goes back 30 days, and says so
    const count = byTestId(wrapper, 'feed-count')
    expect(count.find('.feed-count__main').text()).toBe('2 found this week')
    expect(count.find('.feed-count__window').text()).toBe('Showing past 30 days')

    await byTestId(wrapper, 'feed-type-lost').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ type: 'lost' })
    expect(byTestId(wrapper, 'feed-card-3').exists()).toBe(true)
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(false)
    // Switching does not load again
    expect(itemCalls()).toHaveLength(2)
  })

  it('says in the heading, the line under it and the list which side this is', async () => {
    const { wrapper } = await mountFeed()
    expect(byTestId(wrapper, 'feed-title').text()).toBe('Found on campus')
    expect(byTestId(wrapper, 'feed-lead').text()).toContain('Things people handed in')
    expect(byTestId(wrapper, 'feed-list').classes()).toContain('is-found')

    await byTestId(wrapper, 'feed-type-lost').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'feed-title').text()).toBe('Lost on campus')
    expect(byTestId(wrapper, 'feed-lead').text()).toContain('Seen one? Report it found.')
    expect(byTestId(wrapper, 'feed-list').classes()).toContain('is-lost')
  })

  it('gives a lost report its number on the tag', async () => {
    const { wrapper } = await mountFeed('/feed?type=lost')
    const row = byTestId(wrapper, 'feed-card-3')
    expect(row.text()).toContain('0003')
    expect(row.text()).not.toContain('L-0003')
    // Still open: still being looked for
    expect(row.find('[data-testid="feed-card-status"]').text()).toBe('Still looking')
  })

  it("shows a found item's number once", async () => {
    const { wrapper } = await mountFeed()
    const row = byTestId(wrapper, 'feed-card-1')
    expect(row.find('.feed-tag__stub-number').text()).toBe('0001')
    expect(row.text().split('0001')).toHaveLength(2)
    expect(row.text()).not.toContain('No. 0001')
    expect(row.text()).not.toContain('min ago')
  })

  it('filters by category family and by search, keeping both in the address bar', async () => {
    vi.useFakeTimers()
    const { wrapper, router } = await mountFeed()
    await byTestId(wrapper, 'feed-family-bottles').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ family: 'bottles' })
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-card-2').exists()).toBe(true)

    await byTestId(wrapper, 'feed-family-all').trigger('click')
    await byTestId(wrapper, 'feed-search').setValue('0001')
    vi.advanceTimersByTime(250)
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: '0001' })
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(true)
    expect(byTestId(wrapper, 'feed-card-2').exists()).toBe(false)
  })

  it('offers to clear a search that finds nothing', async () => {
    const { wrapper, router } = await mountFeed('/feed?q=nothing-like-this')
    expect(byTestId(wrapper, 'feed-empty').exists()).toBe(true)
    await byTestId(wrapper, 'feed-clear').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(true)
  })

  it('keeps its search while it fades out, and leaves the next page’s address alone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { wrapper, router } = await mountFeed('/feed?q=flask')
    await router.push('/items/2/record?from=feed')
    await flushPromises()
    // The search box would otherwise wait a moment, then rewrite the address
    vi.advanceTimersByTime(1000)
    await flushPromises()
    expect(wrapper.find('#feed-search').element.value).toBe('flask')
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/items/2/record?from=feed')
    vi.useRealTimers()
  })

  it('shows eight finds to a page', async () => {
    responses.found = Array.from({ length: 30 }, (_, i) => item(i + 1))
    const { wrapper } = await mountFeed()
    const cards = () => wrapper.findAll('button[data-testid^="feed-card-"]')
    expect(cards()).toHaveLength(8)
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(true)
    expect(byTestId(wrapper, 'feed-card-9').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-page-where').text()).toBe('Page 1 of 4')
    expect(byTestId(wrapper, 'feed-page-1').attributes('aria-current')).toBe('page')
    expect(byTestId(wrapper, 'feed-page-prev').attributes('disabled')).toBeDefined()
  })

  it('shows a grid of tags, or a compact list, and remembers which on this device', async () => {
    const { wrapper } = await mountFeed()
    expect(byTestId(wrapper, 'feed-view-tags').attributes('aria-pressed')).toBe('true')
    expect(byTestId(wrapper, 'feed-view-tags').attributes('aria-label')).toBe('Show as a grid')
    expect(wrapper.find('.feed-grid .feed-tag').exists()).toBe(true)

    await byTestId(wrapper, 'feed-view-list').trigger('click')
    expect(byTestId(wrapper, 'feed-view-list').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.feed-tag').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-card-1').classes()).toContain('feed-row')
    expect(
      byTestId(wrapper, 'feed-card-1').find('.feed-row__number').attributes('aria-label'),
    ).toBe('Item 0001')
    expect(document.documentElement.dataset.density).toBe('compact')
    expect(localStorage.getItem('foundit-density')).toBe('compact')

    await byTestId(wrapper, 'feed-view-tags').trigger('click')
    expect(wrapper.find('.feed-grid .feed-tag').exists()).toBe(true)
    expect(document.documentElement.dataset.density).toBeUndefined()
    localStorage.removeItem('foundit-density')
  })

  it('counts each category on this side, within the search', async () => {
    const { wrapper } = await mountFeed()
    const count = (family) => byTestId(wrapper, `feed-family-${family}`).find('.feed-chip__count')
    expect(count('all').text()).toBe('2')
    expect(count('umbrellas').text()).toBe('1')
    expect(count('bottles').text()).toBe('1')
    expect(count('keys').text()).toBe('0')
  })

  it('turns to the next page, a numbered page and back, keeping it in the address bar', async () => {
    responses.found = Array.from({ length: 30 }, (_, i) => item(i + 1))
    const { wrapper, router } = await mountFeed()

    await byTestId(wrapper, 'feed-page-next').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ page: '2' })
    expect(byTestId(wrapper, 'feed-card-9').exists()).toBe(true)
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-page-2').attributes('aria-current')).toBe('page')

    await byTestId(wrapper, 'feed-page-4').trigger('click')
    await flushPromises()
    // The last page has the six left over
    expect(wrapper.findAll('button[data-testid^="feed-card-"]')).toHaveLength(6)
    expect(byTestId(wrapper, 'feed-page-next').attributes('disabled')).toBeDefined()

    await byTestId(wrapper, 'feed-page-prev').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ page: '3' })
  })

  it('turns the page with a sideways swipe over the tags, but not with a scroll', async () => {
    responses.found = Array.from({ length: 30 }, (_, i) => item(i + 1))
    const { wrapper, router } = await mountFeed()
    const area = wrapper.find('.feed-swipe')
    const swipe = async (from, to) => {
      await area.trigger('touchstart', { touches: [{ clientX: from[0], clientY: from[1] }] })
      await area.trigger('touchend', { changedTouches: [{ clientX: to[0], clientY: to[1] }] })
      await flushPromises()
    }

    await swipe([300, 400], [120, 410])
    expect(router.currentRoute.value.query).toEqual({ page: '2' })
    // Up and down is the page scrolling
    await swipe([200, 500], [190, 200])
    expect(router.currentRoute.value.query).toEqual({ page: '2' })
    await swipe([100, 400], [280, 400])
    expect(router.currentRoute.value.query).toEqual({})
    // Nothing before the first page
    await swipe([100, 400], [280, 400])
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('opens on the page in the address bar, and the last one when it is past the end', async () => {
    responses.found = Array.from({ length: 30 }, (_, i) => item(i + 1))
    const second = await mountFeed('/feed?page=2')
    expect(byTestId(second.wrapper, 'feed-card-9').exists()).toBe(true)
    const past = await mountFeed('/feed?page=9')
    expect(byTestId(past.wrapper, 'feed-card-25').exists()).toBe(true)
    expect(byTestId(past.wrapper, 'feed-page-where').text()).toBe('Page 4 of 4')
  })

  it('starts again from the first page when the filters change', async () => {
    responses.found = Array.from({ length: 30 }, (_, i) => item(i + 1))
    const { wrapper, router } = await mountFeed('/feed?page=3')
    await byTestId(wrapper, 'feed-family-umbrellas').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ family: 'umbrellas' })
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(true)
  })

  it('leaves out the page buttons when everything fits on one page', async () => {
    responses.found = Array.from({ length: 8 }, (_, i) => item(i + 1))
    const { wrapper } = await mountFeed()
    expect(wrapper.findAll('button[data-testid^="feed-card-"]')).toHaveLength(8)
    expect(byTestId(wrapper, 'feed-pager').exists()).toBe(false)
  })

  it('shows every family as a chip, with Bags and Other at the end and no More menu', async () => {
    const { wrapper } = await mountFeed()
    const chips = wrapper
      .findAll('.feed-chips .feed-chip')
      .map((chip) => chip.attributes('data-testid'))
    expect(chips).toEqual([
      'feed-family-all',
      'feed-family-electronics',
      'feed-family-bottles',
      'feed-family-keys',
      'feed-family-cards',
      'feed-family-umbrellas',
      'feed-family-bags',
      'feed-family-other',
    ])
    expect(byTestId(wrapper, 'feed-family-more').exists()).toBe(false)
  })

  it('filters by Bags, and shows the chip as chosen', async () => {
    responses.found = [item(1), item(2, { category: 'Bag', title: 'Grey tote bag' })]
    const { wrapper, router } = await mountFeed()
    await byTestId(wrapper, 'feed-family-bags').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ family: 'bags' })
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-card-2').exists()).toBe(true)
    expect(byTestId(wrapper, 'feed-family-bags').attributes('aria-pressed')).toBe('true')
  })

  it('filters by Other, which takes in Clothing and Stationery, and says so in a hint', async () => {
    responses.found = [
      item(1),
      item(2, { category: 'Other', title: 'Silver ring' }),
      item(3, { category: 'Clothing', title: 'Grey hoodie' }),
      item(4, { category: 'Stationery', title: 'Blue pencil case' }),
    ]
    const { wrapper, router } = await mountFeed()
    const other = byTestId(wrapper, 'feed-family-other')
    expect(other.attributes('title')).toBe('Clothing, stationery and anything else')
    // Screen readers hear the hint too, as one phrase
    expect(other.attributes('aria-label')).toBe('Other (clothing, stationery and anything else)')
    expect(other.find('.feed-chip__label').text()).toBe('Other')
    await other.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ family: 'other' })
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(false)
    for (const id of [2, 3, 4]) expect(byTestId(wrapper, `feed-card-${id}`).exists()).toBe(true)
  })

  it('leaves out the extras for a visitor who is not logged in', async () => {
    const { wrapper } = await mountFeed()
    expect(byTestId(wrapper, 'feed-hero').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-needs').exists()).toBe(false)
  })

  it('leaves where and when off the tags, for the item page to show', async () => {
    const { wrapper } = await mountFeed()
    for (const id of [1, 2]) {
      const tag = byTestId(wrapper, `feed-card-${id}`)
      expect(tag.find('[data-testid="feed-card-place"]').exists()).toBe(false)
      expect(tag.find('[data-testid="feed-card-when"]').exists()).toBe(false)
      expect(tag.text()).not.toContain('SCIS 1')
      expect(byTestId(wrapper, `feed-back-${id}`).text()).not.toContain('SCIS 1')
    }
    // Nor on the rows of the list
    await byTestId(wrapper, 'feed-view-list').trigger('click')
    const row = byTestId(wrapper, 'feed-card-1')
    expect(row.classes()).toContain('feed-row')
    expect(row.text()).not.toContain('SCIS 1')
    expect(row.text()).not.toMatch(/today|yesterday/i)
    await byTestId(wrapper, 'feed-view-tags').trigger('click')
    localStorage.removeItem('foundit-density')
  })

  it('greets a student without saying where or when, when the place is hidden', async () => {
    const lostFlask = item(7, { type: 'lost', category: 'Water Bottle', postedBy: 1 })
    responses.mine = [lostFlask]
    const hiddenTrail = [{ spotId: null, roomId: null, from: null, to: null }]
    responses.matches = {
      7: [
        {
          id: 50,
          lostItemId: 7,
          foundItemId: 2,
          score: 70,
          status: 'suggested',
          itemExtras: { placeHidden: true, trail: hiddenTrail },
        },
      ],
    }
    const { wrapper } = await mountFeed('/feed', { id: 1, name: 'Wei Ling Tan', role: 'user' })
    const lede = byTestId(wrapper, 'feed-hero').find('.feed-hero__lede').text()
    expect(lede).toMatch(/Someone handed in a Navy Hydro Flask\./)
    expect(lede).not.toContain(' at ')
    expect(lede).not.toContain('Place hidden')
  })

  it('greets a student with their best new match', async () => {
    const lostFlask = item(7, {
      type: 'lost',
      title: 'Navy bottle',
      category: 'Water Bottle',
      postedBy: 1,
    })
    responses.mine = [lostFlask, item(8, { type: 'lost', status: 'resolved', postedBy: 1 })]
    responses.matches = {
      7: [
        {
          id: 50,
          lostItemId: 7,
          foundItemId: 2,
          score: 91.6,
          status: 'suggested',
          reasonParts: [
            { lead: 'same category', detail: '' },
            { lead: 'same brand', detail: 'Hydro Flask' },
            { lead: 'both mention', detail: 'sticker' },
            { lead: 'same colour', detail: 'navy' },
          ],
        },
      ],
    }
    const { wrapper } = await mountFeed('/feed', { id: 1, name: 'Wei Ling Tan', role: 'user' })

    const hero = byTestId(wrapper, 'feed-hero')
    expect(hero.text()).toContain('Your water bottle')
    expect(hero.text()).toContain('Navy Hydro Flask')
    expect(hero.text()).toContain('Wei Ling')
    // The score and the reasons are for the Matches page, not this card
    expect(hero.text()).not.toContain('%')
    expect(hero.text()).not.toContain('Same brand')
    expect(byTestId(wrapper, 'feed-hero-claim').attributes('href')).toBe('/items/2/record')
    // The count is only on the header's badge and the "See all" button: none in
    // the greeting
    expect(byTestId(wrapper, 'feed-announcement').exists()).toBe(false)
    expect(hero.find('h2').text()).not.toMatch(/new match/)
    // The feed's own heading stays the page's one <h1>
    expect(wrapper.findAll('h1').map((heading) => heading.text())).toEqual(['Found on campus'])
  })

  it('shows the items and the welcome together, waiting for the matches', async () => {
    responses.mine = [item(7, { type: 'lost', category: 'Water Bottle', postedBy: 1 })]
    responses.matches = {
      7: [{ id: 50, lostItemId: 7, foundItemId: 2, score: 91.6, status: 'suggested' }],
    }
    let answer
    matchesGate = new Promise((resolve) => (answer = resolve))
    const { wrapper } = await mountFeed('/feed', { id: 1, name: 'Wei Ling Tan', role: 'user' })
    // The items have arrived, but they wait for the matches
    expect(byTestId(wrapper, 'feed-loading').text()).toBe('Loading found items…')
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(false)
    expect(byTestId(wrapper, 'feed-hero').exists()).toBe(false)
    // No numbers yet, rather than a "0" that changes a moment later
    expect(byTestId(wrapper, 'feed-type-found').text()).toBe('Found items')
    expect(byTestId(wrapper, 'feed-count').text()).toBe('')
    answer()
    await flushPromises()
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(true)
    expect(byTestId(wrapper, 'feed-type-found').text()).toMatch(/Found items\s+\d/)
    expect(byTestId(wrapper, 'feed-count').text()).toMatch(/this week/)
    expect(byTestId(wrapper, 'feed-hero').exists()).toBe(true)
  })

  it('shows the items after 1.5 seconds without the matches, and the welcome when they come', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    responses.mine = [item(7, { type: 'lost', category: 'Water Bottle', postedBy: 1 })]
    responses.matches = {
      7: [{ id: 50, lostItemId: 7, foundItemId: 2, score: 91.6, status: 'suggested' }],
    }
    let answer
    matchesGate = new Promise((resolve) => (answer = resolve))
    const { wrapper } = await mountFeed('/feed', { id: 1, name: 'Wei Ling Tan', role: 'user' })
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1500)
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(true)
    expect(byTestId(wrapper, 'feed-hero').exists()).toBe(false)
    answer()
    await flushPromises()
    expect(byTestId(wrapper, 'feed-hero').exists()).toBe(true)
    vi.useRealTimers()
  })

  it('shows the items with no welcome when the matches cannot be loaded', async () => {
    responses.mine = [item(7, { type: 'lost', postedBy: 1 })]
    matchesGate = Promise.reject(new Error('offline'))
    matchesGate.catch(() => {})
    const { wrapper } = await mountFeed('/feed', { id: 1, name: 'Wei Ling Tan', role: 'user' })
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(true)
    expect(byTestId(wrapper, 'feed-hero').exists()).toBe(false)
  })

  it('never makes a visitor wait for matches', async () => {
    matchesGate = new Promise(() => {})
    const { wrapper } = await mountFeed()
    expect(byTestId(wrapper, 'feed-card-1').exists()).toBe(true)
  })

  it('takes the welcome from the shared matches store, with no request per report', async () => {
    responses.mine = [
      item(7, { type: 'lost', category: 'Water Bottle', postedBy: 1 }),
      item(9, { type: 'lost', category: 'Umbrella', postedBy: 1 }),
    ]
    responses.matches = {
      7: [{ id: 50, lostItemId: 7, foundItemId: 2, score: 60, status: 'suggested' }],
      9: [
        { id: 51, lostItemId: 9, foundItemId: 1, score: 88, status: 'suggested' },
        // A claim already under way is not a new match
        { id: 52, lostItemId: 9, foundItemId: 4, score: 95, status: 'claimed' },
      ],
    }
    const { wrapper } = await mountFeed('/feed', { id: 1, name: 'Wei Ling Tan', role: 'user' })
    const urls = api.get.mock.calls.map(([url]) => url)
    // The feed and the header each ask once; never once per report
    expect(urls.filter((url) => url === '/matches/mine').length).toBeLessThanOrEqual(2)
    expect(urls.some((url) => /^\/items\/\d+/.test(url))).toBe(false)
    // The best suggested match leads; the claimed one is left out
    expect(byTestId(wrapper, 'feed-hero').text()).toContain('Your umbrella')
    expect(byTestId(wrapper, 'feed-hero-claim').attributes('href')).toBe('/items/1/record')
    expect(byTestId(wrapper, 'feed-hero-all').text()).toBe('See all matches')
  })

  it('shows no count of matches on the page, only "See all matches"', async () => {
    responses.mine = [item(7, { type: 'lost', category: 'Water Bottle', postedBy: 1 })]
    responses.matches = {
      7: [
        { id: 50, lostItemId: 7, foundItemId: 2, score: 91.6, status: 'suggested' },
        { id: 51, lostItemId: 7, foundItemId: 1, score: 70, status: 'suggested' },
      ],
    }
    const { wrapper } = await mountFeed('/feed', { id: 1, name: 'Wei Ling Tan', role: 'user' })
    // The count is only on the header's badge
    expect(byTestId(wrapper, 'feed-hero').text()).not.toMatch(/\b2\b/)
    expect(byTestId(wrapper, 'feed-hero-all').text()).toBe('See all matches')
  })

  it('no longer has the Start here tiles, the ledger, the lost reports or the year band', async () => {
    responses.found = Array.from({ length: 12 }, (_, i) => item(i + 1))
    responses.mine = [item(7, { type: 'lost', postedBy: 1 })]
    const { wrapper } = await mountFeed('/feed', { id: 1, name: 'Wei Ling Tan', role: 'user' })
    for (const id of [
      'feed-tile-bottles',
      'feed-ledger',
      'feed-mine',
      'feed-post-found',
      'feed-year',
    ]) {
      expect(byTestId(wrapper, id).exists()).toBe(false)
    }
    expect(api.get.mock.calls.some(([url]) => url === '/stats/hotspots')).toBe(false)
  })

  it('shows an admin what needs them, without the student sections', async () => {
    const { wrapper } = await mountFeed('/feed', { id: 9, name: 'Admin', role: 'admin' })
    expect(byTestId(wrapper, 'feed-title').text()).toBe('Found on campus Admin view')
    expect(byTestId(wrapper, 'feed-lead').text()).toContain('Everything handed in')
    expect(byTestId(wrapper, 'feed-needs').text()).toContain('1 open dispute')
    expect(byTestId(wrapper, 'feed-hero').exists()).toBe(false)
  })

  it('shows an error with a way to try again', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/items') throw { response: { data: { error: 'Unknown view' } } }
      return { data: url === '/spots' ? spots : [] }
    })
    const { wrapper } = await mountFeed()
    expect(byTestId(wrapper, 'feed-error').text()).toBe('Unknown view')
    expect(byTestId(wrapper, 'feed-retry').exists()).toBe(true)
  })
})
