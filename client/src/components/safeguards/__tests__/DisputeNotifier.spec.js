import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { get: vi.fn() },
}))

import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import DisputeNotifier from '../DisputeNotifier.vue'

// A dispute this person raised that an admin has decided
const decided = (id, itemId) => ({
  id,
  itemId,
  status: 'closed',
  decisionReason: 'The claim detail fits',
  createdAt: '2026-10-14T01:00:00Z',
  decidedAt: '2026-10-14T02:00:00Z',
  item: { id: itemId, title: `Item ${itemId}` },
})

let raised
let wrapper

async function mountOn(path) {
  api.get.mockImplementation(async (url) => {
    if (url === '/disputes/mine') return { data: raised }
    return { data: [] }
  })
  const auth = useAuthStore()
  auth.token = 'abc'
  auth.user = { id: 1, role: 'user' }
  const blank = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:rest(.*)', component: blank }],
  })
  router.push(path)
  await router.isReady()
  wrapper = mount(DisputeNotifier, { global: { plugins: [router] } })
  await flushPromises()
  return router
}

const toast = () => wrapper.find('[data-testid="slide-toast"]')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

describe('DisputeNotifier', () => {
  it('names the item when one verdict is waiting, and opens that verdict', async () => {
    raised = [decided(5, 50)]
    const router = await mountOn('/feed')
    expect(toast().text()).toContain('An admin decided the dispute about Item 50')
    await wrapper.find('[data-testid="slide-toast-action"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/disputes?verdict=5')
  })

  it('shares one notice between several verdicts, and closing it closes them all', async () => {
    raised = [decided(5, 50), decided(6, 60), decided(7, 70)]
    await mountOn('/feed')
    expect(toast().text()).toContain('An admin decided 3 of your disputes')
    expect(wrapper.find('[data-testid="slide-toast-action"]').text()).toBe('See verdicts')

    await wrapper.find('[data-testid="slide-toast-close"]').trigger('click')
    await flushPromises()
    expect(toast().exists()).toBe(false)
    // The next check (every 30 seconds) does not bring any of them back
    await vi.advanceTimersByTimeAsync(30000)
    await flushPromises()
    expect(toast().exists()).toBe(false)
  })

  it('opens My disputes from a notice about several verdicts', async () => {
    raised = [decided(5, 50), decided(6, 60)]
    const router = await mountOn('/feed')
    await wrapper.find('[data-testid="slide-toast-action"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/disputes')
  })
})
