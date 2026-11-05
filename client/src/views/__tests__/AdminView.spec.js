import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

const replace = vi.fn()
// Reactive, like Vue Router's own route, so a test can change the address
// while the page is open
const route = reactive({ query: {} })

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => route,
  useRouter: () => ({ replace }),
}))

import api from '@/api'
import AdminView from '../AdminView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)
const hours = (count) => new Date(Date.now() - count * 3600 * 1000).toISOString()

// 23 open disputes, oldest first, plus 2 decided ones
const disputes = [
  ...Array.from({ length: 23 }, (_, index) => ({
    id: index + 1,
    itemId: 100 + index,
    status: 'open',
    description: `Detail ${index + 1}`,
    claimerResponse: null,
    createdAt: hours(100 - index),
    decidedAt: null,
    item: { id: 100 + index, title: `Item ${index + 1}`, category: 'Phone', photoUrl: null },
    people: {
      raisedBy: { id: 1, name: index === 4 ? 'Wei Ling' : 'Ann Lee' },
      claimer: { id: 2, name: 'Daniel Tan' },
      finder: { id: 3, name: 'Marcus Lim' },
    },
  })),
  {
    id: 50,
    itemId: 150,
    status: 'closed',
    description: 'Old one',
    createdAt: hours(300),
    decidedAt: hours(200),
    item: { id: 150, title: 'Kept item', category: 'Bag', photoUrl: null },
  },
  {
    id: 51,
    itemId: 151,
    status: 'upheld',
    description: 'Newer one',
    createdAt: hours(250),
    decidedAt: hours(1),
    returnBy: hours(0.5),
    returnDone: false,
    item: { id: 151, title: 'Returned item', category: 'Bag', photoUrl: null },
  },
]

const reports = [
  {
    id: 7,
    kind: 'message',
    status: 'open',
    reason: 'Rude',
    createdAt: hours(5),
    message: { id: 3, text: 'Send me your number' },
    item: null,
  },
  {
    id: 8,
    kind: 'item',
    status: 'dismissed',
    reason: 'Spam',
    createdAt: hours(50),
    decidedAt: hours(2),
    message: null,
    item: { id: 9, title: 'Blue bottle', category: 'Water Bottle', photoUrl: null },
  },
]

const actions = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  action: 'close_dispute',
  reason: `Reason ${index + 1}`,
  createdAt: hours(index),
  admin: { name: 'FoundIt Admin' },
  user: null,
  disputeId: 50,
}))

const people = [
  {
    id: 4,
    name: 'Daniel Tan',
    email: 'daniel@smu.edu.sg',
    suspendedAt: hours(10),
    warnings: 1,
    suspensions: 1,
    lastAction: { action: 'suspend_user', reason: 'Fake claim', createdAt: hours(10) },
  },
  {
    id: 5,
    name: 'Eve Ong',
    email: 'eve@smu.edu.sg',
    suspendedAt: null,
    warnings: 2,
    suspensions: 0,
    lastAction: { action: 'warn_user', reason: 'Rude', createdAt: hours(3) },
  },
]

// One waiting appeal and one decided
const appeals = [
  {
    id: 3,
    userId: 4,
    status: 'open',
    message: 'I only asked about the bus fare.',
    suspendedAt: '2026-10-11T08:00:00.000Z',
    createdAt: '2026-10-13T08:00:00.000Z',
    suspensionReason: 'Asked for payment in chat',
    person: {
      id: 4,
      name: 'Daniel Tan',
      email: 'daniel@smu.edu.sg',
      history: { warnings: 1, suspensions: 1 },
    },
  },
  {
    id: 2,
    userId: 5,
    status: 'declined',
    message: 'It was a joke.',
    reply: 'The chat shows otherwise.',
    suspendedAt: '2026-10-01T08:00:00.000Z',
    createdAt: '2026-10-02T08:00:00.000Z',
    decidedAt: '2026-10-03T08:00:00.000Z',
    suspensionReason: 'Rude in chat',
    person: { id: 5, name: 'Eve Ong', email: 'eve@smu.edu.sg', history: {} },
  },
]

function respond() {
  api.get.mockImplementation((path) => {
    if (path === '/admin/disputes') return Promise.resolve({ data: disputes })
    if (path === '/admin/reports') return Promise.resolve({ data: reports })
    if (path === '/admin/users') return Promise.resolve({ data: people })
    if (path === '/admin/appeals') return Promise.resolve({ data: appeals })
    return Promise.resolve({ data: actions })
  })
}

async function mountAdmin() {
  const wrapper = mount(AdminView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, AppHeader: true } },
  })
  await flushPromises()
  return wrapper
}

// The tags on the rack (waiting cases) or the rows of the table (the rest)
const rowIds = (wrapper, kind) => {
  const tags = wrapper.findAll('[data-testid^="rack-tag-"]')
  const rows = tags.length ? tags : wrapper.findAll(`tbody tr[data-testid^="admin-${kind}-"]`)
  return rows.map((row) => Number(row.attributes('data-testid').split('-').pop()))
}

beforeEach(() => {
  vi.clearAllMocks()
  route.query = {}
  respond()
})

describe('AdminView', () => {
  it('loads every dispute, report and log entry, and counts what is waiting', async () => {
    const wrapper = await mountAdmin()
    expect(api.get).toHaveBeenCalledWith('/admin/disputes', { params: { status: 'all' } })
    expect(api.get).toHaveBeenCalledWith('/admin/reports', { params: { status: 'all' } })
    expect(api.get).toHaveBeenCalledWith('/admin/actions')
    expect(api.get).toHaveBeenCalledWith('/admin/users')
    expect(wrapper.find('h1').text()).toBe('23 disputes are hanging')
    expect(wrapper.find('.admin-attention').text()).toBe('24 need attention')
    expect(byTestId(wrapper, 'admin-tab-disputes').text()).toBe('Disputes 23')
  })

  it('hangs every waiting dispute on the rack, oldest first, with the first one open', async () => {
    const wrapper = await mountAdmin()
    expect(rowIds(wrapper, 'dispute')).toEqual(Array.from({ length: 23 }, (_, i) => i + 1))
    expect(byTestId(wrapper, 'list-pager').exists()).toBe(false)
    expect(byTestId(wrapper, 'rack-tag-1').text()).toContain('4 days')
    expect(byTestId(wrapper, 'rack-tag-1').attributes('aria-pressed')).toBe('true')
    expect(byTestId(wrapper, 'admin-ticket').exists()).toBe(true)
  })

  it('lists decided disputes newest first, and goes back to page 1 on a new filter', async () => {
    const wrapper = await mountAdmin()
    await byTestId(wrapper, 'toggle-decided').setValue(true)
    expect(rowIds(wrapper, 'dispute')).toEqual([51, 50])
    expect(byTestId(wrapper, 'list-pager').exists()).toBe(false)
    expect(byTestId(wrapper, 'admin-dispute-51').text()).toContain('Returned to the person')
    expect(replace).toHaveBeenLastCalledWith({ query: { show: 'decided' } })

    await byTestId(wrapper, 'toggle-all').setValue(true)
    // Everything is newest first, so the latest open dispute leads
    expect(rowIds(wrapper, 'dispute').slice(0, 2)).toEqual([23, 22])
    expect(byTestId(wrapper, 'pager-count').text()).toBe('Showing 1–10 of 25')
  })

  it('switches to the reported posts, starting again from page 1', async () => {
    const wrapper = await mountAdmin()
    await byTestId(wrapper, 'admin-tab-reports').trigger('click')
    expect(wrapper.find('h1').text()).toBe('1 report is hanging')
    expect(rowIds(wrapper, 'report')).toEqual([7])
    expect(byTestId(wrapper, 'admin-ticket').text()).toContain('Send me your number')
    expect(replace).toHaveBeenLastCalledWith({ query: { tab: 'reports' } })

    await byTestId(wrapper, 'toggle-decided').setValue(true)
    expect(rowIds(wrapper, 'report')).toEqual([8])
    expect(byTestId(wrapper, 'admin-report-8').text()).toContain('Dismissed')
  })

  it('moves between the tabs with the arrow keys', async () => {
    const wrapper = await mountAdmin()
    const disputesTab = byTestId(wrapper, 'admin-tab-disputes')
    expect(disputesTab.attributes('aria-selected')).toBe('true')
    expect(disputesTab.attributes('tabindex')).toBe('0')
    await disputesTab.trigger('keydown', { key: 'ArrowLeft' })
    expect(byTestId(wrapper, 'admin-tab-log').attributes('aria-selected')).toBe('true')
    expect(byTestId(wrapper, 'admin-tab-disputes').attributes('tabindex')).toBe('-1')
    await byTestId(wrapper, 'admin-tab-log').trigger('keydown', { key: 'Home' })
    expect(byTestId(wrapper, 'admin-tab-disputes').attributes('aria-selected')).toBe('true')
  })

  it('pages the action log too', async () => {
    const wrapper = await mountAdmin()
    await byTestId(wrapper, 'admin-tab-log').trigger('click')
    expect(wrapper.findAll('[data-testid^="admin-log-"]')).toHaveLength(10)
    await byTestId(wrapper, 'pager-next').trigger('click')
    expect(wrapper.findAll('[data-testid^="admin-log-"]')).toHaveLength(2)
    expect(byTestId(wrapper, 'admin-log-12').text()).toContain('Kept a claim')
  })

  it('opens on the tab and page in the address bar', async () => {
    route.query = { tab: 'disputes', show: 'all', page: '3' }
    const wrapper = await mountAdmin()
    expect(rowIds(wrapper, 'dispute')).toHaveLength(5)
  })

  it('never shows a page past the end of the list', async () => {
    route.query = { show: 'all', page: '9' }
    const wrapper = await mountAdmin()
    expect(rowIds(wrapper, 'dispute')).toHaveLength(5)
  })

  it('says so when nothing is waiting', async () => {
    api.get.mockResolvedValue({ data: [] })
    const wrapper = await mountAdmin()
    expect(byTestId(wrapper, 'admin-empty').text()).toBe('No disputes waiting.')
    expect(byTestId(wrapper, 'list-pager').exists()).toBe(false)
  })

  it('shows the error when the queue cannot load', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Admins only' } } })
    const wrapper = await mountAdmin()
    expect(byTestId(wrapper, 'admin-error').text()).toBe('Admins only')
    expect(wrapper.find('.admin-panel').exists()).toBe(false)
  })

  it('still shows the other lists when one of them fails', async () => {
    respond()
    const answer = api.get.getMockImplementation()
    api.get.mockImplementation((path, options) =>
      path === '/admin/actions'
        ? Promise.reject({ response: { data: { error: 'Log unavailable' } } })
        : answer(path, options),
    )
    const wrapper = await mountAdmin()
    expect(byTestId(wrapper, 'admin-error').text()).toBe('Log unavailable')
    expect(wrapper.find('.admin-panel').exists()).toBe(true)
    expect(rowIds(wrapper, 'dispute').length).toBeGreaterThan(0)
  })

  it('searches by name, item number or case code, and starts again from page 1', async () => {
    const wrapper = await mountAdmin()
    await byTestId(wrapper, 'admin-search').setValue('wei ling')
    expect(rowIds(wrapper, 'dispute')).toEqual([5])
    expect(replace).toHaveBeenLastCalledWith({ query: { q: 'wei ling' } })
    await byTestId(wrapper, 'admin-search').setValue('D-0012')
    expect(rowIds(wrapper, 'dispute')).toEqual([12])
    await byTestId(wrapper, 'admin-search').setValue('No. 103')
    expect(rowIds(wrapper, 'dispute')).toEqual([4])
    await byTestId(wrapper, 'admin-search').setValue('umbrella')
    expect(byTestId(wrapper, 'admin-empty').text()).toBe('Nothing matches “umbrella”.')
  })

  it('sorts the waiting disputes newest first on request', async () => {
    const wrapper = await mountAdmin()
    await byTestId(wrapper, 'sort-flip').trigger('click')
    expect(rowIds(wrapper, 'dispute').slice(0, 3)).toEqual([23, 22, 21])
    expect(replace).toHaveBeenLastCalledWith({ query: { sort: 'newest' } })
  })

  it('opens with the search and sort in the address bar', async () => {
    route.query = { q: 'Item 2', sort: 'newest' }
    const wrapper = await mountAdmin()
    expect(byTestId(wrapper, 'admin-search').element.value).toBe('Item 2')
    expect(rowIds(wrapper, 'dispute')[0]).toBe(23)
  })

  it('follows a new address while the page stays open', async () => {
    const wrapper = await mountAdmin()
    // A pasted /admin?tab=people
    route.query = { tab: 'people' }
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('People on record')
    expect(byTestId(wrapper, 'admin-tab-people').attributes('aria-selected')).toBe('true')

    // The header's Admin link: plain /admin, back to the waiting disputes
    route.query = {}
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('23 disputes are hanging')
    expect(rowIds(wrapper, 'dispute').slice(0, 3)).toEqual([1, 2, 3])

    // Every setting comes across, without being reset to the defaults
    route.query = { show: 'all', sort: 'oldest', q: 'Item', page: '2' }
    await flushPromises()
    expect(byTestId(wrapper, 'admin-search').element.value).toBe('Item')
    // Page 2 of all 25, oldest first: the two decided ones are older still
    expect(rowIds(wrapper, 'dispute')).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
  })

  it('keeps a half-typed search when its own address change comes back', async () => {
    const wrapper = await mountAdmin()
    await byTestId(wrapper, 'admin-search').setValue('wei ')
    expect(replace).toHaveBeenLastCalledWith({ query: { q: 'wei' } })
    route.query = { q: 'wei' }
    await flushPromises()
    expect(byTestId(wrapper, 'admin-search').element.value).toBe('wei ')
  })

  it('flags disputes that need attention, and shows the return-by date', async () => {
    const wrapper = await mountAdmin()
    expect(byTestId(wrapper, 'admin-ticket').text()).toContain('No reply in 48 h')
    await byTestId(wrapper, 'toggle-decided').setValue(true)
    const upheld = byTestId(wrapper, 'admin-dispute-51')
    expect(upheld.text()).toContain('Return-by passed')
    expect(upheld.find('[data-testid="admin-return-by"]').text()).toMatch(/^Return by \d+ \w+/)
  })

  it('lists warned and suspended people, and lifts a suspension with a reason', async () => {
    const wrapper = await mountAdmin()
    expect(byTestId(wrapper, 'admin-tab-people').text()).toBe('People 2')
    await byTestId(wrapper, 'admin-tab-people').trigger('click')
    expect(wrapper.find('h1').text()).toBe('People on record')
    const ids = wrapper
      .findAll('[data-testid^="admin-person-"]')
      .map((row) => row.attributes('data-testid'))
    // Newest action first: Eve was warned 3 h ago, Daniel suspended 10 h ago
    expect(ids).toEqual(['admin-person-5', 'admin-person-4'])
    expect(byTestId(wrapper, 'admin-person-4').text()).toContain('Suspended since')
    expect(byTestId(wrapper, 'admin-person-5').text()).toContain('2 warnings')
    expect(byTestId(wrapper, 'people-unsuspend-5').exists()).toBe(false)

    await byTestId(wrapper, 'people-unsuspend-4').trigger('click')
    await byTestId(wrapper, 'people-form-4').trigger('submit')
    expect(byTestId(wrapper, 'people-error').text()).toMatch(/Give a reason/)
    expect(api.post).not.toHaveBeenCalled()

    api.post.mockResolvedValue({ data: {} })
    await byTestId(wrapper, 'people-reason').setValue('Appeal accepted')
    await byTestId(wrapper, 'people-form-4').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/admin/users/4/unsuspend', {
      reason: 'Appeal accepted',
    })
    expect(byTestId(wrapper, 'admin-notice').text()).toBe("Daniel Tan's suspension was lifted.")
    expect(api.get.mock.calls.filter(([path]) => path === '/admin/users')).toHaveLength(2)
  })

  it('filters people to the suspended ones', async () => {
    const wrapper = await mountAdmin()
    await byTestId(wrapper, 'admin-tab-people').trigger('click')
    await byTestId(wrapper, 'toggle-suspended').setValue(true)
    expect(wrapper.findAll('[data-testid^="admin-person-"]')).toHaveLength(1)
    expect(replace).toHaveBeenLastCalledWith({ query: { tab: 'people', show: 'suspended' } })
  })

  it('says nobody is suspended, not that nobody was warned, when only warnings exist', async () => {
    // Only Eve, who was warned and never suspended
    const users = api.get.getMockImplementation()
    api.get.mockImplementation((path) =>
      path === '/admin/users' ? Promise.resolve({ data: [people[1]] }) : users(path),
    )
    const wrapper = await mountAdmin()
    await byTestId(wrapper, 'admin-tab-people').trigger('click')
    await byTestId(wrapper, 'toggle-suspended').setValue(true)
    expect(byTestId(wrapper, 'admin-empty').text()).toBe('Nobody is suspended.')
  })

  it('hangs waiting appeals on the rack and decides one from its ticket', async () => {
    const wrapper = await mountAdmin()
    expect(byTestId(wrapper, 'admin-tab-appeals').text()).toBe('Appeals 1')
    await byTestId(wrapper, 'admin-tab-appeals').trigger('click')
    expect(wrapper.find('h1').text()).toBe('1 appeal is hanging')
    expect(rowIds(wrapper, 'appeal')).toEqual([3])
    const ticket = byTestId(wrapper, 'admin-ticket')
    expect(ticket.text()).toContain('Asked for payment in chat')
    expect(ticket.text()).toContain('I only asked about the bus fare.')

    const confirm = byTestId(wrapper, 'appeal-confirm')
    expect(confirm.attributes('disabled')).toBeDefined()
    await byTestId(wrapper, 'appeal-keep').setValue(true)
    expect(confirm.text()).toBe('Keep and send reply')
    await byTestId(wrapper, 'appeal-lift').setValue(true)
    expect(confirm.text()).toBe('Lift and send reply')
    await byTestId(wrapper, 'appeal-reply-box').setValue('Ben confirmed it.')
    expect(byTestId(wrapper, 'appeal-decision').text()).toContain('Your appeal was accepted.')

    api.post.mockResolvedValueOnce({ data: {} })
    await wrapper.find('[data-testid="appeal-decision"] form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/admin/appeals/3/accept', {
      reason: 'Ben confirmed it.',
    })
    expect(byTestId(wrapper, 'admin-notice').text()).toBe("Daniel Tan's suspension was lifted.")
  })

  it('lists decided appeals with the reply that was sent', async () => {
    route.query = { tab: 'appeals', show: 'decided' }
    const wrapper = await mountAdmin()
    expect(byTestId(wrapper, 'admin-appeal-2').text()).toContain('Kept')
    expect(byTestId(wrapper, 'admin-appeal-2').text()).toContain('The chat shows otherwise.')
  })
})
