import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// A pretend Mapbox: it remembers what the map was asked to do, so the tests
// can check the markers and layers without WebGL or a real token
const fake = vi.hoisted(() => ({ maps: [], failToStart: false }))

vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('mapbox-gl', () => {
  class Map {
    constructor(options) {
      if (fake.failToStart) throw new Error('No WebGL')
      this.options = options
      this.handlers = {}
      this.container = options.container
      this.paint = []
      this.layers = []
      this.removed = false
      this.touchZoomRotate = { disableRotation: vi.fn() }
      fake.maps.push(this)
    }
    on(event, handler) {
      this.handlers[event] = handler
    }
    fire(event, data) {
      this.handlers[event]?.(data)
    }
    addControl() {}
    getContainer() {
      return this.container
    }
    project([lng, lat]) {
      return { x: lng, y: lat }
    }
    fitBounds(bounds, options) {
      this.fitted = options
    }
    getStyle() {
      return {
        layers: [
          { id: 'land', type: 'background' },
          { id: 'water', type: 'fill' },
          { id: 'road-primary', type: 'line' },
        ],
      }
    }
    setPaintProperty(id, property, colour) {
      this.paint.push([id, property, colour])
    }
    getSource(id) {
      return this.layers.includes(id) ? { setData: vi.fn() } : undefined
    }
    addSource() {}
    addLayer(layer) {
      this.layers.push(layer.id)
    }
    remove() {
      this.removed = true
    }
  }
  class Marker {
    constructor({ element }) {
      this.element = element
    }
    setLngLat(lngLat) {
      this.lngLat = lngLat
      return this
    }
    getLngLat() {
      return this.lngLat
    }
    getElement() {
      return this.element
    }
    addTo(map) {
      map.container.append(this.element)
      return this
    }
    remove() {
      this.element.remove()
    }
  }
  class LngLatBounds {
    extend() {
      return this
    }
  }
  class NavigationControl {}
  return { default: { Map, Marker, LngLatBounds, NavigationControl } }
})

import CampusMapbox from '../CampusMapbox.vue'

const spots = [
  {
    id: 1,
    building: 'SCIS 1',
    floor: 'Level 1',
    area: 'lobby',
    coordinates: { lat: 1.2974, lng: 103.8496 },
  },
  {
    id: 2,
    building: 'LKCSB',
    floor: 'Level 1',
    area: 'atrium',
    coordinates: { lat: 1.2952, lng: 103.8506 },
  },
]

const marker = (wrapper, building) => wrapper.find(`[data-testid="map-tile-${building}"]`)

async function mountMap(props = {}) {
  const wrapper = mount(CampusMapbox, {
    props: { token: 'pk.test', spots, ...props },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  fake.maps.length = 0
  fake.failToStart = false
  document.body.innerHTML = ''
})

describe('CampusMapbox: markers', () => {
  it('puts one marker on each building, with its short name and count', async () => {
    const wrapper = await mountMap({ badges: { LKCSB: 3 } })
    expect(marker(wrapper, 'SCIS 1').text()).toContain('SCIS 1')
    expect(marker(wrapper, 'LKCSB').text()).toContain('3')
    expect(marker(wrapper, 'LKCSB').attributes('aria-label')).toBe('LKCSB, 3 items')
    // Every name has been given a side
    expect(marker(wrapper, 'LKCSB').attributes('data-side')).toMatch(/below|right|left|above/)
    wrapper.unmount()
  })

  it('shows trail stop numbers and outlines those buildings', async () => {
    const wrapper = await mountMap({ stops: { 'SCIS 1': [1, 3] } })
    expect(marker(wrapper, 'SCIS 1').attributes('aria-label')).toBe('SCIS 1, stop 1 and 3')
    expect(marker(wrapper, 'SCIS 1').classes()).toContain('picked')
    expect(marker(wrapper, 'LKCSB').classes()).not.toContain('picked')
    wrapper.unmount()
  })

  it('makes markers buttons only when the page wants clicks', async () => {
    const still = await mountMap()
    expect(marker(still, 'LKCSB').element.tagName).toBe('DIV')
    still.unmount()

    const clickable = await mountMap({ clickable: true })
    expect(marker(clickable, 'LKCSB').element.tagName).toBe('BUTTON')
    expect(marker(clickable, 'LKCSB').attributes('aria-pressed')).toBe('false')
    clickable.unmount()
  })

  it('tells the page about clicks, hovers and keyboard focus', async () => {
    const wrapper = await mountMap({ clickable: true })
    marker(wrapper, 'LKCSB').element.click()
    marker(wrapper, 'LKCSB').element.dispatchEvent(new Event('focus'))
    marker(wrapper, 'LKCSB').element.dispatchEvent(new Event('blur'))
    expect(wrapper.emitted('select')).toEqual([['LKCSB']])
    expect(wrapper.emitted('hover')).toEqual([['LKCSB'], ['']])
    wrapper.unmount()
  })

  it('keeps the same markers, and keyboard focus, when another building is picked', async () => {
    const wrapper = await mountMap({ clickable: true })
    const before = marker(wrapper, 'LKCSB').element
    before.focus()

    await wrapper.setProps({ selected: 'LKCSB' })
    const after = marker(wrapper, 'LKCSB').element
    expect(after).toBe(before)
    expect(document.activeElement).toBe(before)
    expect(after.getAttribute('aria-pressed')).toBe('true')
    expect(after.classList.contains('picked')).toBe(true)
    wrapper.unmount()
  })

  it('redraws the markers when the counts change', async () => {
    const wrapper = await mountMap({ badges: { LKCSB: 3 } })
    const before = marker(wrapper, 'LKCSB').element
    await wrapper.setProps({ badges: { LKCSB: 5 } })
    expect(marker(wrapper, 'LKCSB').element).not.toBe(before)
    expect(marker(wrapper, 'LKCSB').text()).toContain('5')
    wrapper.unmount()
  })

  it('never turns names from the data into HTML', async () => {
    const wrapper = await mountMap({
      spots: [{ ...spots[0], building: '<img src=x onerror=alert(1)>' }],
    })
    expect(wrapper.find('img').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('CampusMapbox: the map', () => {
  it('lets the page scroll on a phone, and zooms closer on a narrow screen', async () => {
    const wrapper = await mountMap()
    const map = fake.maps[0]
    map.fire('load')
    expect(map.options.cooperativeGestures).toBe(true)
    // jsdom has no layout, so the map counts as narrow
    expect(map.fitted.padding.left).toBe(20)
    wrapper.unmount()
  })

  it('recolours the base map and adds the heatmap once loaded', async () => {
    const wrapper = await mountMap({ heatPoints: [{ spotId: 1, count: 2 }] })
    const map = fake.maps[0]
    map.fire('load')
    expect(map.paint).toContainEqual(['land', 'background-color', '#dcecc8'])
    expect(map.paint).toContainEqual(['water', 'fill-color', '#a9d3ec'])
    expect(map.paint).toContainEqual(['road-primary', 'line-color', '#b4b9c4'])
    expect(map.layers).toEqual(['hotspots'])
    wrapper.unmount()
  })

  it('says it failed when Mapbox cannot start, so the drawn map shows', async () => {
    fake.failToStart = true
    const wrapper = await mountMap()
    expect(wrapper.emitted('failed')).toHaveLength(1)
    wrapper.unmount()
  })

  it('says it failed on a map error before the map ever loaded', async () => {
    const wrapper = await mountMap()
    fake.maps[0].fire('error', { error: new Error('Bad token') })
    expect(wrapper.emitted('failed')).toHaveLength(1)
    wrapper.unmount()
  })

  it('removes the map when the page closes', async () => {
    const wrapper = await mountMap()
    wrapper.unmount()
    expect(fake.maps[0].removed).toBe(true)
  })
})
