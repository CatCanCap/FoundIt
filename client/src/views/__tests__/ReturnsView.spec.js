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
import { useHandoffsStore } from '@/stores/handoffs'
import ReturnsView from '../ReturnsView.vue'

const phone = { id: 95, title: 'red iphone', category: 'Phone', photoUrl: null }
const bottle = { id: 94, title: 'Blue Iphone 17', category: 'Phone', photoUrl: null }
const row = (matchId, fields = {}) => ({
  matchId,
  role: 'finder',
  claimStatus: 'active',
  matchStatus: 'claimed',
  claimedAt: '2026-10-23T14:57:00Z',
  handoff: null,
  foundItem: phone,
  lastMessage: null,
  ...fields,
})

// As in Guiyun's screenshot: red iphone three times (1 open, 2 declined)
const rows = [
  row(3, { lastMessage: { sentAt: '2026-10-23T15:00:00Z', fromMe: false } }),
  row(2, { claimStatus: 'declined', matchStatus: 'rejected', claimedAt: '2026-10-23T14:32:00Z' }),
  row(1, { claimStatus: 'declined', matchStatus: 'rejected', claimedAt: '2026-10-23T14:19:00Z' }),
  row(4, { foundItem: bottle, handoff: { status: 'pending' }, claimedAt: '2026-10-23T13:44:00Z' }),
  row(6, {
    role: 'owner',
    foundItem: { id: 60, title: 'Black umbrella', category: 'Umbrella' },
    matchStatus: 'confirmed',
    handoff: { status: 'completed' },
    claimedAt: '2026-10-20T10:00:00Z',
  }),
]

const foundItems = [
  { ...phone, type: 'found', status: 'matched', createdAt: '2026-10-23T12:00:00Z' },
  { ...bottle, type: 'found', status: 'matched', createdAt: '2026-10-23T11:00:00Z' },
  {
    id: 90,
    title: 'Grey hoodie',
    category: 'Other',
    type: 'found',
    status: 'open',
    createdAt: '2026-10-22T11:00:00Z',
  },
]

async function mountPage(path = '/returns') {
  api.get.mockImplementation(async (url) => {
    if (url === '/claims/mine') return { data: rows }
    if (url === '/items') return { data: foundItems }
    return { data: { reports: [] } }
  })
  const auth = useAuthStore()
  auth.token = 'abc'
  auth.user = { id: 1, name: 'Ben', role: 'user' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:rest(.*)', component: ReturnsView }],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(ReturnsView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const all = (wrapper, id) => wrapper.findAll(`[data-testid="${id}"]`)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('ReturnsView, Claims and chats', () => {
  it('updates while it is open, whenever the shared check (and the badge) does', async () => {
    const { wrapper } = await mountPage()
    expect(all(wrapper, 'handoff-group')).toHaveLength(2)
    // The 15-second check finds a new claim on another find
    const handoffs = useHandoffsStore()
    handoffs.rows = [
      ...rows,
      row(7, { foundItem: { id: 70, title: 'Grey laptop sleeve', category: 'Bag' } }),
    ]
    await flushPromises()
    const titles = all(wrapper, 'handoff-group').map((group) =>
      group.find('.handoffs__title').text(),
    )
    expect(titles).toContain('Grey laptop sleeve')
  })

  it('opens the chat from anywhere on the row, not only the small link', async () => {
    const { wrapper } = await mountPage()
    const link = all(wrapper, 'handoff-row')[0].find('a')
    expect(link.classes()).toContain('stretched-link')
  })

  it('is called Returns, and opens on Open: only live claims, one row per item', async () => {
    const { wrapper } = await mountPage()
    expect(byTestId(wrapper, 'returns-title').text()).toBe('Your returns')
    expect(byTestId(wrapper, 'filter-open').attributes('aria-pressed')).toBe('true')
    const groups = all(wrapper, 'handoff-group')
    // red iphone once (not three times) and Blue Iphone 17; the returned umbrella is not open
    expect(groups.map((group) => group.find('.handoffs__title').text())).toEqual([
      expect.stringContaining('red iphone'),
      'Blue Iphone 17',
    ])
    expect(groups[0].text()).toContain('Check the claim')
    expect(groups[0].find('[data-testid="handoff-new"]').exists()).toBe(true)
  })

  it('folds the declined claims into "Declined (2)", opened on a tap', async () => {
    const { wrapper } = await mountPage()
    const iphone = all(wrapper, 'handoff-group')[0]
    const toggle = iphone.find('[data-testid="handoff-fold-toggle"]')
    expect(toggle.text()).toContain('Declined (2)')
    expect(iphone.findAll('[data-testid="handoff-past-row"]')).toHaveLength(0)
    await toggle.trigger('click')
    const past = iphone.findAll('[data-testid="handoff-past-row"]')
    expect(past).toHaveLength(2)
    expect(past[0].text()).toContain('Declined')
    expect(past[0].find('a').attributes('href')).toBe('/matches/2/handoff')
  })

  it('counts each filter and switches between them through the address bar', async () => {
    const { wrapper, router } = await mountPage()
    const count = (key) => byTestId(wrapper, `filter-${key}`).find('.badge').text()
    expect([
      count('open'),
      count('declined'),
      count('closed'),
      count('resolved'),
      count('all'),
    ]).toEqual(['2', '1', '0', '1', '3'])

    await byTestId(wrapper, 'filter-resolved').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.show).toBe('resolved')
    expect(all(wrapper, 'handoff-group').map((g) => g.text())).toEqual([
      expect.stringContaining('Black umbrella'),
    ])

    await byTestId(wrapper, 'filter-declined').trigger('click')
    await flushPromises()
    const groups = all(wrapper, 'handoff-group')
    expect(groups).toHaveLength(1)
    // Under Declined the folded claims are shown straight away
    expect(groups[0].findAll('[data-testid="handoff-past-row"]')).toHaveLength(2)

    await byTestId(wrapper, 'filter-closed').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'handoffs-empty').text()).toContain('No closed claims')
  })

  it('clears New on an old claim once you tap See why', async () => {
    rows[1].lastMessage = { sentAt: '2026-10-23T14:40:00Z', fromMe: false }
    try {
      const { wrapper } = await mountPage('/returns?show=declined')
      const old = () =>
        all(wrapper, 'handoff-past-row').find((entry) =>
          entry.find('a').attributes('href').includes('/matches/2/'),
        )
      expect(old().find('[data-testid="handoff-new"]').exists()).toBe(true)
      await old().find('[data-testid="handoff-why"]').trigger('click')
      await flushPromises()
      expect(useHandoffsStore().seen[2]).toBe('2026-10-23T14:40:00Z')
    } finally {
      rows[1].lastMessage = null
    }
  })

  it('lets the arrow close and reopen the dropdowns under Declined and Closed', async () => {
    const { wrapper } = await mountPage('/returns?show=declined')
    const group = () => all(wrapper, 'handoff-group')[0]
    const pastRows = () => group().findAll('[data-testid="handoff-past-row"]')
    const toggle = () => group().find('[data-testid="handoff-fold-toggle"]')
    // Starts open under Declined
    expect(pastRows()).toHaveLength(2)
    expect(toggle().attributes('aria-expanded')).toBe('true')
    await toggle().trigger('click')
    expect(pastRows()).toHaveLength(0)
    expect(toggle().attributes('aria-expanded')).toBe('false')
    await toggle().trigger('click')
    expect(pastRows()).toHaveLength(2)
  })

  it('also closes again under the other filters', async () => {
    const { wrapper } = await mountPage()
    const group = () => all(wrapper, 'handoff-group')[0]
    const toggle = () => group().find('[data-testid="handoff-fold-toggle"]')
    await toggle().trigger('click')
    expect(group().findAll('[data-testid="handoff-past-row"]')).toHaveLength(2)
    await toggle().trigger('click')
    expect(group().findAll('[data-testid="handoff-past-row"]')).toHaveLength(0)
  })

  it('sends See why on a claim closed by a dispute to the dispute', async () => {
    rows.push(
      row(7, {
        role: 'owner',
        claimStatus: 'overturned',
        matchStatus: 'rejected',
        foundItem: { id: 40, title: 'Black Coach wallet', category: 'Wallet' },
        claimedAt: '2026-10-25T08:22:00Z',
      }),
    )
    try {
      const { wrapper } = await mountPage('/returns?show=closed')
      const why = all(wrapper, 'handoff-why').map((link) => link.attributes('href'))
      expect(why).toContain('/disputes')
    } finally {
      rows.pop()
    }
  })

  it('opens the filter named in the address', async () => {
    const { wrapper } = await mountPage('/returns?show=all')
    expect(all(wrapper, 'handoff-group')).toHaveLength(3)
  })
})

describe('ReturnsView, Things you found', () => {
  it('lists everything you handed in, claimed or not, with what it is up to', async () => {
    const { wrapper, router } = await mountPage()
    expect(api.get).not.toHaveBeenCalledWith('/items', expect.anything())
    await byTestId(wrapper, 'tab-found').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('found')
    expect(api.get).toHaveBeenCalledWith('/items', {
      params: { type: 'found', postedBy: 1, limit: 200 },
    })
    const found = all(wrapper, 'found-row')
    expect(found).toHaveLength(3)
    expect(found[0].text()).toContain('Check the claim')
    expect(found[0].text()).toContain('2 claims declined')
    expect(found[0].find('a').attributes('href')).toBe('/matches/3/handoff')
    // Not claimed yet: it shows anyway, and links to its item page
    expect(found[2].text()).toContain('Grey hoodie')
    expect(found[2].text()).toContain('Waiting for its owner')
    expect(found[2].find('a').attributes('href')).toBe('/items/90/record')
  })

  it('says so when nothing has been handed in', async () => {
    foundItems.splice(0)
    try {
      const { wrapper } = await mountPage('/returns?tab=found')
      expect(byTestId(wrapper, 'found-empty').text()).toContain('not handed anything in')
    } finally {
      foundItems.push(
        { ...phone, type: 'found', status: 'matched', createdAt: '2026-10-23T12:00:00Z' },
        { ...bottle, type: 'found', status: 'matched', createdAt: '2026-10-23T11:00:00Z' },
        {
          id: 90,
          title: 'Grey hoodie',
          category: 'Other',
          type: 'found',
          status: 'open',
          createdAt: '2026-10-22T11:00:00Z',
        },
      )
    }
  })
})

describe('ReturnsView, shared with the header', () => {
  it('drops the New message marker once the chat was seen', async () => {
    // Seen marks are kept per person, so Ben is logged in first
    useAuthStore().user = { id: 1, name: 'Ben', role: 'user' }
    useHandoffsStore().markSeen(3, '2026-10-23T15:00:00Z')
    const { wrapper } = await mountPage()
    expect(byTestId(wrapper, 'handoff-new').exists()).toBe(false)
    expect(useHandoffsStore().rows).toHaveLength(5)
  })
})
