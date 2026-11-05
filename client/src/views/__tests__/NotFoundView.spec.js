import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const ROUTES = {
  '/feed': { path: '/feed', meta: { title: 'Feed' }, params: {} },
  '/map': { path: '/map', meta: { title: 'Map' }, params: {} },
}

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => ({ fullPath: '/old-link?x=1', path: '/old-link' }),
  useRouter: () => ({ resolve: (address) => ROUTES[address] }),
}))

import NotFoundView from '../NotFoundView.vue'
import { useAuthStore } from '@/stores/auth'
import { forgetPlaces } from '@/utils/last-places'

const stubs = { AppHeader: true, AppFooter: true, RouterLink: { template: '<a><slot /></a>' } }

const visible = (wrapper) => wrapper.findComponent({ name: 'CampusTrail' })

describe('NotFoundView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    forgetPlaces()
  })

  it('says the page is missing, shows the address and links to the feed', () => {
    const wrapper = mount(NotFoundView, { global: { stubs } })
    expect(wrapper.text()).toContain('Page not found')
    expect(wrapper.text()).toContain('/old-link?x=1')
    expect(wrapper.find('[data-testid="not-found-feed"]').exists()).toBe(true)
  })

  it('tells a student when a page is for admins only', () => {
    const wrapper = mount(NotFoundView, { props: { adminsOnly: true }, global: { stubs } })
    expect(wrapper.text()).toContain('Admins only')
    expect(wrapper.text()).toContain('My disputes')
    expect(wrapper.text()).not.toContain('/old-link')
  })

  it('puts the last two pages opened on the trail', () => {
    sessionStorage.setItem('foundit-last-places', JSON.stringify(['/feed', '/map']))
    const wrapper = mount(NotFoundView, { global: { stubs } })
    expect(visible(wrapper).props('places')).toEqual([
      { to: '/feed', label: 'Feed' },
      { to: '/map', label: 'Map' },
    ])
    expect(wrapper.text()).toContain('Go back to your last stop')
  })

  it('offers an admin the Admin page, as the feed and reports are closed to them', () => {
    useAuthStore().user = { id: 1, role: 'admin' }
    const wrapper = mount(NotFoundView, { global: { stubs } })
    expect(wrapper.find('[data-testid="not-found-admin"]').text()).toBe('Go to Admin')
    expect(wrapper.find('[data-testid="not-found-feed"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Report an item')
    expect(wrapper.text()).toContain('Start again from the Admin page')
  })

  it('invents no stops for someone arriving from outside FoundIt', () => {
    const wrapper = mount(NotFoundView, { global: { stubs } })
    expect(wrapper.find('[data-testid="trail-stop"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('last stop')
    expect(wrapper.text()).toContain('Start again from the feed')
  })
})
