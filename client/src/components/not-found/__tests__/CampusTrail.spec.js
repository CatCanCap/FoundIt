import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import CampusTrail from '../CampusTrail.vue'
import { VIEWS } from '../campus-plan'

const FEED = { to: '/feed', label: 'Feed' }
const ITEM = { to: '/items/7/record', label: 'Item 7' }
const END = { title: 'Page not found', detail: '/nope' }

function draw(props = {}) {
  return mount(CampusTrail, {
    props: { end: END, ...props },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, MascotArt: true } },
  })
}

const stops = (wrapper) => wrapper.findAll('[data-testid="trail-stop"]')

describe('CampusTrail', () => {
  it('draws a stop for each place, the newest marked as the last stop', () => {
    const wrapper = draw({ places: [FEED, ITEM] })
    expect(stops(wrapper)).toHaveLength(2)
    expect(stops(wrapper)[0].text()).not.toContain('Last stop')
    expect(stops(wrapper)[1].text()).toContain('Last stop')
  })

  it('names each stop for screen readers, as the letters are hidden from them', () => {
    const wrapper = draw({ places: [ITEM] })
    expect(stops(wrapper)[0].attributes('aria-label')).toBe('Back to Item 7')
    expect(wrapper.find('.trail-map__word').element.parentElement.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })

  it('splits a name into letters that can roll, keeping its spaces', () => {
    const wrapper = draw({ places: [ITEM] })
    const letters = wrapper.findAll('.trail-map__roll')
    const spelled = letters.map((letter) => letter.attributes('data-letter'))
    expect(spelled.join('')).toBe('Item 7')
  })

  it('puts one place on the later spot, next to where the trail stops', () => {
    const wrapper = draw({ view: 'wide', places: [FEED] })
    expect(stops(wrapper)[0].attributes('style')).toContain(`left: ${VIEWS.wide.stops[1].x}%`)
  })

  it('still ends the trail when there are no places', () => {
    const wrapper = draw()
    expect(stops(wrapper)).toHaveLength(0)
    expect(wrapper.find('[data-testid="trail-end"]').text()).toContain('/nope')
  })

  it('credits OpenStreetMap and only marks north on the turned map', () => {
    expect(draw({ view: 'wide' }).text()).toContain('OpenStreetMap')
    expect(draw({ view: 'wide' }).find('.trail-map__north').exists()).toBe(false)
    expect(draw({ view: 'tall' }).find('.trail-map__north').exists()).toBe(true)
  })
})
