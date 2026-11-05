import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { get: vi.fn(), post: vi.fn() },
}))

import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import ItemPageView from '../ItemPageView.vue'
import { noteCardTap } from '@/utils/item-morph'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

const spots = [
  { id: 9, building: 'Administration Building', floor: 'Level 1', area: 'lobby security counter' },
]
const reported = { event: 'reported', at: '2026-10-22T11:03:00Z' }
const claimed = { event: 'claimed', at: '2026-10-22T12:00:00Z' }
const handed = { event: 'handed_over', at: '2026-10-22T13:00:00Z' }

function record(state, { timeline = [reported], photoUrl = null, type = 'found' } = {}) {
  return {
    state,
    disputeOpen: state === 'disputed',
    timeline,
    item: {
      id: 110,
      type,
      title: 'meta logo',
      category: 'Wallet',
      colour: 'Black',
      photoUrl,
      postedBy: 3,
      createdAt: '2026-10-22T11:03:00Z',
      trail: [{ spotId: 9, from: '2026-10-22T11:02:00Z', to: '2026-10-22T11:02:00Z' }],
    },
  }
}

async function mountPage(data, { user = null, claims = [], reports = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/spots') return Promise.resolve({ data: spots })
    if (url === '/claims/mine') return Promise.resolve({ data: claims })
    if (url === '/matches/mine') return Promise.resolve({ data: { reports } })
    return Promise.resolve({ data })
  })
  const auth = useAuthStore()
  if (user) {
    auth.token = 'abc'
    auth.user = user
  }
  const blank = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/items/:id/record', component: ItemPageView },
      { path: '/:rest(.*)', component: blank },
    ],
  })
  router.push('/items/110/record')
  await router.isReady()
  const wrapper = mount(ItemPageView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('ItemPageView', () => {
  it('says where and when it was found are private when the server left them out', async () => {
    const data = record('open')
    data.item = {
      ...data.item,
      placeHidden: true,
      trail: [{ spotId: null, roomId: null, from: null, to: null }],
    }
    const { wrapper } = await mountPage(data)
    expect(byTestId(wrapper, 'record-place-hidden').text()).toContain('Place hidden')
    expect(wrapper.text()).not.toContain('Unknown place')
    expect(wrapper.text()).not.toContain('Administration')
  })

  it('shows where it was found when the server sent it', async () => {
    const { wrapper } = await mountPage(record('open'))
    expect(byTestId(wrapper, 'record-place-hidden').exists()).toBe(false)
    expect(wrapper.text()).toContain('Found at')
  })

  it('goes back to the feed as it was left, its Lost side and search included', async () => {
    window.history.replaceState({ back: '/feed?type=lost&q=bag' }, '')
    const { wrapper } = await mountPage(record('open'))
    expect(byTestId(wrapper, 'record-back').attributes('href')).toBe('/feed?type=lost&q=bag')
    // From any other page it opens the feed
    window.history.replaceState({ back: '/matches' }, '')
    const other = await mountPage(record('open'))
    expect(byTestId(other.wrapper, 'record-back').attributes('href')).toBe('/feed')
    window.history.replaceState(null, '')
  })

  it('shows the category drawing where the photo goes, and links back to the feed', async () => {
    const { wrapper } = await mountPage(record('open'))
    expect(api.get).toHaveBeenCalledWith('/items/110/record')
    expect(byTestId(wrapper, 'record-icon').attributes('data-icon')).toBe('wallet')
    expect(wrapper.find('.item-page__picture img').exists()).toBe(false)
    expect(byTestId(wrapper, 'record-back').attributes('href')).toBe('/feed')
    // The arrow is an icon now, hidden from screen readers
    expect(byTestId(wrapper, 'record-back').text()).toBe('Back')
    expect(byTestId(wrapper, 'record-title').text()).toBe('meta logo')
    expect(wrapper.text()).toContain('Admin Bldg, Level 1 · Lobby Security Counter')
    expect(wrapper.text()).toContain('Wallet, black')
    expect(wrapper.text()).toContain('Hidden for privacy')
  })

  it('shows the photo in the same space when there is one', async () => {
    const { wrapper } = await mountPage(record('open', { photoUrl: 'https://img.test/b.jpg' }))
    expect(wrapper.find('.item-page__picture img').attributes('src')).toBe('https://img.test/b.jpg')
    expect(byTestId(wrapper, 'record-icon').exists()).toBe(false)
  })

  it('asks "Is this yours?", and sends someone without a match to report it lost (V13a)', async () => {
    const { wrapper } = await mountPage(record('open'), { user: { id: 6, role: 'user' } })
    expect(byTestId(wrapper, 'record-box').text()).toContain('Is this yours?')
    await byTestId(wrapper, 'record-claim').trigger('click')
    expect(byTestId(wrapper, 'record-no-match').text()).toContain('Report what you lost first')
  })

  it('goes to the claim page when one of your lost reports matched it', async () => {
    const reports = [{ matches: [{ id: 44, status: 'suggested', item: { id: 110 } }] }]
    const { wrapper, router } = await mountPage(record('open'), {
      user: { id: 6, role: 'user' },
      reports,
    })
    await byTestId(wrapper, 'record-claim').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/matches/44/claim')
  })

  it('asks a logged-out visitor to sign in to claim, and sends them to log in first', async () => {
    const { wrapper, router } = await mountPage(record('open'))
    expect(byTestId(wrapper, 'record-claim').text()).toContain('Sign in to claim')
    await byTestId(wrapper, 'record-claim').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('shows "Matched with someone" and the dispute button to others (V13)', async () => {
    const { wrapper } = await mountPage(record('claimed', { timeline: [reported, claimed] }), {
      user: { id: 6, role: 'user' },
    })
    expect(byTestId(wrapper, 'record-box').text()).toContain('Matched with someone')
    expect(byTestId(wrapper, 'record-dispute').exists()).toBe(true)
    const dots = byTestId(wrapper, 'return-track').findAll('li')
    expect(dots.map((dot) => dot.attributes('data-state'))).toEqual([
      'done',
      'done',
      'current',
      'todo',
    ])
  })

  it('gives the people in the handoff their chat instead of the dispute button', async () => {
    const claims = [{ matchId: 10, foundItem: { id: 110 } }]
    const { wrapper } = await mountPage(record('claimed', { timeline: [reported, claimed] }), {
      user: { id: 6, role: 'user' },
      claims,
    })
    expect(byTestId(wrapper, 'record-chat').attributes('href')).toBe('/matches/10/handoff')
    expect(byTestId(wrapper, 'record-dispute').exists()).toBe(false)
  })

  // From the review: declined, then someone else claimed it
  it('gives someone whose claim was declined the dispute button, not their closed chat', async () => {
    const claims = [{ matchId: 10, foundItem: { id: 110 }, claimStatus: 'declined', role: 'owner' }]
    const { wrapper } = await mountPage(record('claimed', { timeline: [reported, claimed] }), {
      user: { id: 6, role: 'user' },
      claims,
    })
    expect(byTestId(wrapper, 'record-chat').exists()).toBe(false)
    expect(byTestId(wrapper, 'record-dispute').exists()).toBe(true)
  })

  it('says when it was handed over (V13c)', async () => {
    const { wrapper } = await mountPage(
      record('claimed', { timeline: [reported, claimed, handed] }),
      { user: { id: 6, role: 'user' } },
    )
    expect(byTestId(wrapper, 'record-box').text()).toContain('Handed over on 22 Oct, 21:00')
  })

  it('opens the dispute form; no history list or feed number card, only the dots', async () => {
    const { wrapper, router } = await mountPage(
      record('claimed', { timeline: [reported, claimed] }),
      { user: { id: 6, role: 'user' } },
    )
    expect(byTestId(wrapper, 'record-timeline').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Item record')
    expect(byTestId(wrapper, 'return-track').text()).toContain('22 Oct, 20:00')
    expect(byTestId(wrapper, 'record-report-open').exists()).toBe(true)
    await byTestId(wrapper, 'record-dispute').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/items/110/dispute')
  })

  it('reports a fake post', async () => {
    const { wrapper } = await mountPage(record('open'), { user: { id: 6, role: 'user' } })
    api.post.mockResolvedValue({ data: {} })
    await byTestId(wrapper, 'record-report-open').trigger('click')
    await byTestId(wrapper, 'record-report-reason').setValue(' Fake post ')
    await byTestId(wrapper, 'record-report-form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/reports', { itemId: 110, reason: 'Fake post' })
    expect(byTestId(wrapper, 'record-report-done').exists()).toBe(true)
  })

  it('tells the finder it is theirs, with no claim button', async () => {
    const { wrapper } = await mountPage(record('open'), { user: { id: 3, role: 'user' } })
    expect(byTestId(wrapper, 'record-box').text()).toContain('You found this')
    expect(byTestId(wrapper, 'record-claim').exists()).toBe(false)
    expect(byTestId(wrapper, 'record-report-open').exists()).toBe(false)
  })

  it('tells the people in a dispute how it was decided', async () => {
    const upheld = { event: 'dispute_upheld', at: '2026-10-22T14:00:00Z' }
    const { wrapper } = await mountPage(
      record('returned', { timeline: [reported, claimed, handed, upheld] }),
      { user: { id: 3, role: 'user' } },
    )
    expect(byTestId(wrapper, 'record-decision').text()).toContain(
      'An admin gave it to the person who disputed the claim',
    )
    // Nobody else is sent the dispute, so nothing shows
    const plain = await mountPage(record('returned', { timeline: [reported, claimed, handed] }))
    expect(byTestId(plain.wrapper, 'record-decision').exists()).toBe(false)
  })

  it('shows the API error, still with the way back', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Item not found' } } })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/items/:id/record', component: ItemPageView },
        { path: '/feed', component: { template: '<div />' } },
      ],
    })
    router.push('/items/110/record')
    await router.isReady()
    const wrapper = mount(ItemPageView, { global: { plugins: [router] } })
    await flushPromises()
    expect(byTestId(wrapper, 'record-error').text()).toContain('Item not found')
    expect(byTestId(wrapper, 'record-back').exists()).toBe(true)
    // Not a dead end: links to go on from here
    expect(byTestId(wrapper, 'record-error').find('a[href="/feed"]').exists()).toBe(true)
  })

  it('shows the picture of the card that opened it while the rest loads', async () => {
    noteCardTap({ button: 0 }, '/items/110/record', document.body, {
      title: 'Navy flask',
      category: 'Water Bottle',
      photoUrl: 'https://example.com/flask.jpg',
      tone: '',
    })
    api.get.mockImplementation(() => new Promise(() => {}))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/items/:id/record', component: ItemPageView }],
    })
    router.push('/items/110/record')
    await router.isReady()
    const wrapper = mount(ItemPageView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-morph-target] img').attributes('src')).toBe(
      'https://example.com/flask.jpg',
    )
    expect(wrapper.find('[role="status"]').text()).toBe('Loading the item…')
    expect(byTestId(wrapper, 'record-title').exists()).toBe(false)
  })

  it('keeps a grey space for the picture when no card opened it', async () => {
    api.get.mockImplementation(() => new Promise(() => {}))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/items/:id/record', component: ItemPageView }],
    })
    router.push('/items/110/record')
    await router.isReady()
    const wrapper = mount(ItemPageView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('[data-morph-target] .ds-skeleton').exists()).toBe(true)
  })
})
