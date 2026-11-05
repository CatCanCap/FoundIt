import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => ({ params: { id: '7' } }),
}))

import api from '@/api'
import AdminReportView from '../AdminReportView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

const clean = {
  disputesRaised: 0,
  disputesRaisedWon: 0,
  disputesAgainst: 0,
  disputesLost: 0,
  claimsWithdrawn: 0,
  claimsDeclined: 0,
  warnings: 0,
  suspensions: 0,
  suspendedAt: null,
  openReports: 0,
  actionedReports: 0,
}
const author = {
  id: 4,
  name: 'Daniel Tan',
  email: 'daniel@smu.edu.sg',
  suspendedAt: null,
  history: { ...clean, warnings: 2, openReports: 1 },
}

const messageReport = (overrides = {}) => ({
  report: {
    id: 7,
    kind: 'message',
    status: 'open',
    reason: 'Asked for my number',
    createdAt: '2026-10-15T02:00:00Z',
  },
  message: { id: 3, senderId: 4, text: 'Send me your number', sentAt: '2026-10-15T01:05:00Z' },
  context: [
    { id: 2, senderId: 3, text: 'Where can we meet?', sentAt: '2026-10-15T01:00:00Z' },
    { id: 3, senderId: 4, text: 'Send me your number', sentAt: '2026-10-15T01:05:00Z' },
  ],
  item: null,
  author,
  reportedBy: { id: 3, name: 'Marcus Lim', email: 'marcus@smu.edu.sg', history: clean },
  ...overrides,
})

const postReport = () => ({
  ...messageReport(),
  report: {
    id: 7,
    kind: 'item',
    status: 'open',
    reason: 'Spam',
    createdAt: '2026-10-15T02:00:00Z',
  },
  message: null,
  context: [],
  item: {
    id: 9,
    type: 'found',
    title: 'Blue bottle',
    category: 'Water Bottle',
    status: 'open',
    description: 'Buy cheap bottles here',
    photoUrl: null,
  },
})

async function mountReport(data = messageReport()) {
  api.get.mockResolvedValue({ data })
  const wrapper = mount(AdminReportView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, AppHeader: true } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => vi.clearAllMocks())

describe('AdminReportView', () => {
  it('shows the reported message among the ones around it, and who wrote it', async () => {
    const wrapper = await mountReport()
    expect(api.get).toHaveBeenCalledWith('/admin/reports/7')
    expect(wrapper.text()).toContain('R-0007')
    expect(wrapper.text()).toContain('“Asked for my number”')
    expect(byTestId(wrapper, 'report-target').text()).toContain('Send me your number')
    expect(byTestId(wrapper, 'report-context').text()).toContain('Where can we meet?')
    // The other message is the reporter's, so it carries their name
    expect(byTestId(wrapper, 'report-context').text()).toContain('Marcus Lim')
    expect(byTestId(wrapper, 'report-context').text()).not.toContain('The other person')
    expect(byTestId(wrapper, 'report-people').text()).toContain('daniel@smu.edu.sg')
    expect(byTestId(wrapper, 'report-status').text()).toBe('Waiting')
  })

  it('shows a reported post instead of a chat', async () => {
    const wrapper = await mountReport(postReport())
    expect(byTestId(wrapper, 'report-context').exists()).toBe(false)
    expect(byTestId(wrapper, 'report-item').text()).toContain('Buy cheap bottles here')
    expect(byTestId(wrapper, 'report-remove').text()).toBe('Remove the post')
  })

  it('dismisses without a reason, after confirming', async () => {
    const wrapper = await mountReport()
    api.post.mockResolvedValue({ data: {} })
    await byTestId(wrapper, 'report-dismiss').trigger('click')
    // Picking an action only opens its step; nothing is sent yet
    expect(api.post).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'report-panel').text()).toContain('The report closes as unfounded')
    await byTestId(wrapper, 'report-confirm').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/admin/reports/7/dismiss', { reason: undefined })
    expect(byTestId(wrapper, 'report-done').text()).toBe('Report dismissed.')
  })

  it('asks for a reason before warning, removing or suspending', async () => {
    const wrapper = await mountReport()
    await byTestId(wrapper, 'report-suspend').trigger('click')
    expect(byTestId(wrapper, 'report-panel').text()).toContain('can no longer post, claim, chat')
    await byTestId(wrapper, 'report-confirm').trigger('click')
    await flushPromises()
    expect(api.post).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'report-action-error').text()).toMatch(/Give a reason/)
  })

  it('goes back to the choices on Cancel, without sending anything', async () => {
    const wrapper = await mountReport()
    await byTestId(wrapper, 'report-suspend').trigger('click')
    await byTestId(wrapper, 'report-cancel').trigger('click')
    expect(byTestId(wrapper, 'report-panel').exists()).toBe(false)
    expect(byTestId(wrapper, 'report-warn').exists()).toBe(true)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('removes the message with the reason, then reloads', async () => {
    const wrapper = await mountReport()
    api.post.mockResolvedValue({ data: {} })
    await byTestId(wrapper, 'report-remove').trigger('click')
    await byTestId(wrapper, 'report-reason').setValue('Asking for contact details')
    api.get.mockResolvedValue({
      data: messageReport({
        report: { ...messageReport().report, status: 'actioned' },
        message: { ...messageReport().message, removedAt: '2026-10-16T00:00:00Z' },
        actions: [
          {
            action: 'remove_message',
            reason: 'Asking for contact details',
            createdAt: '2026-10-16T00:00:00Z',
            admin: { id: 1, name: 'FoundIt Admin' },
          },
        ],
      }),
    })
    await byTestId(wrapper, 'report-confirm').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/admin/reports/7/remove', {
      reason: 'Asking for contact details',
    })
    expect(byTestId(wrapper, 'report-done').text()).toBe('Removed.')
    expect(byTestId(wrapper, 'report-removed').text()).toBe('Message removed')
    // What was done comes first, with its reason
    expect(byTestId(wrapper, 'report-taken').text()).toContain('Removed a chat message')
    expect(byTestId(wrapper, 'report-taken').text()).toContain('Asking for contact details')
    // Further actions stay folded away, and never Remove or Dismiss again
    expect(byTestId(wrapper, 'report-actions').exists()).toBe(false)
    await byTestId(wrapper, 'report-more').trigger('click')
    expect(byTestId(wrapper, 'report-warn').exists()).toBe(true)
    expect(byTestId(wrapper, 'report-remove').exists()).toBe(false)
    expect(byTestId(wrapper, 'report-dismiss').exists()).toBe(false)
  })

  it('does not offer a warning that was already given', async () => {
    const wrapper = await mountReport(
      messageReport({
        report: { ...messageReport().report, status: 'actioned' },
        actions: [{ action: 'warn_user', reason: 'Rude', createdAt: '2026-10-16T00:00:00Z' }],
      }),
    )
    expect(byTestId(wrapper, 'report-status').text()).toBe('Action taken')
    expect(byTestId(wrapper, 'report-taken').text()).toContain('Warned a user')
    await byTestId(wrapper, 'report-more').trigger('click')
    expect(byTestId(wrapper, 'report-warn').exists()).toBe(false)
    expect(byTestId(wrapper, 'report-remove').exists()).toBe(true)
  })

  it('lifts a suspension through the user route', async () => {
    const wrapper = await mountReport(
      messageReport({ author: { ...author, suspendedAt: '2026-10-15T03:00:00Z' } }),
    )
    expect(byTestId(wrapper, 'report-suspended').exists()).toBe(true)
    expect(byTestId(wrapper, 'report-suspend').exists()).toBe(false)
    api.post.mockResolvedValue({ data: {} })
    await byTestId(wrapper, 'report-unsuspend').trigger('click')
    await byTestId(wrapper, 'report-reason').setValue('Apologised')
    await byTestId(wrapper, 'report-confirm').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/admin/users/4/unsuspend', { reason: 'Apologised' })
  })

  it('shows a refused action beside the buttons', async () => {
    const wrapper = await mountReport()
    api.post.mockRejectedValue({ response: { data: { error: 'This report was dismissed' } } })
    await byTestId(wrapper, 'report-warn').trigger('click')
    await byTestId(wrapper, 'report-reason').setValue('Rude')
    await byTestId(wrapper, 'report-confirm').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'report-action-error').text()).toBe('This report was dismissed')
  })

  it('offers nothing more on a dismissed report', async () => {
    const wrapper = await mountReport(
      messageReport({ report: { ...messageReport().report, status: 'dismissed' } }),
    )
    expect(byTestId(wrapper, 'report-actions').exists()).toBe(false)
    expect(byTestId(wrapper, 'report-outcome').text()).toContain('Dismissed')
    expect(byTestId(wrapper, 'report-status').text()).toBe('Dismissed')
  })

  it('shows the error when the report cannot load', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Report not found' } } })
    const wrapper = mount(AdminReportView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, AppHeader: true } },
    })
    await flushPromises()
    expect(byTestId(wrapper, 'report-error').text()).toBe('Report not found')
    expect(wrapper.text()).toContain('Back to the reports')
  })

  it('names the report in the top band', async () => {
    expect((await mountReport()).find('h1').text()).toBe('Chat message')
    expect((await mountReport(postReport())).find('h1').text()).toBe('Blue bottle')
  })

  it("shows the author's and reporter's records, and the author's again by the actions", async () => {
    const wrapper = await mountReport()
    expect(byTestId(wrapper, 'history-author').text()).toContain('2 warnings')
    expect(byTestId(wrapper, 'history-author').text()).toContain('1 open report')
    expect(byTestId(wrapper, 'history-reporter').text()).toBe('Nothing else on record')
    expect(byTestId(wrapper, 'report-record').text()).toContain('Daniel Tan, on record')
    expect(byTestId(wrapper, 'report-record').text()).toContain('2 warnings')
  })
})
