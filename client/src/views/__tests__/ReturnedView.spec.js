import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('@/utils/first-sight', () => ({ firstSight: vi.fn(() => true) }))

import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { firstSight } from '@/utils/first-sight'
import ReturnedView from '../ReturnedView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

const foundItem = {
  id: 3307,
  title: 'Navy Hydro Flask',
  category: 'Water Bottle',
  photoUrl: null,
  createdAt: '2026-10-14T01:00:00Z',
}
const resolved = (role) => ({
  role,
  match: { id: 10, status: 'confirmed' },
  claim: { id: 5 },
  foundItem,
  handoff: { id: 9, status: 'completed', completedAt: '2026-10-15T02:00:00Z' },
})
const summary = {
  completedAt: '2026-10-15T02:00:00Z',
  daysToReturn: 1,
  finderReturns: 3,
  totalReturned: 1285,
  method: 'drop-off',
  spotId: 7,
}

async function mountAs(role, { fail = false } = {}) {
  api.get.mockImplementation((url) => {
    if (fail) return Promise.reject({ response: { data: { error: 'Match not found' } } })
    if (url === '/spots') return Promise.resolve({ data: [] })
    if (url === '/claims/10') return Promise.resolve({ data: resolved(role) })
    if (url === '/handoffs/match/10/summary') return Promise.resolve({ data: summary })
    if (url === '/matches/mine') return Promise.resolve({ data: { reports: [] } })
    return Promise.resolve({ data: [] })
  })
  const auth = useAuthStore()
  auth.token = 'abc'
  auth.user = { id: 1, name: 'Wei Ling Tan', role: 'user' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/matches/:id/resolved', component: ReturnedView },
      { path: '/:rest(.*)', component: { template: '<div />' } },
    ],
  })
  router.push('/matches/10/resolved')
  await router.isReady()
  const wrapper = mount(ReturnedView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

describe('ReturnedView', () => {
  it('never tells the owner to say thanks in the chat, which is read-only by now', async () => {
    const wrapper = await mountAs('owner')
    expect(byTestId(wrapper, 'returned-title').text()).toContain('home')
    expect(wrapper.text()).not.toContain('in the chat')
    expect(wrapper.text()).toContain('thanks to a student who handed it in')
  })

  it('thanks the finder and counts their returns', async () => {
    const wrapper = await mountAs('finder')
    expect(wrapper.text()).toContain('your 3rd return')
    expect(byTestId(wrapper, 'returned-stats').text()).toContain('1,285')
  })

  it('shows a page that could not load with links onward', async () => {
    const wrapper = await mountAs('owner', { fail: true })
    const problem = byTestId(wrapper, 'returned-error')
    expect(problem.text()).toContain('Match not found')
    expect(problem.find('a[href="/returns"]').exists()).toBe(true)
  })

  it('plays the stamp and the confetti only the first time the page shows', async () => {
    window.Element.prototype.animate = vi.fn(() => ({ finished: new Promise(() => {}) }))

    const first = await mountAs('owner')
    const wrap = first.find('.returned__tag-wrap')
    expect(wrap.classes()).toContain('is-first-sight')
    expect(first.find('.returned__blast').findAll('i')).toHaveLength(0)

    await first.find('.returned__stamp').trigger('animationend')
    expect(wrap.classes()).toContain('is-stamped')
    expect(first.find('.returned__blast').findAll('i').length).toBeGreaterThan(30)

    firstSight.mockReturnValueOnce(false)
    const again = await mountAs('owner')
    expect(again.find('.returned__tag-wrap').classes()).not.toContain('is-first-sight')
    delete window.Element.prototype.animate
  })
})
