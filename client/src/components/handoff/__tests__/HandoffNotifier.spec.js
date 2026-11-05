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
import HandoffNotifier from '../HandoffNotifier.vue'

const row = (matchId, sentAt, title) => ({
  matchId,
  role: 'owner',
  claimStatus: 'active',
  matchStatus: 'claimed',
  claimedAt: '2026-10-14T01:00:00Z',
  handoff: null,
  foundItem: { id: matchId + 100, title },
  lastMessage: sentAt ? { sentAt, fromMe: false } : null,
})

let rows
let wrapper

async function mountOn(path) {
  api.get.mockImplementation(async (url) => ({ data: url === '/claims/mine' ? rows : {} }))
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
  wrapper = mount(HandoffNotifier, { global: { plugins: [router] } })
  await flushPromises()
  return router
}

// The next check (every 15 seconds)
async function nextCheck() {
  await vi.advanceTimersByTimeAsync(15000)
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
  rows = [row(10, null, 'Navy Hydro Flask'), row(11, null, 'Black umbrella')]
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

const toastText = () => wrapper.find('[data-testid="slide-toast"]')

describe('HandoffNotifier', () => {
  it('alerts on any page when a chat gets a new message, but not on opening', async () => {
    rows[1] = row(11, '2026-10-14T01:30:00Z', 'Black umbrella')
    await mountOn('/disputes')
    // Already there when the app opened: the badge shows it, no alert
    expect(toastText().exists()).toBe(false)

    rows[0] = row(10, '2026-10-14T02:00:00Z', 'Navy Hydro Flask')
    await nextCheck()
    expect(toastText().text()).toContain('New message about Navy Hydro Flask')
  })

  it('never alerts for the chat you are in', async () => {
    await mountOn('/matches/10/handoff')
    rows[0] = row(10, '2026-10-14T02:00:00Z', 'Navy Hydro Flask')
    await nextCheck()
    expect(toastText().exists()).toBe(false)

    // A message in another chat still alerts while you are here
    rows[1] = row(11, '2026-10-14T02:05:00Z', 'Black umbrella')
    await nextCheck()
    expect(toastText().text()).toContain('New message about Black umbrella')
  })

  it('opens the chat from the alert, and hides by itself after a few seconds', async () => {
    const router = await mountOn('/feed')
    rows[0] = row(10, '2026-10-14T02:00:00Z', 'Navy Hydro Flask')
    await nextCheck()
    await wrapper.find('[data-testid="slide-toast-action"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/matches/10/handoff')

    await router.push('/feed')
    await flushPromises()
    rows[1] = row(11, '2026-10-14T02:05:00Z', 'Black umbrella')
    await nextCheck()
    expect(toastText().exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(5500)
    await flushPromises()
    expect(toastText().exists()).toBe(false)
  })

  it('pops up for the finder when the owner claims their find, like a message', async () => {
    // This browser has checked before and knows of no claims yet
    localStorage.setItem('foundit-claims-announced-1', '[]')
    rows = []
    await mountOn('/feed')
    expect(toastText().exists()).toBe(false)

    rows = [{ ...row(11, null, 'Black umbrella'), role: 'finder' }]
    await nextCheck()
    expect(toastText().text()).toContain('Someone claimed your Black umbrella')
    await wrapper.find('[data-testid="slide-toast-action"]').trigger('click')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.path).toBe('/matches/11/handoff')

    // Only once: the next check does not pop it up again
    await wrapper.vm.$router.push('/feed')
    await nextCheck()
    expect(toastText().exists()).toBe(false)
  })

  it('shows a claim that came in while the finder was away', async () => {
    localStorage.setItem('foundit-claims-announced-1', '[]')
    rows = [{ ...row(11, null, 'Black umbrella'), role: 'finder' }]
    await mountOn('/feed')
    expect(toastText().text()).toContain('Someone claimed your Black umbrella')
  })

  it('stays quiet about old claims the first time this browser checks', async () => {
    rows = [{ ...row(11, null, 'Black umbrella'), role: 'finder' }]
    await mountOn('/feed')
    expect(toastText().exists()).toBe(false)
  })

  it('never pops up for the owner who made the claim, or once the finder accepted', async () => {
    localStorage.setItem('foundit-claims-announced-1', '[]')
    rows = [
      row(10, null, 'Navy Hydro Flask'),
      { ...row(11, null, 'Black umbrella'), role: 'finder', handoff: { status: 'pending' } },
    ]
    await mountOn('/feed')
    expect(toastText().exists()).toBe(false)
  })

  it('never pops up a claim in the chat you are already in', async () => {
    localStorage.setItem('foundit-claims-announced-1', '[]')
    rows = [{ ...row(11, null, 'Black umbrella'), role: 'finder' }]
    await mountOn('/matches/11/handoff')
    expect(toastText().exists()).toBe(false)
  })

  it('shares one notice between several chats, and closing it does not bring the next back', async () => {
    const router = await mountOn('/feed')
    rows[0] = row(10, '2026-10-14T02:00:00Z', 'Navy Hydro Flask')
    rows[1] = row(11, '2026-10-14T02:05:00Z', 'Black umbrella')
    await nextCheck()
    expect(toastText().text()).toContain('New messages in 2 chats')

    await wrapper.find('[data-testid="slide-toast-close"]').trigger('click')
    await flushPromises()
    expect(toastText().exists()).toBe(false)
    // Nothing new since: the next check stays quiet
    await nextCheck()
    expect(toastText().exists()).toBe(false)

    // A new message after closing is news again, and "See returns" opens Returns
    rows[0] = row(10, '2026-10-14T03:00:00Z', 'Navy Hydro Flask')
    rows[1] = row(11, '2026-10-14T03:05:00Z', 'Black umbrella')
    await nextCheck()
    await wrapper.find('[data-testid="slide-toast-action"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/returns')
  })
})
