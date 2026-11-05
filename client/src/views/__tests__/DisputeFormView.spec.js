import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ TOKEN_KEY: 'foundit_token', default: { get: vi.fn(), post: vi.fn() } }))
// Cloudinary is never called in tests
vi.mock('@/services/cloudinary', () => ({
  PHOTO_HINT: 'JPG, PNG, WebP or HEIC, up to 10 MB.',
  isPhotoUploadEnabled: vi.fn(() => false),
  uploadPhoto: vi.fn(),
}))
const push = vi.fn()
// BaseButton imports RouterLink for its `to` links
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '2' } }),
  useRouter: () => ({ push }),
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}))

import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import DisputeFormView from '../DisputeFormView.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const found = {
  id: 2,
  type: 'found',
  postedBy: 9,
  title: 'White AirPods Pro case',
  category: 'Earphones',
}
const claimed = {
  item: found,
  state: 'claimed',
  timeline: [
    { event: 'reported', at: '2026-10-14T01:00:00Z' },
    { event: 'claimed', at: '2026-10-14T04:02:00Z' },
  ],
}

// The server already filters the lost reports by person and category
async function mountForm({
  record = claimed,
  lostReports = [],
  mine = [],
  claims = [],
  role = 'user',
} = {}) {
  api.get.mockImplementation(async (url) => {
    if (url === '/items/2/record') return { data: record }
    if (url === '/items') return { data: lostReports }
    if (url === '/disputes/mine') return { data: mine }
    if (url === '/claims/mine') return { data: claims }
    return { data: [] }
  })
  useAuthStore().user = { id: 6, role, emailVerifiedAt: '2026-10-01T00:00:00Z' }
  const wrapper = mount(DisputeFormView, {
    global: { stubs: { RouterLink: true, AppHeader: true } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

describe('DisputeFormView', () => {
  it('asks for a lost report first when the user has none in this category', async () => {
    const wrapper = await mountForm()
    expect(api.get).toHaveBeenCalledWith('/items', {
      params: { type: 'lost', status: 'open', postedBy: 6, category: 'Earphones' },
    })
    expect(byTestId(wrapper, 'dispute-no-report').exists()).toBe(true)
    expect(byTestId(wrapper, 'dispute-form').exists()).toBe(false)
    // The lost report is asked to bring them back to this form afterwards
    const button = wrapper
      .findAllComponents(BaseButton)
      .find((entry) => entry.attributes('data-testid') === 'dispute-report-lost')
    expect(button.props('to')).toEqual({
      path: '/report/lost',
      query: { redirect: '/items/2/dispute' },
    })
  })

  it('explains that admins decide disputes instead of showing the form', async () => {
    const wrapper = await mountForm({ role: 'admin' })
    expect(byTestId(wrapper, 'dispute-blocked').text()).toContain('Admins decide disputes')
    expect(byTestId(wrapper, 'dispute-no-report').exists()).toBe(false)
  })

  it('shows the lost report the server will attach: the newest one from before the claim', async () => {
    const wrapper = await mountForm({
      lostReports: [
        { id: 7, title: 'AirPods (after the claim)', createdAt: '2026-10-15T00:00:00Z' },
        { id: 5, title: 'White AirPods Pro', createdAt: '2026-10-13T00:00:00Z' },
      ],
    })
    expect(byTestId(wrapper, 'dispute-attached').text()).toContain('White AirPods Pro')
    expect(byTestId(wrapper, 'dispute-attached').text()).toContain('Your report · 0005')
  })

  it('says the handoff pauses, or that the case reopens once returned', async () => {
    const report = [{ id: 5, title: 'AirPods', createdAt: '2026-10-13T00:00:00Z' }]
    let wrapper = await mountForm({ lostReports: report })
    expect(byTestId(wrapper, 'dispute-banner').text()).toBe(
      'The handoff pauses while this is open.',
    )

    const now = new Date().toISOString()
    const returned = {
      ...claimed,
      state: 'returned',
      timeline: [
        ...claimed.timeline,
        { event: 'handed_over', at: now },
        { event: 'returned', at: now },
      ],
    }
    wrapper = await mountForm({ record: returned, lostReports: report })
    expect(byTestId(wrapper, 'dispute-banner').text()).toBe('Case reopens.')
  })

  it('explains instead of showing the form when the item cannot be disputed', async () => {
    let wrapper = await mountForm({ record: { ...claimed, item: { ...found, postedBy: 6 } } })
    expect(byTestId(wrapper, 'dispute-blocked').text()).toContain('You reported finding this item')
    expect(byTestId(wrapper, 'dispute-form').exists()).toBe(false)

    wrapper = await mountForm({ record: { ...claimed, state: 'open' } })
    expect(byTestId(wrapper, 'dispute-blocked').text()).toContain('Nobody has claimed')
  })

  it('tells the claimer they cannot dispute their own claim, and links to their chat', async () => {
    const report = [{ id: 5, title: 'AirPods', createdAt: '2026-10-13T00:00:00Z' }]
    const wrapper = await mountForm({
      lostReports: report,
      claims: [{ matchId: 21, claimStatus: 'active', foundItem: { id: 2 } }],
    })
    expect(byTestId(wrapper, 'dispute-blocked').text()).toContain('You claimed this item')
    expect(byTestId(wrapper, 'dispute-form').exists()).toBe(false)
    const chat = wrapper
      .findAllComponents(BaseButton)
      .find((entry) => entry.attributes('data-testid') === 'dispute-own-chat')
    expect(chat.props('to')).toBe('/matches/21/handoff')
  })

  it('still shows the form when their own claim on the item was declined', async () => {
    const report = [{ id: 5, title: 'AirPods', createdAt: '2026-10-13T00:00:00Z' }]
    const wrapper = await mountForm({
      lostReports: report,
      claims: [{ matchId: 21, claimStatus: 'declined', foundItem: { id: 2 } }],
    })
    expect(byTestId(wrapper, 'dispute-blocked').exists()).toBe(false)
    expect(byTestId(wrapper, 'dispute-form').exists()).toBe(true)
  })

  it('points to My disputes when they already have one waiting about this item', async () => {
    const wrapper = await mountForm({
      lostReports: [{ id: 5, title: 'AirPods', createdAt: '2026-10-13T00:00:00Z' }],
      mine: [{ id: 141, itemId: 2, status: 'open', createdAt: '2026-10-15T00:00:00Z' }],
    })
    expect(byTestId(wrapper, 'dispute-already').exists()).toBe(true)
    expect(byTestId(wrapper, 'dispute-form').exists()).toBe(false)
  })

  it('sends the dispute and opens My disputes', async () => {
    api.post.mockResolvedValue({ data: { id: 141 } })
    const wrapper = await mountForm({
      lostReports: [{ id: 5, title: 'White AirPods Pro', createdAt: '2026-10-13T00:00:00Z' }],
      // A decided dispute about the same item does not block a new one
      mine: [{ id: 99, itemId: 2, status: 'closed', createdAt: '2026-10-01T00:00:00Z' }],
    })
    await byTestId(wrapper, 'dispute-description').setValue(
      '  Engraved WL and a heart on the back  ',
    )
    await byTestId(wrapper, 'dispute-form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/disputes', {
      itemId: 2,
      description: 'Engraved WL and a heart on the back',
      proofUrl: undefined,
    })
    expect(push).toHaveBeenCalledWith({ path: '/disputes', query: { sent: '1' } })
  })

  it('shows the API message when the server refuses', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'You claimed this item' } } })
    const wrapper = await mountForm({
      lostReports: [{ id: 5, title: 'AirPods', createdAt: '2026-10-13T00:00:00Z' }],
    })
    await byTestId(wrapper, 'dispute-description').setValue('Mine')
    await byTestId(wrapper, 'dispute-form').trigger('submit')
    await flushPromises()
    expect(byTestId(wrapper, 'dispute-error').text()).toBe('You claimed this item')
  })

  it('shows the API message when the item cannot be loaded', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Item not found' } } })
    useAuthStore().user = { id: 6 }
    const wrapper = mount(DisputeFormView, {
      global: { stubs: { RouterLink: true, AppHeader: true } },
    })
    await flushPromises()
    expect(byTestId(wrapper, 'dispute-error').text()).toBe('Item not found')
  })
})
