import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ TOKEN_KEY: 'foundit_token', default: { get: vi.fn() } }))
import api from '@/api'

let route = { path: '/feed', meta: {} }
vi.mock('vue-router', () => ({
  useRoute: () => route,
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))

import { useAuthStore } from '@/stores/auth'
import { flushPromises } from '@vue/test-utils'
import SuspendedBanner from '../SuspendedBanner.vue'

const banner = (wrapper) => wrapper.find('[data-testid="suspended-banner"]')

beforeEach(() => {
  setActivePinia(createPinia())
  api.get.mockReset()
  localStorage.clear()
  route = { path: '/feed', meta: {} }
})

describe('SuspendedBanner', () => {
  it('shows nothing for an account in good standing, or a visitor', () => {
    expect(banner(mount(SuspendedBanner)).exists()).toBe(false)
    useAuthStore().user = { id: 1, suspendedAt: null }
    expect(banner(mount(SuspendedBanner)).exists()).toBe(false)
  })

  it('tells a suspended account what it can still do', () => {
    useAuthStore().user = { id: 1, suspendedAt: '2026-10-25T10:00:00.000Z' }
    const wrapper = mount(SuspendedBanner)
    expect(banner(wrapper).exists()).toBe(true)
    expect(banner(wrapper).text()).toContain('suspended')
    expect(banner(wrapper).text()).toContain('browse')
  })

  it('stays off the sign-in pages, even with a suspended session saved', () => {
    useAuthStore().user = { id: 1, suspendedAt: '2026-10-25T10:00:00.000Z' }
    route = { path: '/login', meta: { authBand: true } }
    expect(banner(mount(SuspendedBanner)).exists()).toBe(false)
    route = { path: '/verify-email', meta: {} }
    expect(banner(mount(SuspendedBanner)).exists()).toBe(false)
  })

  it('links to the appeal, but not on the appeal page itself', async () => {
    useAuthStore().user = { id: 1, suspendedAt: '2026-10-25T10:00:00.000Z' }
    api.get.mockResolvedValue({ data: { suspension: {}, appeal: null, canAppeal: true } })
    const wrapper = mount(SuspendedBanner)
    await flushPromises()
    expect(wrapper.find('[data-testid="banner-appeal"]').text()).toBe('Appeal')
    route = { path: '/appeal', meta: {} }
    const onAppeal = mount(SuspendedBanner)
    await flushPromises()
    expect(banner(onAppeal).exists()).toBe(true)
    expect(onAppeal.find('[data-testid="banner-appeal"]').exists()).toBe(false)
  })

  it('follows a sent appeal, then a declined one', async () => {
    useAuthStore().user = { id: 1, suspendedAt: '2026-10-25T10:00:00.000Z' }
    const appeal = { id: 3, status: 'open', createdAt: '2026-11-03T02:00:00.000Z' }
    api.get.mockResolvedValue({ data: { suspension: {}, appeal, canAppeal: false } })
    const sent = mount(SuspendedBanner)
    await flushPromises()
    expect(banner(sent).text()).toContain('Appeal sent 3 Nov')
    expect(sent.find('[data-testid="banner-appeal"]').text()).toBe('See appeal')

    setActivePinia(createPinia())
    useAuthStore().user = { id: 1, suspendedAt: '2026-10-25T10:00:00.000Z' }
    api.get.mockResolvedValue({
      data: { suspension: {}, appeal: { ...appeal, status: 'declined' }, canAppeal: false },
    })
    const declined = mount(SuspendedBanner)
    await flushPromises()
    expect(banner(declined).text()).toContain('Your appeal was declined.')
    expect(declined.find('[data-testid="banner-appeal"]').text()).toBe('See why')
  })

  it('says once that an accepted appeal made the account active again', async () => {
    localStorage.setItem('foundit_appeal_waiting', '3')
    useAuthStore().user = { id: 1, suspendedAt: null }
    api.get.mockResolvedValue({
      data: { suspension: null, appeal: { id: 3, status: 'accepted' }, canAppeal: false },
    })
    const wrapper = mount(SuspendedBanner)
    await flushPromises()
    expect(banner(wrapper).text()).toContain('Your appeal was accepted.')
    await wrapper.find('[data-testid="banner-close"]').trigger('click')
    expect(banner(wrapper).exists()).toBe(false)
    expect(localStorage.getItem('foundit_appeal_waiting')).toBeNull()
  })

  it('asks nothing of an account that never appealed', async () => {
    useAuthStore().user = { id: 1, suspendedAt: null }
    mount(SuspendedBanner)
    await flushPromises()
    expect(api.get).not.toHaveBeenCalled()
  })
})
