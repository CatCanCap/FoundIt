import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CampusMap from '../CampusMap.vue'

const spots = [
  {
    id: 1,
    building: 'SCIS 1',
    floor: 'Level 1',
    area: 'lobby',
    coordinates: { lat: 1.297, lng: 103.849 },
  },
  {
    id: 2,
    building: 'LKCSB',
    floor: 'Level 1',
    area: 'atrium',
    coordinates: { lat: 1.295, lng: 103.851 },
  },
]

afterEach(() => vi.unstubAllEnvs())

describe('CampusMap without a Mapbox token', () => {
  it('shows the drawn map with a tile per building', () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', '')
    const wrapper = mount(CampusMap, { props: { spots, badges: { LKCSB: 3 } } })
    expect(wrapper.find('[data-testid="map-tile-SCIS 1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="map-tile-LKCSB"]').text()).toContain('3')
  })

  it('passes a click on a building up to the page', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', '')
    const wrapper = mount(CampusMap, { props: { spots, clickable: true } })
    await wrapper.find('[data-testid="map-tile-LKCSB"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['LKCSB']])
  })
})
