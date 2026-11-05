import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  TOKEN_KEY: 'foundit_token',
}))

import api from '@/api'
import MapView from '../MapView.vue'

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString()

const spots = [
  { id: 5, building: 'SCIS 1', floor: 'Level 2', area: 'lift lobby' },
  { id: 16, building: 'LKCSB', floor: 'Basement 1', area: 'group study rooms' },
]
const categories = [{ name: 'Water Bottle' }, { name: 'Laptop' }]

const figures = (buildings) => ({
  buildings,
  spots: [],
  byHour: Array.from({ length: 24 }, () => 0),
})

const item = (id, spotId, createdAt, extra = {}) => ({
  id,
  type: 'found',
  title: `Item ${id}`,
  category: 'Water Bottle',
  status: 'open',
  createdAt,
  trail: [{ spotId, from: createdAt, to: createdAt }],
  ...extra,
})

// Two finds at SCIS 1 (one from this week, one from 10 days ago) and one at LKCSB
const foundItems = [item(1, 5, daysAgo(1)), item(2, 5, daysAgo(10)), item(3, 16, daysAgo(2))]

let hotspots
function answer(url, config) {
  if (url === '/spots') return { data: spots }
  if (url === '/categories') return { data: categories }
  if (url === '/items') return { data: config.params.type === 'found' ? foundItems : [] }
  if (url === '/stats/hotspots') return hotspots(config.params)
  return { data: [] }
}

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

async function mountMap() {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/map', component: MapView },
      { path: '/feed', component: { template: '<div />' } },
      { path: '/:rest(.*)*', component: { template: '<div />' } },
    ],
  })
  router.push('/map')
  await router.isReady()
  const wrapper = mount(MapView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  // Use the drawn campus map, even when a Mapbox token is set
  vi.stubEnv('VITE_MAPBOX_TOKEN', '')
  hotspots = async () => ({ data: figures([{ building: 'SCIS 1', count: 1 }]) })
  api.get.mockImplementation(async (url, config = {}) => answer(url, config))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('MapView: the item list', () => {
  it('asks for the same items as the feed', async () => {
    await mountMap()
    const call = api.get.mock.calls.find(([url]) => url === '/items')
    expect(call[1].params).toMatchObject({ view: 'feed', type: 'found', limit: 500 })
  })

  it('lists this week’s finds, and promises the count the feed will show', async () => {
    const wrapper = await mountMap()
    // Only the find from this week is on the "Latest at" list
    expect(byTestId(wrapper, 'map-latest').findAll('li')).toHaveLength(1)
    // The feed covers 30 days, so it shows both SCIS 1 finds
    const seeAll = byTestId(wrapper, 'map-see-all')
    expect(seeAll.text()).toBe('See 2 from the last 30 days in the feed')
    expect(seeAll.attributes('href')).toBe('/feed?q=SCIS+1')
  })

  it('says finds are private instead of "nothing found" when their places are hidden', async () => {
    const hiddenTrail = [{ spotId: null, roomId: null, from: null, to: null }]
    foundItems.splice(
      0,
      foundItems.length,
      item(1, null, daysAgo(1), { placeHidden: true, trail: hiddenTrail }),
    )
    try {
      const wrapper = await mountMap()
      expect(byTestId(wrapper, 'map-latest').exists()).toBe(false)
      expect(byTestId(wrapper, 'map-latest-private').text()).toContain('stays private')
      expect(wrapper.text()).not.toContain('Nothing found here yet.')
    } finally {
      foundItems.splice(
        0,
        foundItems.length,
        item(1, 5, daysAgo(1)),
        item(2, 5, daysAgo(10)),
        item(3, 16, daysAgo(2)),
      )
    }
  })
})

describe('MapView: buildings with too few finds', () => {
  it('says why when every building was left out', async () => {
    hotspots = async () => ({ data: { ...figures([]), hidden: true } })
    const wrapper = await mountMap()
    expect(byTestId(wrapper, 'map-found-hidden').text()).toContain('fewer aren’t shown')
    expect(wrapper.text()).not.toContain('Nothing has been handed in this week.')
    expect(byTestId(wrapper, 'map-tip').text()).toContain('stays private')
  })

  it('notes it under the ranking when only some were left out', async () => {
    hotspots = async () => ({
      data: { ...figures([{ building: 'SCIS 1', count: 4 }]), hidden: true },
    })
    const wrapper = await mountMap()
    expect(byTestId(wrapper, 'map-rank-SCIS 1').exists()).toBe(true)
    expect(byTestId(wrapper, 'map-found-some-hidden').exists()).toBe(true)
  })

  it('says nothing was handed in when nothing was', async () => {
    hotspots = async () => ({ data: figures([]) })
    const wrapper = await mountMap()
    expect(wrapper.text()).toContain('Nothing has been handed in this week.')
    expect(byTestId(wrapper, 'map-found-hidden').exists()).toBe(false)
  })
})

describe('MapView: the lost view', () => {
  it('says how many of the reported items are still open, as the feed shows', async () => {
    // 4 lost reports passed SCIS 1; only one of them is still open
    hotspots = async () => ({ data: figures([{ building: 'SCIS 1', count: 4 }]) })
    const openLost = item(9, 5, daysAgo(3), { type: 'lost' })
    api.get.mockImplementation(async (url, config = {}) =>
      url === '/items' && config.params.type === 'lost'
        ? { data: [openLost] }
        : answer(url, config),
    )
    const wrapper = await mountMap()
    await byTestId(wrapper, 'toggle-lost').setValue(true)
    await flushPromises()
    expect(byTestId(wrapper, 'map-still-open').text()).toBe('1 of 4 still open')
    // The figures say what they mean in everyday words
    const panel = byTestId(wrapper, 'map-side-lost').text()
    expect(panel).toContain('reported lost')
    expect(panel).toContain('got back')
    expect(panel).toContain('usually back in')
  })
})

describe('MapView: the category filter', () => {
  it('is only on the lost view, so no one find can be singled out', async () => {
    const wrapper = await mountMap()
    expect(byTestId(wrapper, 'map-family-all').exists()).toBe(false)
    const foundCall = api.get.mock.calls.find(([url]) => url === '/stats/hotspots')
    expect(foundCall[1].params.category).toBeUndefined()
    await byTestId(wrapper, 'toggle-lost').setValue(true)
    await flushPromises()
    expect(byTestId(wrapper, 'map-family-all').exists()).toBe(true)
  })

  it('uses toggle buttons, not radios', async () => {
    const wrapper = await mountMap()
    await byTestId(wrapper, 'toggle-lost').setValue(true)
    await flushPromises()
    const all = byTestId(wrapper, 'map-family-all')
    expect(all.attributes('role')).toBeUndefined()
    expect(all.attributes('aria-pressed')).toBe('true')

    await byTestId(wrapper, 'map-family-bottles').trigger('click')
    expect(all.attributes('aria-pressed')).toBe('false')
    expect(byTestId(wrapper, 'map-family-bottles').attributes('aria-pressed')).toBe('true')
  })

  it('shows the newest figures even when an older answer arrives last', async () => {
    let answerFirst
    hotspots = vi
      .fn()
      // The found view's figures
      .mockImplementationOnce(async () => ({ data: figures([{ building: 'SCIS 1', count: 3 }]) }))
      // The lost view's first request (every category) is slow
      .mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)))
      // Then Bottles answers straight away
      .mockImplementationOnce(async () => ({ data: figures([{ building: 'LKCSB', count: 7 }]) }))

    const wrapper = await mountMap()
    await byTestId(wrapper, 'toggle-lost').setValue(true)
    await flushPromises()
    await byTestId(wrapper, 'map-family-bottles').trigger('click')
    await flushPromises()
    // The lost view's panel shows its busiest building
    const panel = () => byTestId(wrapper, 'map-side-lost').text()
    expect(panel()).toContain('LKCSB')

    answerFirst({ data: figures([{ building: 'SCIS 1', count: 9 }]) })
    await flushPromises()
    expect(panel()).toContain('LKCSB')
    expect(panel()).not.toContain('SCIS 1')
  })
})

describe('MapView: errors', () => {
  it('explains a failed load in plain words and can try again', async () => {
    api.get.mockImplementation(async (url, config = {}) => {
      if (url === '/spots') throw new Error('Network Error')
      return answer(url, config)
    })
    const wrapper = await mountMap()
    expect(byTestId(wrapper, 'map-error').text()).toContain('couldn’t load the map')
    expect(byTestId(wrapper, 'map-error').text()).not.toContain('API')

    api.get.mockImplementation(async (url, config = {}) => answer(url, config))
    await byTestId(wrapper, 'map-retry').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'map-error').exists()).toBe(false)
  })
})
