import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// The real map needs WebGL, which tests do not have; this stand-in shows what it was given
vi.mock('../WalkingRouteMap.vue', () => ({
  // Marks it as a module, so the lazy loader in WalkingRoute.vue uses .default
  __esModule: true,
  default: {
    props: ['token', 'from', 'to', 'line', 'fromLabel', 'toLabel'],
    template:
      '<div data-testid="walking-map" :data-from="JSON.stringify(from)" :data-line="line ? line.length : 0"></div>',
  },
}))

import WalkingRoute from '../WalkingRoute.vue'

const found = {
  id: 1,
  building: 'SCIS 1',
  floor: 'Level 2',
  area: 'room 2-4',
  coordinates: { lat: 1.2973, lng: 103.8494 },
}
const concierge = {
  id: 7,
  building: 'SCIS 1',
  floor: 'Level 1',
  area: 'concierge',
  coordinates: { lat: 1.2974, lng: 103.8495 },
}
const route = {
  duration: 372,
  distance: 452,
  geometry: {
    coordinates: [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
  },
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ routes: [route] }) })),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('WalkingRoute', () => {
  it('offers a link to another map app when Mapbox is not set up', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', '')
    const wrapper = mount(WalkingRoute, { props: { from: found, to: concierge } })
    await flushPromises()
    expect(wrapper.find('[data-testid="walking-map"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="walking-directions-link"]').attributes('href')).toContain(
      'destination=1.2974,103.8495',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('draws the Mapbox walking route from where it was found when location is off', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
    vi.stubGlobal('navigator', {})
    const wrapper = mount(WalkingRoute, { props: { from: found, to: concierge } })
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/walking/103.8494,1.2973;103.8495,1.2974?'),
    )
    expect(wrapper.find('[data-testid="walking-summary"]').text()).toContain('6 min walk · 452 m')
    expect(wrapper.text()).toContain('from SCIS 1, Level 2 · Room 2-4')
    expect(wrapper.find('[data-testid="walking-map"]').attributes('data-line')).toBe('3')
  })

  it('without where it was found (kept private), starts only from where you are', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
    let report, fail
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: (ok, err) => ((report = ok), (fail = err), 5),
        clearWatch: vi.fn(),
      },
    })
    const wrapper = mount(WalkingRoute, { props: { from: null, to: concierge } })
    await flushPromises()
    expect(wrapper.find('[data-testid="walking-from-found"]').exists()).toBe(false)
    report({ coords: { latitude: 1.2961, longitude: 103.8501 } })
    await flushPromises()
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/walking/103.8501,1.2961;103.8495,1.2974?'),
    )
    expect(wrapper.find('[data-testid="walking-from-found"]').exists()).toBe(false)
    wrapper.unmount()

    // Location refused: no route and no "finding" line that never ends
    fetch.mockClear()
    const refused = mount(WalkingRoute, { props: { from: null, to: concierge } })
    await flushPromises()
    fail({ code: 1 })
    await flushPromises()
    expect(fetch).not.toHaveBeenCalled()
    expect(refused.text()).toContain('The map shows where to go.')
    expect(refused.text()).not.toContain('Finding the walking route')
    expect(refused.text()).toContain(
      'Could not get your location, so the map shows only where to go.',
    )
    expect(refused.find('[data-testid="walking-from-here"]').exists()).toBe(true)
    refused.unmount()
  })

  it('starts from where you are by default, and follows you live', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
    let report
    const clearWatch = vi.fn()
    vi.stubGlobal('navigator', {
      geolocation: { watchPosition: (ok) => ((report = ok), 7), clearWatch },
    })
    const wrapper = mount(WalkingRoute, { props: { from: found, to: concierge } })
    await flushPromises()
    report({ coords: { latitude: 1.2961, longitude: 103.8501 } })
    await flushPromises()
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/walking/103.8501,1.2961;103.8495,1.2974?'),
    )
    expect(wrapper.text()).toContain('from where you are')
    expect(wrapper.find('[data-testid="walking-live"]').exists()).toBe(true)
    const calls = fetch.mock.calls.length

    // A step of a few metres moves the pin but asks for no new route
    report({ coords: { latitude: 1.29612, longitude: 103.85012 } })
    await flushPromises()
    expect(fetch.mock.calls.length).toBe(calls)
    expect(JSON.parse(wrapper.find('[data-testid="walking-map"]').attributes('data-from'))).toEqual(
      [103.85012, 1.29612],
    )

    // Switching to where it was found stops following you
    await wrapper.find('[data-testid="walking-from-found"]').trigger('click')
    await flushPromises()
    expect(clearWatch).toHaveBeenCalledWith(7)
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/walking/103.8494,1.2973;103.8495,1.2974?'),
    )
    wrapper.unmount()
  })

  it('keeps following you when the phone goes quiet while you stand still', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
    let report, fail
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: (ok, err) => ((report = ok), (fail = err), 4),
        clearWatch: vi.fn(),
      },
    })
    const wrapper = mount(WalkingRoute, { props: { from: found, to: concierge } })
    await flushPromises()
    report({ coords: { latitude: 1.2961, longitude: 103.8501 } })
    await flushPromises()
    fail({ code: 3 })
    await flushPromises()
    expect(wrapper.find('[data-testid="walking-live"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Could not get your location')
    wrapper.unmount()
  })

  it('falls back to where it was found when location is refused', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
    vi.stubGlobal('navigator', {
      geolocation: { watchPosition: (ok, fail) => (fail({ code: 1 }), 3), clearWatch: vi.fn() },
    })
    const wrapper = mount(WalkingRoute, { props: { from: found, to: concierge } })
    await flushPromises()
    expect(wrapper.text()).toContain('Could not get your location')
    expect(wrapper.find('[data-testid="walking-from-here"]').exists()).toBe(true)
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/walking/103.8494,1.2973;103.8495,1.2974?'),
    )
  })

  it('still shows the map when the route cannot be found', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
    fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const wrapper = mount(WalkingRoute, { props: { from: found, to: concierge } })
    await flushPromises()
    expect(wrapper.find('[data-testid="walking-map"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Could not load the walking route')
  })
})
