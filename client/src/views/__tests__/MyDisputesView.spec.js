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
const route = { query: {} }
// BaseButton imports RouterLink for its `to` links
vi.mock('vue-router', () => ({
  useRoute: () => route,
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
}))

import api from '@/api'
import { useDisputesStore } from '@/stores/disputes'
import MyDisputesView from '../MyDisputesView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

const record = {
  item: { id: 2, type: 'found', title: 'White AirPods Pro case' },
  state: 'disputed',
  timeline: [{ event: 'claimed', at: '2026-10-14T04:02:00Z' }],
}
const openOnMyClaim = {
  id: 141,
  itemId: 2,
  status: 'open',
  createdAt: '2026-10-15T00:00:00Z',
  claimDetail: 'Plain white case',
  claimerResponse: null,
}

// The API sends each dispute with its item, and a dispute on your claim with
// when you claimed it
const withItem = (dispute) => ({ item: record.item, ...dispute })
const onClaim = (dispute) => ({ claimedAt: '2026-10-14T04:02:00Z', ...withItem(dispute) })

async function mountPage({ mine = [], onMyClaims = [] } = {}) {
  api.get.mockImplementation(async (url) => {
    if (url === '/disputes/mine') return { data: mine.map(withItem) }
    if (url === '/disputes/on-my-claims') return { data: onMyClaims.map(onClaim) }
    return { data: [] }
  })
  const wrapper = mount(MyDisputesView, {
    global: { stubs: { RouterLink: true, AppHeader: true } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
  route.query = {}
})

describe('MyDisputesView', () => {
  it('names each item from the dispute itself, without fetching every item record', async () => {
    await mountPage({ onMyClaims: [openOnMyClaim], mine: [{ ...openOnMyClaim, id: 9 }] })
    const asked = api.get.mock.calls.map(([url]) => url)
    expect(asked).toEqual(['/disputes/mine', '/disputes/on-my-claims'])
  })

  it('says when an item is no longer listed', async () => {
    api.get.mockImplementation(async (url) => ({
      data: url === '/disputes/mine' ? [{ ...openOnMyClaim, id: 9, item: null }] : [],
    }))
    const wrapper = mount(MyDisputesView, {
      global: { stubs: { RouterLink: true, AppHeader: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('An item that is no longer listed')
  })

  it('labels the page as part of the account, in plain words', async () => {
    const wrapper = await mountPage({ onMyClaims: [openOnMyClaim] })
    expect(wrapper.text()).not.toContain('My reports')
    expect(wrapper.text()).not.toContain('Claimer responds to a dispute')
    expect(byTestId(wrapper, 'claim-dispute-item').attributes('to')).toBe('/items/2/record')
  })

  it('tells a claimer who has the item to bring it back, and a disputer who must', async () => {
    const decided = {
      ...openOnMyClaim,
      status: 'upheld',
      decidedAt: '2026-10-16T00:00:00Z',
      decisionReason: 'The engraving matches',
      returnBy: '2026-10-19T00:00:00Z',
    }
    const raised = {
      id: 5,
      itemId: 2,
      status: 'upheld',
      createdAt: '2026-10-15T00:00:00Z',
      returnBy: '2026-10-19T00:00:00Z',
    }
    const wrapper = await mountPage({ onMyClaims: [decided], mine: [raised] })
    // Both verdicts open under their rows
    await byTestId(byTestId(wrapper, 'claim-dispute-141'), 'verdict-toggle').trigger('click')
    await byTestId(byTestId(wrapper, 'raised-dispute-5'), 'verdict-toggle').trigger('click')
    expect(byTestId(wrapper, 'claim-dispute-return').text()).toContain('You have the item')
    expect(byTestId(wrapper, 'raised-dispute-return').text()).toContain(
      'The person who had it must bring it',
    )
  })

  it('says so when there are no disputes either way', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('Nobody has disputed your claims.')
    expect(wrapper.text()).toContain('You have not disputed any claims.')
  })

  it('confirms a dispute that was just sent', async () => {
    route.query = { sent: '1' }
    const wrapper = await mountPage()
    expect(byTestId(wrapper, 'disputes-sent').exists()).toBe(true)
  })

  it('shows an open dispute on my claim with when I claimed the item', async () => {
    const wrapper = await mountPage({ onMyClaims: [openOnMyClaim] })
    const card = byTestId(wrapper, 'claim-dispute-141')
    expect(card.text()).toContain('Someone else says')
    expect(card.text()).toContain('Plain white case')
    expect(card.text()).toContain('White AirPods Pro case')
    expect(card.text()).toContain('You claimed it')
  })

  it('sends my side', async () => {
    api.post.mockResolvedValue({ data: {} })
    const wrapper = await mountPage({ onMyClaims: [openOnMyClaim] })
    await byTestId(wrapper, 'dispute-response').setValue('  Scratch under the hinge  ')
    await wrapper.find('[data-testid="claim-dispute-141"] form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/disputes/141/respond', {
      response: 'Scratch under the hinge',
      proofUrl: undefined,
    })
  })

  it('asks before withdrawing the claim', async () => {
    api.post.mockResolvedValue({ data: {} })
    const wrapper = await mountPage({ onMyClaims: [openOnMyClaim] })
    expect(byTestId(wrapper, 'dispute-withdraw').exists()).toBe(false)
    await byTestId(wrapper, 'dispute-withdraw-open').trigger('click')
    await byTestId(wrapper, 'dispute-withdraw').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/disputes/141/withdraw')
  })

  it('lists the disputes I raised, and sends me to the handoff when the item became mine', async () => {
    const wrapper = await mountPage({
      mine: [{ ...openOnMyClaim, id: 150, status: 'upheld', decisionReason: 'Engraving matches' }],
    })
    const row = byTestId(wrapper, 'raised-dispute-150')
    // The item first, with the outcome on its chip; the verdict waits for a tap
    expect(row.text()).toContain('White AirPods Pro case')
    expect(row.text()).toContain('The item is yours')
    expect(row.text()).not.toContain('Engraving matches')
    expect(byTestId(row, 'verdict-new').exists()).toBe(true)

    await byTestId(row, 'verdict-toggle').trigger('click')
    expect(byTestId(row, 'verdict-body').text()).toContain('Engraving matches')
    expect(byTestId(wrapper, 'raised-dispute-next').exists()).toBe(true)
    // Opening it clears the "New verdict" tag and the menu's count
    expect(byTestId(row, 'verdict-new').exists()).toBe(false)
    expect(useDisputesStore().unreadCount).toBe(0)
  })

  it('shows a decision on my claim only once I open it', async () => {
    const wrapper = await mountPage({
      onMyClaims: [
        {
          ...openOnMyClaim,
          id: 160,
          status: 'upheld',
          decidedAt: '2026-10-25T09:25:00Z',
          decisionReason: 'Their engraving matches',
          returnBy: '2026-10-28T09:25:00Z',
        },
      ],
    })
    const row = byTestId(wrapper, 'claim-dispute-160')
    expect(row.text()).toContain('Went to the other person')
    expect(row.text()).not.toContain('Their engraving matches')
    await byTestId(row, 'verdict-toggle').trigger('click')
    const body = byTestId(row, 'verdict-body').text()
    expect(body).toContain('Decided: the item went to the other person')
    expect(body).toContain('Their engraving matches')
    expect(body).toContain('please bring it to a collection point by')
  })

  it('opens the verdict named in the address, from the notice', async () => {
    route.query = { verdict: '150' }
    const wrapper = await mountPage({
      mine: [{ ...openOnMyClaim, id: 150, status: 'closed', decisionReason: 'Receipt matches' }],
    })
    expect(byTestId(wrapper, 'verdict-body').text()).toContain('Receipt matches')
  })

  it('shows the API message when the disputes cannot be loaded', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Log in first' } } })
    const wrapper = mount(MyDisputesView, {
      global: { stubs: { RouterLink: true, AppHeader: true } },
    })
    await flushPromises()
    expect(byTestId(wrapper, 'disputes-error').text()).toBe('Log in first')
  })

  it('says FoundIt cannot be reached when the page gets no answer, and opens it again', async () => {
    api.get.mockRejectedValue(new Error('Network Error'))
    const wrapper = mount(MyDisputesView, {
      global: { stubs: { RouterLink: true, AppHeader: true } },
    })
    await flushPromises()
    expect(byTestId(wrapper, 'disputes-load-error').text()).toContain(
      "We can't reach FoundIt right now",
    )
    expect(byTestId(wrapper, 'disputes-error').exists()).toBe(false)

    api.get.mockImplementation(async (url) => ({
      data: url === '/disputes/on-my-claims' ? [onClaim(openOnMyClaim)] : [],
    }))
    await byTestId(wrapper, 'connection-retry').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'disputes-load-error').exists()).toBe(false)
    expect(byTestId(wrapper, 'claim-dispute-141').exists()).toBe(true)
  })

  it('keeps my side typed and sends it again when sending gets no answer', async () => {
    api.post.mockRejectedValueOnce(new Error('Network Error'))
    const wrapper = await mountPage({ onMyClaims: [openOnMyClaim] })
    await byTestId(wrapper, 'dispute-response').setValue('Scratch under the hinge')
    await wrapper.find('[data-testid="claim-dispute-141"] form').trigger('submit')
    await flushPromises()
    expect(byTestId(wrapper, 'not-sent').exists()).toBe(true)
    expect(byTestId(wrapper, 'dispute-response').element.value).toBe('Scratch under the hinge')

    api.post.mockResolvedValueOnce({ data: {} })
    await byTestId(wrapper, 'not-sent-retry').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledTimes(2)
    expect(byTestId(wrapper, 'not-sent').exists()).toBe(false)
  })
})
