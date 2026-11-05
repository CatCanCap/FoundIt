import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '@/api'
import ClaimView from '../ClaimView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

const spots = [{ id: 1, building: 'LKS Library', floor: 'Level 3', area: 'quiet zone' }]
const foundItem = {
  id: 3298,
  title: 'White AirPods Pro case',
  category: 'Earbuds',
  colour: 'White',
  status: 'open',
  photoUrl: null,
  createdAt: '2026-10-14T03:24:00Z',
  trail: [{ spotId: 1, from: '2026-10-14T03:20:00Z', to: '2026-10-14T03:20:00Z' }],
}

function overview(fields = {}) {
  return {
    role: 'owner',
    match: { id: 10, status: 'suggested', score: 88, reasons: [] },
    claim: null,
    foundItem,
    lostItem: { id: 1, status: 'open' },
    handoff: null,
    disputeOpen: false,
    ...fields,
  }
}

async function mountClaim(data) {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/spots' ? spots : data }))
  const blank = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/matches/:id/claim', component: ClaimView },
      { path: '/matches/:id/handoff', component: blank },
      { path: '/:rest(.*)', component: blank },
    ],
  })
  router.push('/matches/10/claim')
  await router.isReady()
  const wrapper = mount(ClaimView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

describe('ClaimView', () => {
  it('shows the find like an item record, with "Is this yours?" (V13a)', async () => {
    const { wrapper } = await mountClaim(overview())
    expect(byTestId(wrapper, 'claim-title').text()).toBe('White AirPods Pro case')
    expect(wrapper.text()).toContain('LKS Library, Level 3 · Quiet Zone')
    expect(wrapper.text()).toContain('Earbuds, White')
    expect(wrapper.text()).toContain('Hidden for privacy')
    expect(byTestId(wrapper, 'claim-box').text()).toContain('Is this yours?')
    const track = byTestId(wrapper, 'return-track')
    expect(track.findAll('li').map((li) => li.attributes('data-state'))).toEqual([
      'done',
      'todo',
      'todo',
      'todo',
    ])
  })

  it('leaves out where and when it was found when the server kept them private', async () => {
    const hiddenTrail = [{ spotId: null, roomId: null, from: null, to: null }]
    const { wrapper } = await mountClaim(
      overview({ foundItem: { ...foundItem, placeHidden: true, trail: hiddenTrail } }),
    )
    expect(wrapper.text()).toContain('Place hidden')
    expect(wrapper.text()).not.toContain('LKS Library')
    expect(wrapper.text()).not.toContain('When')
    expect(byTestId(wrapper, 'claim-box').text()).toContain('Is this yours?')
  })

  it('claims with one detail and opens the chat', async () => {
    const { wrapper, router } = await mountClaim(overview())
    // The form is open straight away: no second "This is mine" click
    expect(byTestId(wrapper, 'claim-start').exists()).toBe(false)
    expect(byTestId(wrapper, 'claim-detail').exists()).toBe(true)

    await wrapper.find('form.claim__form').trigger('submit')
    expect(byTestId(wrapper, 'claim-send-error').text()).toContain('one detail')
    expect(api.post).not.toHaveBeenCalled()

    api.post.mockResolvedValue({ data: overview({ claim: { id: 1 } }) })
    await byTestId(wrapper, 'claim-detail').setValue('  Scratch on the lid  ')
    await wrapper.find('form.claim__form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/claims/10', { detail: 'Scratch on the lid' })
    expect(router.currentRoute.value.path).toBe('/matches/10/handoff')
  })

  it('shows the server’s reason when the claim is refused', async () => {
    const { wrapper } = await mountClaim(overview())
    api.post.mockRejectedValue({
      response: { data: { error: 'This item is no longer available to claim' } },
    })
    await byTestId(wrapper, 'claim-detail').setValue('Scratch')
    await wrapper.find('form.claim__form').trigger('submit')
    await flushPromises()
    expect(byTestId(wrapper, 'claim-send-error').text()).toBe(
      'This item is no longer available to claim',
    )
  })

  it('sends a claimed match or the finder to the handoff page', async () => {
    const claimed = await mountClaim(
      overview({ claim: { id: 1, detail: 'x' }, match: { id: 10, status: 'claimed' } }),
    )
    expect(claimed.router.currentRoute.value.path).toBe('/matches/10/handoff')
    const finder = await mountClaim(overview({ role: 'finder' }))
    expect(finder.router.currentRoute.value.path).toBe('/matches/10/handoff')
  })

  it('says when the find is no longer available', async () => {
    const { wrapper } = await mountClaim(overview({ match: { id: 10, status: 'rejected' } }))
    expect(byTestId(wrapper, 'claim-box').text()).toContain('No longer available')
    expect(byTestId(wrapper, 'claim-start').exists()).toBe(false)
  })

  // From an old email link: the form must not show before the detail is typed
  it('hides the form when someone else claimed the find through another match', async () => {
    const { wrapper } = await mountClaim(
      overview({ foundItem: { ...foundItem, status: 'matched' } }),
    )
    expect(byTestId(wrapper, 'claim-detail').exists()).toBe(false)
    expect(byTestId(wrapper, 'claim-unavailable').text()).toBe('Someone else has claimed this')
    expect(byTestId(wrapper, 'claim-box').find('a[href="/items/3298/record"]').exists()).toBe(true)
  })

  it('hides the form when the find is back with its owner, or hidden', async () => {
    const back = await mountClaim(overview({ foundItem: { ...foundItem, status: 'resolved' } }))
    expect(byTestId(back.wrapper, 'claim-detail').exists()).toBe(false)
    expect(byTestId(back.wrapper, 'claim-unavailable').text()).toBe('Already back with its owner')
    const hidden = await mountClaim(
      overview({ foundItem: { ...foundItem, hiddenAt: '2026-10-20T00:00:00Z' } }),
    )
    expect(byTestId(hidden.wrapper, 'claim-detail').exists()).toBe(false)
  })

  it('hides the form when the lost report is closed', async () => {
    const { wrapper } = await mountClaim(overview({ lostItem: { id: 1, status: 'archived' } }))
    expect(byTestId(wrapper, 'claim-detail').exists()).toBe(false)
    expect(byTestId(wrapper, 'claim-unavailable').text()).toBe('Your lost report is closed')
  })

  it('says the finder declined the claim', async () => {
    const { wrapper } = await mountClaim(
      overview({
        match: { id: 10, status: 'rejected' },
        closed: { status: 'declined', reason: 'x' },
      }),
    )
    expect(byTestId(wrapper, 'claim-unavailable').text()).toBe('The finder declined your claim')
  })

  it('shows a page that could not load with links onward', async () => {
    api.get.mockImplementation((url) =>
      url === '/spots'
        ? Promise.resolve({ data: spots })
        : Promise.reject({ response: { data: { error: 'Match not found' } } }),
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:rest(.*)', component: ClaimView }],
    })
    router.push('/matches/99999/claim')
    await router.isReady()
    const wrapper = mount(ClaimView, { global: { plugins: [router] } })
    await flushPromises()
    const problem = byTestId(wrapper, 'claim-error')
    expect(problem.text()).toContain('Match not found')
    expect(problem.find('a[href="/matches"]').exists()).toBe(true)
  })

  it('says FoundIt cannot be reached when the page gets no answer, and loads again', async () => {
    api.get.mockRejectedValue(new Error('Network Error'))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:rest(.*)', component: ClaimView }],
    })
    router.push('/matches/10/claim')
    await router.isReady()
    const wrapper = mount(ClaimView, { global: { plugins: [router] } })
    await flushPromises()
    const problem = byTestId(wrapper, 'claim-error')
    expect(problem.find('h2').text()).toBe("We can't reach FoundIt right now")
    expect(byTestId(wrapper, 'page-problem').exists()).toBe(false)

    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url === '/spots' ? spots : overview() }),
    )
    await byTestId(wrapper, 'connection-retry').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'connection-problem').exists()).toBe(false)
    expect(byTestId(wrapper, 'claim-title').text()).toBe('White AirPods Pro case')
  })

  it('keeps the detail and offers Try again when the claim gets no answer', async () => {
    const { wrapper, router } = await mountClaim(overview())
    api.post.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' })
    await byTestId(wrapper, 'claim-detail').setValue('Scratch on the lid')
    await wrapper.find('form.claim__form').trigger('submit')
    await flushPromises()
    // A timeout: the claim may have been saved, and sending again is safe
    expect(byTestId(wrapper, 'not-sent').text()).toContain(
      'No answer yet. It may have gone through',
    )
    expect(byTestId(wrapper, 'claim-send-error').exists()).toBe(false)
    expect(byTestId(wrapper, 'claim-detail').element.value).toBe('Scratch on the lid')

    api.post.mockResolvedValueOnce({ data: overview({ claim: { id: 1 } }) })
    await byTestId(wrapper, 'not-sent-retry').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenLastCalledWith('/claims/10', { detail: 'Scratch on the lid' })
    expect(router.currentRoute.value.path).toBe('/matches/10/handoff')
  })

  it('puts the claim box before the facts on phones', async () => {
    const { wrapper } = await mountClaim(overview())
    // The page reads in order on phones (wide screens move them with the grid)
    const box = byTestId(wrapper, 'claim-box').element
    const facts = wrapper.find('dl').element
    expect(box.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
