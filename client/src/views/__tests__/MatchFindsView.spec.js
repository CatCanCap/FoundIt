import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '@/api'
import MatchFindsView from '../MatchFindsView.vue'
import { useAuthStore } from '@/stores/auth'
import { useMatchesStore } from '@/stores/matches'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const textOf = (element) => element.text().replace(/\s+/g, ' ')
const point = (spotId) => ({ spotId, from: '2026-10-20T06:00:00Z', to: '2026-10-20T06:05:00Z' })

const flask = {
  item: {
    id: 412,
    type: 'lost',
    status: 'open',
    title: 'Navy Hydro Flask',
    category: 'Water Bottle',
    colours: ['Navy'],
    brand: 'Hydro Flask',
    description: 'Dented hydro flask with a sticker',
    trail: [point(1)],
  },
  matches: [
    {
      id: 1,
      score: 92.4,
      status: 'suggested',
      reasons: ['same category', 'same colour', 'same brand: Hydro Flask', 'both mention: sticker'],
      reasonParts: [
        { lead: 'same category', detail: '' },
        { lead: 'same colour', detail: '' },
        { lead: 'same brand', detail: 'Hydro Flask' },
        { lead: 'both mention', detail: 'sticker' },
      ],
      item: {
        id: 2,
        title: 'Navy Hydro Flask, 750 ml',
        category: 'Water Bottle',
        colour: 'Navy',
        brand: 'Hydro Flask',
        description: 'Has two stickers on the side',
        photoUrl: null,
        trail: [point(1)],
      },
    },
    {
      id: 3,
      score: 71,
      status: 'suggested',
      reasons: ['same category', 'similar colour'],
      item: {
        id: 4,
        title: 'Dark blue steel bottle',
        category: 'Water Bottle',
        photoUrl: null,
        trail: [point(2)],
      },
    },
  ],
}

const umbrella = {
  item: {
    id: 9,
    type: 'lost',
    status: 'open',
    title: 'Black umbrella',
    category: 'Umbrella',
    trail: [point(2)],
  },
  matches: [],
}

const spots = [
  { id: 1, building: 'SCIS 1', floor: 'Level 2', area: 'seminar room 2-4' },
  { id: 2, building: 'LKS Library', floor: 'Level 1', area: 'entrance' },
]

function makeRouter() {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      '/',
      '/feed',
      '/matches',
      '/matches/finds/:reportId',
      '/map',
      '/report',
      '/report/lost',
      '/login',
      '/items/:id/record',
    ].map((path) => ({ path, component: blank })),
  })
}

function serve(reports) {
  api.get.mockImplementation((url) => {
    if (url === '/spots') return Promise.resolve({ data: spots })
    if (url === '/colours') return Promise.resolve({ data: [{ name: 'Navy', hex: '#1f2a5a' }] })
    return Promise.resolve({ data: { reports } })
  })
}

async function mountPage(reports, reportId) {
  serve(reports)
  const router = makeRouter()
  router.push(`/matches/finds/${reportId}`)
  await router.isReady()
  const wrapper = mount(MatchFindsView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 't'
  auth.user = { id: 1, name: 'Alice', role: 'user' }
})

describe('MatchFindsView', () => {
  it('says how many finds look like the report and links back to it', async () => {
    const { wrapper } = await mountPage([flask, umbrella], 412)
    expect(textOf(byTestId(wrapper, 'finds-page-title'))).toBe(
      '2 finds look like your water bottle.',
    )
    // No "Updated just now" line any more
    expect(byTestId(wrapper, 'finds-meta').exists()).toBe(false)
    const back = byTestId(wrapper, 'back-to-report')
    expect(back.text()).toContain('Navy Hydro Flask')
    expect(back.attributes('href')).toBe('/matches?report=412')
  })

  it('counts the badge down once the finds have been seen, like unread', async () => {
    serve([flask, umbrella])
    const store = useMatchesStore()
    await store.load()
    expect(store.count).toBe(2)
    await mountPage([flask, umbrella], 412)
    expect(store.count).toBe(0)
    // Remembered in this browser, so a fresh store still counts them as seen
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.token = 't'
    auth.user = { id: 1, name: 'Alice', role: 'user' }
    const again = useMatchesStore()
    await again.load()
    expect(again.count).toBe(0)
  })

  it('shows the best match large, its score beside the name and every reason', async () => {
    const { wrapper } = await mountPage([flask], 412)
    const best = byTestId(wrapper, 'find-card')
    expect(byTestId(best, 'find-rank').text()).toBe('Best match')
    expect(best.find('.best__body').text()).not.toContain('·')
    // No photo: a small drawing with a note, not a large empty box
    expect(byTestId(best, 'find-drawing').text()).toBe('No photo added')
    expect(best.text()).toContain('Navy Hydro Flask, 750 ml')
    expect(byTestId(best, 'find-score').text()).toBe('92%')
    // Only "Best match" or "Possible match"; no separate word under the score
    expect(best.text()).not.toContain('strong match')
    // Every reason as a chip; the details are shown on the reports themselves
    expect(wrapper.findAll('[data-testid="find-reason"]').map((chip) => chip.text())).toEqual([
      'Same category',
      'Same colour',
      'Same brand',
      'Same mention',
    ])
  })

  it('puts your report beside the find, with what matched marked in both', async () => {
    const { wrapper } = await mountPage([flask], 412)
    const compare = byTestId(wrapper, 'find-compare')
    const [yours, found] = compare.findAll('[data-side]')
    expect(yours.text()).toContain('Navy Hydro Flask')
    expect(found.text()).toContain('Navy Hydro Flask, 750 ml')
    // "sticker" marks "stickers" too; the brand and colour are marked in the names
    expect(yours.findAll('mark').map((mark) => mark.text())).toEqual(
      expect.arrayContaining(['Navy', 'Hydro Flask', 'sticker']),
    )
    expect(found.findAll('mark').map((mark) => mark.text())).toContain('stickers')
  })

  it('lights up only what a reason matched while it is pointed at or tapped', async () => {
    const { wrapper } = await mountPage([flask], 412)
    const compare = () => byTestId(wrapper, 'find-compare')
    const words = wrapper.findAll('[data-testid="find-reason"]')[3]
    await words.trigger('mouseenter')
    expect(compare().classes()).toContain('compare--focus')
    const lit = compare()
      .findAll('.compare__hit--lit')
      .map((mark) => mark.text())
    expect(lit).toEqual(['sticker', 'stickers'])
    await words.trigger('mouseleave')
    expect(compare().classes()).not.toContain('compare--focus')
    // A tap keeps it lit (for phones), and a second tap lets go
    await words.trigger('click')
    expect(words.attributes('aria-pressed')).toBe('true')
    expect(compare().classes()).toContain('compare--focus')
    await words.trigger('click')
    expect(compare().classes()).not.toContain('compare--focus')
  })

  it('says where and when are private on a find whose place the server left out', async () => {
    const hiddenTrail = [{ spotId: null, roomId: null, from: null, to: null }]
    const [best, other] = flask.matches
    const hidden = {
      ...flask,
      matches: [
        { ...best, item: { ...best.item, placeHidden: true, trail: hiddenTrail } },
        { ...other, item: { ...other.item, placeHidden: true, trail: hiddenTrail } },
      ],
    }
    const { wrapper } = await mountPage([hidden], 412)
    const card = byTestId(wrapper, 'find-card')
    expect(byTestId(card, 'find-place-hidden').text()).toContain('stay private')
    expect(card.text()).not.toContain('Found at')
    expect(card.text()).not.toContain('Unknown place')
    expect(byTestId(wrapper, 'find-row').text()).toContain('Place hidden')
    // The side-by-side compare says so too, with no made-up time
    const compare = byTestId(wrapper, 'find-compare').find('[data-side="found"]')
    expect(compare.text()).toContain('Place hidden')
    expect(compare.text()).not.toContain('Jan')
  })

  it('draws a find with no photo in its own colour, or grey without one', async () => {
    const { wrapper } = await mountPage([flask], 412)
    const best = byTestId(wrapper, 'find-card').find('svg').attributes('style')
    expect(best).toMatch(/#1f2a5a|rgb\(31, 42, 90\)/)
    // The dark blue bottle has no colour in the test data, so it stays grey
    const row = byTestId(wrapper, 'find-row').find('svg').attributes('style')
    expect(row).toContain('currentcolor')
  })

  it('lists the other finds as rows under the best one', async () => {
    const { wrapper } = await mountPage([flask], 412)
    const rows = wrapper.findAll('[data-testid="find-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('02')
    expect(rows[0].text()).toContain('Dark blue steel bottle')
    expect(rows[0].text()).toContain('LKS Library')
    expect(rows[0].text()).toContain('. Same category, similar colour.')
    expect(byTestId(rows[0], 'find-row-score').text()).toBe('71%')
  })

  it('shows another find large after "View"', async () => {
    const { wrapper, router } = await mountPage([flask], 412)
    await byTestId(wrapper, 'find-view').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.find).toBe('3')
    const best = byTestId(wrapper, 'find-card')
    expect(byTestId(best, 'find-rank').text()).toBe('Possible match')
    expect(best.text()).toContain('Dark blue steel bottle')
    // The best match moves down into the rows, keeping its number
    const rows = wrapper.findAll('[data-testid="find-row"]')
    expect(rows[0].text()).toContain('01')
    expect(rows[0].text()).toContain('Navy Hydro Flask, 750 ml')
  })

  it('sends "This is mine" to the claim page', async () => {
    const { wrapper } = await mountPage([flask], 412)
    expect(byTestId(wrapper, 'this-is-mine').attributes('href')).toBe('/matches/1/claim')
  })

  it('hides a find at once after "Not mine", and saves it when the Undo toast goes', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'rejected' } })
    const { wrapper } = await mountPage([structuredClone(flask)], 412)
    await byTestId(wrapper, 'not-mine').trigger('click')
    await flushPromises()
    // The next find becomes the best match straight away, nothing saved yet
    expect(byTestId(wrapper, 'find-score').text()).toBe('71%')
    expect(textOf(byTestId(wrapper, 'finds-page-title'))).toBe(
      '1 find looks like your water bottle.',
    )
    expect(api.post).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'slide-toast').text()).toContain('Undo')
    await byTestId(wrapper, 'slide-toast-close').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/matches/1/reject')
    expect(byTestId(wrapper, 'find-score').text()).toBe('71%')
  })

  it('brings a find back with Undo, and never saves it', async () => {
    const { wrapper } = await mountPage([structuredClone(flask)], 412)
    await byTestId(wrapper, 'not-mine').trigger('click')
    await flushPromises()
    await byTestId(wrapper, 'slide-toast-action').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'find-score').text()).toBe('92%')
    expect(byTestId(wrapper, 'slide-toast').exists()).toBe(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('saves a turned-down find when the page is left before the toast goes', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'rejected' } })
    const { wrapper } = await mountPage([structuredClone(flask)], 412)
    await byTestId(wrapper, 'not-mine').trigger('click')
    await flushPromises()
    wrapper.unmount()
    expect(api.post).toHaveBeenCalledWith('/matches/1/reject')
  })

  it('goes back to the report on the Matches page when it has no finds', async () => {
    const { router } = await mountPage([flask, umbrella], 9)
    expect(router.currentRoute.value.path).toBe('/matches')
    // Just the report, with no note: nothing was cleared here
    expect(router.currentRoute.value.query).toEqual({ report: '9' })
  })

  it('goes back to Matches, and says why, after "Not mine" on the last find', async () => {
    api.post.mockResolvedValue({ data: { id: 1, status: 'rejected' } })
    const lastOne = { ...structuredClone(flask), matches: [structuredClone(flask.matches[0])] }
    const { wrapper, router } = await mountPage([lastOne], 412)
    await byTestId(wrapper, 'not-mine').trigger('click')
    await flushPromises()
    expect(textOf(byTestId(wrapper, 'finds-page-title'))).toBe('No finds left')
    await byTestId(wrapper, 'slide-toast-close').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/matches/1/reject')
    expect(router.currentRoute.value.path).toBe('/matches')
    expect(router.currentRoute.value.query).toEqual({ report: '412', cleared: '1' })
  })

  it('says so when the report is not one of yours', async () => {
    const { wrapper } = await mountPage([flask], 555)
    expect(byTestId(wrapper, 'finds-missing').exists()).toBe(true)
    expect(wrapper.find('[data-testid="find-card"]').exists()).toBe(false)
  })

  it('says your own closed report is closed, and links to its record', async () => {
    serve([flask])
    const answer = api.get.getMockImplementation()
    api.get.mockImplementation((url) =>
      url === '/items/99'
        ? Promise.resolve({
            data: {
              id: 99,
              type: 'lost',
              status: 'resolved',
              postedBy: 1,
              title: 'Tote bag',
              category: 'Bag',
            },
          })
        : answer(url),
    )
    const router = makeRouter()
    router.push('/matches/finds/99')
    await router.isReady()
    const wrapper = mount(MatchFindsView, { global: { plugins: [router] } })
    await flushPromises()
    expect(byTestId(wrapper, 'finds-missing').exists()).toBe(false)
    expect(textOf(byTestId(wrapper, 'finds-page-title'))).toBe('You got your bag back.')
    expect(byTestId(wrapper, 'finds-closed').text()).toContain('Back with you')
    expect(byTestId(wrapper, 'finds-closed-record').attributes('href')).toBe('/items/99/record')
  })

  it('still says "not one of yours" for someone else\'s closed report', async () => {
    serve([flask])
    const answer = api.get.getMockImplementation()
    api.get.mockImplementation((url) =>
      url === '/items/99'
        ? Promise.resolve({ data: { id: 99, type: 'lost', status: 'resolved', postedBy: 2 } })
        : answer(url),
    )
    const router = makeRouter()
    router.push('/matches/finds/99')
    await router.isReady()
    const wrapper = mount(MatchFindsView, { global: { plugins: [router] } })
    await flushPromises()
    expect(byTestId(wrapper, 'finds-missing').exists()).toBe(true)
    expect(byTestId(wrapper, 'finds-closed').exists()).toBe(false)
  })

  it('hides "This is mine" on a find someone else claimed, and links to the item to dispute', async () => {
    const taken = structuredClone(flask)
    taken.matches[0].item.status = 'matched'
    const { wrapper } = await mountPage([taken], 412)
    expect(byTestId(wrapper, 'this-is-mine').exists()).toBe(false)
    expect(byTestId(wrapper, 'not-mine').exists()).toBe(false)
    expect(byTestId(wrapper, 'status-pill').text()).toBe('Claimed by someone else')
    expect(byTestId(wrapper, 'find-taken').text()).toContain('dispute the claim')
    expect(byTestId(wrapper, 'find-taken-record').attributes('href')).toBe('/items/2/record')
  })

  it('says why when the finds cannot be loaded', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Server is down' } } })
    const router = makeRouter()
    router.push('/matches/finds/412')
    await router.isReady()
    const wrapper = mount(MatchFindsView, { global: { plugins: [router] } })
    await flushPromises()
    expect(byTestId(wrapper, 'finds-error').text()).toBe('Server is down')
  })

  // A claim the finder declined stays under its report (the report stays open)
  const declinedFlask = {
    ...flask,
    declined: [
      {
        matchId: 30,
        declinedAt: '2026-10-22T04:00:00Z',
        item: { id: 31, title: 'Blue bottle at SOA', category: 'Water Bottle', photoUrl: null },
      },
    ],
  }

  it('keeps a claim the finder declined under the finds, and can hide it on this device', async () => {
    localStorage.clear()
    const { wrapper } = await mountPage([declinedFlask], 412)
    const row = byTestId(wrapper, 'declined-claim')
    expect(row.text()).toContain('Blue bottle at SOA')
    expect(row.text()).toContain('The finder declined your claim on 22 Oct.')
    expect(byTestId(wrapper, 'declined-claims').text()).toContain('Your report stays open')

    await byTestId(wrapper, 'declined-hide').trigger('click')
    expect(byTestId(wrapper, 'declined-claim').exists()).toBe(false)

    // Still hidden the next time the page opens
    const again = await mountPage([declinedFlask], 412)
    expect(byTestId(again.wrapper, 'declined-claims').exists()).toBe(false)
    localStorage.clear()
  })

  it('lets the owner close the report from the declined list, after asking', async () => {
    localStorage.clear()
    api.patch.mockResolvedValue({ data: { id: 412, status: 'resolved' } })
    const { wrapper } = await mountPage([declinedFlask], 412)
    await byTestId(wrapper, 'found-it').trigger('click')
    expect(api.patch).not.toHaveBeenCalled()
    await byTestId(wrapper, 'found-it-confirm').trigger('click')
    await flushPromises()
    expect(api.patch).toHaveBeenCalledWith('/items/412', { status: 'resolved' })
  })

  it('stays for a declined claim when no finds are left, with one way to close', async () => {
    localStorage.clear()
    const { wrapper, router } = await mountPage(
      [{ ...umbrella, declined: declinedFlask.declined }],
      9,
    )
    expect(router.currentRoute.value.path).toBe('/matches/finds/9')
    expect(textOf(byTestId(wrapper, 'finds-page-title'))).toBe('No finds left')
    expect(byTestId(wrapper, 'declined-claim').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="found-it"]')).toHaveLength(1)
    localStorage.clear()
  })

  it('never offers to close a report that is being returned, so the handoff is not broken', async () => {
    // A declined claim, then a new claim on another find: the report is matched
    const beingReturned = {
      ...declinedFlask,
      item: { ...flask.item, status: 'matched' },
      matches: [{ ...flask.matches[0], status: 'claimed' }, flask.matches[1]],
    }
    const { wrapper } = await mountPage([beingReturned], 412)
    expect(byTestId(wrapper, 'declined-claim').exists()).toBe(true)
    expect(byTestId(wrapper, 'found-it').exists()).toBe(false)
    expect(byTestId(wrapper, 'declined-claims').text()).not.toContain('Your report stays open')
  })
})
