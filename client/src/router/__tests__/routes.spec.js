import { describe, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '@/api'
import router from '../index'
import LandingView from '../../views/LandingView.vue'
import NotFoundView from '../../views/NotFoundView.vue'
import { useAuthStore } from '../../stores/auth'

const pageFor = (path) => router.resolve(path).matched.at(-1)

describe('routes', () => {
  it('sends an address that is not a page to the not-found page', () => {
    const page = pageFor('/this-page-does-not-exist')
    expect(page.path).toBe('/:pathMatch(.*)*')
    expect(page.components.default).toBe(NotFoundView)
  })

  it('opens the landing page at /, for visitors only', () => {
    const page = pageFor('/')
    expect(page.components.default).toBe(LandingView)
    expect(page.meta.signedOutOnly).toBe(true)
    expect(page.meta.requiresAuth).toBeFalsy()
  })

  it('still finds real pages before the catch-all', () => {
    expect(pageFor('/feed').path).toBe('/feed')
    expect(pageFor('/items/3/record').path).toBe('/items/:id/record')
  })

  it('has an admins-only page that reuses the not-found page', () => {
    const page = pageFor('/admins-only')
    expect(page.components.default).toBe(NotFoundView)
    expect(page.props.default).toEqual({ adminsOnly: true })
  })

  it('gives every page that needs login a tab title', () => {
    const untitled = router
      .getRoutes()
      .filter((route) => route.meta.requiresAuth && !route.meta.title)
      .map((route) => route.path)
    expect(untitled).toEqual([])
  })

  it('lets anyone open the email-code page, since entering the code is what signs you in', () => {
    expect(pageFor('/verify-email').meta.requiresAuth).toBeFalsy()
  })

  it('needs login for every page with your own details on it', () => {
    const personal = [
      '/profile',
      '/matches',
      '/matches/finds/1',
      '/matches/1/claim',
      '/matches/1/handoff',
      '/matches/1/resolved',
      '/returns',
      '/report',
      '/report/found',
      '/report/lost',
      '/disputes',
      '/items/1/dispute',
      '/admin',
      '/admin/disputes/1',
      '/admin/reports/1',
    ]
    const open = personal.filter((path) => !pageFor(path).meta.requiresAuth)
    expect(open).toEqual([])
  })
})

describe('opening a page that needs login', () => {
  it('goes to the login page when a saved token cannot be confirmed', async () => {
    // A token is in the browser, but the server cannot be reached
    localStorage.setItem('foundit_token', 'saved-token')
    setActivePinia(createPinia())
    api.get.mockRejectedValue(new Error('Network Error'))

    await router.push('/profile')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/profile')
    // It asked the server once more before deciding
    expect(api.get).toHaveBeenCalledWith('/auth/me')
    localStorage.removeItem('foundit_token')
  })

  it('opens the page once the server confirms who you are', async () => {
    localStorage.setItem('foundit_token', 'good-token')
    setActivePinia(createPinia())
    api.get.mockResolvedValue({
      data: { id: 7, name: 'Ben Lim', role: 'user', emailVerifiedAt: '2026-10-01T00:00:00Z' },
    })

    await router.push('/profile')
    expect(router.currentRoute.value.path).toBe('/profile')
    expect(useAuthStore().user.name).toBe('Ben Lim')
    localStorage.removeItem('foundit_token')
  })
})
