import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api', () => ({ TOKEN_KEY: 'foundit_token', default: { get: vi.fn() } }))
vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))

import api from '@/api'
import LandingView from '../LandingView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const allByTestId = (wrapper, id) => wrapper.findAll(`[data-testid="${id}"]`)

const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

function find(id, title, hours, status = 'open') {
  return {
    id,
    title,
    status,
    category: 'Wallet',
    colours: ['Black'],
    createdAt: hoursAgo(hours),
    trail: [{ spotId: 1, from: hoursAgo(hours), to: hoursAgo(hours) }],
  }
}

function serve(finds) {
  api.get.mockImplementation((url) =>
    Promise.resolve({
      data:
        url === '/spots'
          ? [{ id: 1, building: 'Li Ka Shing Library', floor: 'Level 2', area: 'study areas' }]
          : finds,
    }),
  )
}

describe('LandingView', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('leads with the two reports, lost first, and a way to sign in', () => {
    serve([])
    const wrapper = mount(LandingView)
    expect(wrapper.find('h1').text()).toContain('Lost something on campus?')
    expect(byTestId(wrapper, 'landing-lost').attributes('href')).toBe('/report/lost')
    expect(byTestId(wrapper, 'landing-found').attributes('href')).toBe('/report/found')
    expect(byTestId(wrapper, 'landing-sign-in').attributes('href')).toBe('/login')
    expect(byTestId(wrapper, 'newest-finds-all').attributes('href')).toBe('/feed')
  })

  it('shows grey rows while the finds load, then the newest open finds', async () => {
    serve([
      find(1, 'Black Coach wallet', 2),
      find(2, 'Claimed phone', 1, 'matched'),
      find(3, 'Green Nalgene bottle', 30),
      find(4, 'Old umbrella', 24 * 9),
    ])
    const wrapper = mount(LandingView)
    expect(wrapper.find('.ds-skeleton').exists()).toBe(true)
    expect(allByTestId(wrapper, 'newest-find')).toHaveLength(0)

    await flushPromises()
    const rows = allByTestId(wrapper, 'newest-find')
    // Open finds only, newest first
    expect(rows.map((row) => row.text().split('LKS')[0].trim())).toEqual([
      'Black Coach wallet',
      'Green Nalgene bottle',
      'Old umbrella',
    ])
    expect(rows[0].attributes('href')).toBe('/items/1/record')
    expect(rows[0].text()).toContain('LKS Library · Level 2')
    expect(rows[0].text()).toContain('2 h ago')
  })

  it('shows only the name when the server leaves the place and time out', async () => {
    const hidden = {
      ...find(1, 'Black Coach wallet', 2),
      placeHidden: true,
      trail: [{ spotId: null, roomId: null, from: null, to: null }],
    }
    serve([hidden])
    const wrapper = mount(LandingView)
    await flushPromises()
    const row = byTestId(wrapper, 'newest-find')
    expect(row.text()).toContain('Black Coach wallet')
    expect(row.text()).not.toContain('Place hidden')
    expect(row.find('.finds__place').exists()).toBe(false)
    expect(row.text()).not.toContain('2 h ago')
    expect(row.find('.finds__when').exists()).toBe(false)
  })

  it('says so when nothing is waiting, and offers to report a find', async () => {
    serve([find(1, 'Claimed phone', 1, 'matched')])
    const wrapper = mount(LandingView)
    await flushPromises()
    expect(byTestId(wrapper, 'newest-finds-empty').text()).toContain('Nothing is waiting')
    expect(byTestId(wrapper, 'newest-finds-empty').find('a').attributes('href')).toBe(
      '/report/found',
    )
  })

  it('says when the finds could not load, and tries again', async () => {
    api.get.mockRejectedValue(new Error('Network Error'))
    const wrapper = mount(LandingView)
    await flushPromises()
    expect(byTestId(wrapper, 'newest-finds-error').text()).toContain('Couldn’t load')

    serve([find(1, 'Black Coach wallet', 2)])
    await byTestId(wrapper, 'newest-finds-retry').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'newest-finds-error').exists()).toBe(false)
    expect(allByTestId(wrapper, 'newest-find')).toHaveLength(1)
  })

  it('explains the three steps with a real score and its parts', () => {
    serve([])
    const wrapper = mount(LandingView)
    const how = byTestId(wrapper, 'how-it-works')
    expect(how.findAll('h3').map((heading) => heading.text())).toEqual([
      'Report it',
      'Get matched',
      'Hand it over',
    ])
    // The parts add up to the score shown
    const points = how.findAll('.how__part-points').map((part) => Number(part.text().split('/')[0]))
    expect(points.reduce((sum, part) => sum + part, 0)).toBe(93)
    expect(how.text()).toContain('93')
  })
})
