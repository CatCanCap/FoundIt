import { describe, it, expect } from 'vitest'
import { checkRoute, pageTitle } from '../guard'

const page = (path, meta = {}) => ({ path, fullPath: path, meta })
const verified = { isLoggedIn: true, user: { id: 1 }, isVerified: true, isAdmin: false }

describe('checkRoute', () => {
  it('sends a visitor to the login page from a page that needs login', () => {
    expect(
      checkRoute(page('/report', { requiresAuth: true }), { isLoggedIn: false, user: null }),
    ).toEqual({
      path: '/login',
      query: { redirect: '/report' },
    })
  })

  it('lets anyone open a public page', () => {
    expect(checkRoute(page('/items/3/record'), { isLoggedIn: false, user: null })).toBe(true)
  })

  it('sends an unverified user to the code page, and lets them stay there', () => {
    const unverified = { ...verified, isVerified: false }
    expect(checkRoute(page('/report', { requiresAuth: true }), unverified)).toEqual({
      path: '/verify-email',
      query: { redirect: '/report' },
    })
    expect(checkRoute(page('/verify-email'), unverified)).toBe(true)
  })

  it('lets a logged-out visitor open the code page, with no loop', () => {
    const visitor = { isLoggedIn: false, user: null, isVerified: false, isAdmin: false }
    const codePage = { ...page('/verify-email'), query: { email: 'a@smu.edu.sg' } }
    expect(checkRoute(codePage, visitor)).toBe(true)
    // A saved token the server never confirmed is treated the same way
    expect(checkRoute(codePage, { ...visitor, isLoggedIn: true })).toBe(true)
  })

  it('sends someone already verified on from the code page', () => {
    const codePage = (redirect) => ({
      path: '/verify-email',
      fullPath: '/verify-email',
      meta: {},
      query: redirect === undefined ? {} : { redirect },
    })
    // e.g. an old link to the code page
    expect(checkRoute(codePage(), { ...verified, isAdmin: true })).toBe('/admin')
    expect(checkRoute(codePage(), verified)).toBe('/feed')
    expect(checkRoute(codePage('/matches?report=3'), verified)).toBe('/matches?report=3')
    // Never off to another site, or round in a circle
    expect(checkRoute(codePage('//evil.example'), verified)).toBe('/feed')
    expect(checkRoute(codePage('/verify-email'), verified)).toBe('/feed')
  })

  it('shows the landing page to visitors and sends anyone signed in on', () => {
    const landing = page('/', { signedOutOnly: true })
    expect(checkRoute(landing, { isLoggedIn: false, user: null })).toBe(true)
    // A saved token the server never confirmed still counts as a visitor
    expect(checkRoute(landing, { isLoggedIn: true, user: null })).toBe(true)
    expect(checkRoute(landing, verified)).toBe('/feed')
    expect(checkRoute(landing, { ...verified, isAdmin: true })).toBe('/admin')
  })

  it('keeps normal users out of admin pages, and lets admins in', () => {
    const adminPage = page('/admin', { requiresAuth: true, requiresAdmin: true })
    // A student is told the page is for admins, not silently sent away
    expect(checkRoute(adminPage, verified)).toEqual({ path: '/admins-only' })
    expect(checkRoute(adminPage, { ...verified, isAdmin: true })).toBe(true)
  })

  it('sends an admin from a student page to the Admin page, and lets students in', () => {
    const matches = page('/matches', { requiresAuth: true, studentOnly: true })
    expect(checkRoute(matches, { ...verified, isAdmin: true })).toEqual({ path: '/admin' })
    expect(checkRoute(matches, verified)).toBe(true)
    // The Map needs no login; a visitor can still open it
    expect(checkRoute(page('/map', { studentOnly: true }), { isLoggedIn: false, user: null })).toBe(
      true,
    )
  })

  it('needs the server to have confirmed who you are, not just a saved token', () => {
    // A token in the browser, but the user never loaded (server down, or stale)
    const unconfirmed = { isLoggedIn: true, user: null, isVerified: false, isAdmin: false }
    for (const path of ['/profile', '/report', '/matches', '/returns', '/disputes']) {
      expect(checkRoute(page(path, { requiresAuth: true }), unconfirmed)).toEqual({
        path: '/login',
        query: { redirect: path },
      })
    }
    // Admin pages too: no user means no admin
    expect(
      checkRoute(page('/admin', { requiresAuth: true, requiresAdmin: true }), unconfirmed),
    ).toEqual({ path: '/login', query: { redirect: '/admin' } })
    // Public pages still open
    expect(checkRoute(page('/feed', { studentOnly: true }), unconfirmed)).toBe(true)
  })

  it('opens Profile for someone signed in and verified', () => {
    expect(checkRoute(page('/profile', { requiresAuth: true }), verified)).toBe(true)
  })
})

describe('pageTitle', () => {
  it('puts the page name before FoundIt, or just FoundIt without one', () => {
    expect(pageTitle({ meta: { title: 'Matches' } })).toBe('Matches · FoundIt')
    expect(pageTitle({ meta: {} })).toBe('FoundIt')
  })
})
