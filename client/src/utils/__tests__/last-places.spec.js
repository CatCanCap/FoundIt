import { beforeEach, describe, expect, it } from 'vitest'

import { forgetPlaces, lastPlaces, rememberPlace } from '../last-places'

const ROUTES = {
  '/': { path: '/', meta: { signedOutOnly: true }, params: {} },
  '/feed': { path: '/feed', meta: { title: 'Feed' }, params: {} },
  '/map': { path: '/map', meta: { title: 'Map' }, params: {} },
  '/matches': { path: '/matches', meta: { title: 'Matches', requiresAuth: true }, params: {} },
  '/items/7/record': { path: '/items/7/record', meta: { title: 'Item' }, params: { id: '7' } },
  '/items/9/record': { path: '/items/9/record', meta: { title: 'Item' }, params: { id: '9' } },
  '/login': { path: '/login', meta: { title: 'Sign in', authBand: true }, params: {} },
  '/design': { path: '/design', meta: {}, params: {} },
  '/nope': { path: '/nope', meta: { title: 'Page not found', noTrail: true }, params: {} },
}

// What the router gives back for an address, with any ?query kept
function route(fullPath) {
  const [path] = fullPath.split('?')
  return { ...ROUTES[path], fullPath, query: {} }
}

const visitor = { isLoggedIn: false, user: null, isVerified: false, isAdmin: false }
const student = { isLoggedIn: true, user: { id: 1 }, isVerified: true, isAdmin: false }

function visit(...addresses) {
  addresses.forEach((address) => rememberPlace(route(address)))
}

const shown = (auth = student) => lastPlaces(route, auth)

describe('last places', () => {
  beforeEach(() => forgetPlaces())

  it('starts empty, so nothing is made up for someone who came from outside', () => {
    expect(shown()).toEqual([])
  })

  it('keeps the last two pages, oldest first', () => {
    visit('/feed', '/map', '/matches')
    expect(shown()).toEqual([
      { to: '/map', label: 'Map' },
      { to: '/matches', label: 'Matches' },
    ])
  })

  it('shows one when only one page has been opened', () => {
    visit('/feed')
    expect(shown()).toEqual([{ to: '/feed', label: 'Feed' }])
  })

  it('never counts the not-found page, the sign-in pages or pages without a title', () => {
    visit('/feed', '/nope', '/login', '/design')
    expect(shown()).toEqual([{ to: '/feed', label: 'Feed' }])
  })

  it('lists a page once, however often it was opened', () => {
    visit('/feed', '/map', '/feed', '/map', '/feed')
    expect(shown()).toEqual([
      { to: '/map', label: 'Map' },
      { to: '/feed', label: 'Feed' },
    ])
  })

  it('keeps the newest filters when only the query changes', () => {
    visit('/feed?family=keys', '/feed?family=bags')
    expect(shown()).toEqual([{ to: '/feed?family=bags', label: 'Feed' }])
  })

  it('tells two pages of the same kind apart by their number', () => {
    visit('/items/7/record', '/items/9/record')
    expect(shown().map((place) => place.label)).toEqual(['Item 7', 'Item 9'])
  })

  it('calls the landing page Home', () => {
    visit('/')
    expect(shown(visitor)).toEqual([{ to: '/', label: 'Home' }])
  })

  it('leaves out pages the person could no longer open', () => {
    visit('/feed', '/matches')
    expect(shown(visitor)).toEqual([{ to: '/feed', label: 'Feed' }])
  })

  it('leaves out the landing page once signed in, as it would only redirect', () => {
    visit('/', '/feed')
    expect(shown(student)).toEqual([{ to: '/feed', label: 'Feed' }])
  })

  it('ignores a saved value that is not a page on this site', () => {
    sessionStorage.setItem('foundit-last-places', JSON.stringify(['//evil.example', 4, '/feed']))
    expect(shown()).toEqual([{ to: '/feed', label: 'Feed' }])
  })

  it('survives a saved value that is not valid', () => {
    sessionStorage.setItem('foundit-last-places', 'not json')
    expect(shown()).toEqual([])
  })

  it('forgets everything on request', () => {
    visit('/feed')
    forgetPlaces()
    expect(shown()).toEqual([])
  })
})
