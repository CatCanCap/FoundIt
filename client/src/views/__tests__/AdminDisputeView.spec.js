import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => ({ params: { id: '141' } }),
}))

import api from '@/api'
import AdminDisputeView from '../AdminDisputeView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

// A record with nothing on it, as the API sends for someone new
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
const spots = [
  { id: 1, building: 'SCIS 1', floor: 'Level 2' },
  { id: 2, building: 'Library', floor: 'Level 3' },
]
const trail = (spotId) => [{ spotId, from: '2026-10-14T03:00:00Z', to: '2026-10-14T03:30:00Z' }]

const caseFile = (status = 'open') => ({
  dispute: {
    id: 141,
    status,
    description: 'Engraved WL on the back',
    claimerResponse: null,
    createdAt: '2026-10-15T01:40:00Z',
    decidedAt: null,
    decisionReason: null,
  },
  claim: { id: 9, detail: "It's just white", createdAt: '2026-10-14T04:02:00Z' },
  foundItem: {
    id: 2,
    title: 'White AirPods Pro case',
    description: 'Engraved WL on the back',
    category: 'Earbuds',
    colour: 'White',
    brand: 'Apple',
    photoUrl: null,
    postedBy: 3,
    createdAt: '2026-10-14T03:20:00Z',
    trail: trail(1),
  },
  // Daniel filed his lost report 2 hours after he claimed the find
  claimerLostItem: {
    id: 1,
    title: 'Earbuds pouch',
    description: 'Just a normal one',
    category: 'Earbuds',
    colour: 'Black',
    brand: '',
    createdAt: '2026-10-14T06:02:00Z',
    trail: trail(2),
  },
  raiserLostItem: {
    id: 5,
    title: 'White AirPods Pro',
    description: 'Engraved WL with a heart',
    category: 'Earbuds',
    colour: 'white',
    brand: 'Apple',
    createdAt: '2026-10-14T02:02:00Z',
    trail: trail(1),
  },
  claimer: {
    id: 4,
    name: 'Daniel Tan',
    email: 'daniel@smu.edu.sg',
    history: { ...clean, disputesAgainst: 2, disputesLost: 1, warnings: 1 },
  },
  raisedBy: { id: 6, name: 'Wei Ling', email: 'weiling@smu.edu.sg', history: clean },
  finder: { id: 3, name: 'Marcus', email: 'marcus@smu.edu.sg', history: clean },
  decidedBy: null,
  messages: [
    { id: 1, senderId: 4, text: "It's just white, normal case.", sentAt: '2026-10-14T04:05:00Z' },
  ],
})

// The header needs the logged-in user and the router, so tests stub it
async function mountCase(status, file = caseFile(status)) {
  api.get.mockImplementation((path) => Promise.resolve({ data: path === '/spots' ? spots : file }))
  const wrapper = mount(AdminDisputeView, {
    attachTo: document.body,
    global: { stubs: { RouterLink: true, AppHeader: true } },
  })
  await flushPromises()
  return wrapper
}

// "Review decision", then "Yes, log it"
async function decide(wrapper) {
  await byTestId(wrapper, 'case-decision').trigger('submit')
  await flushPromises()
  const confirm = byTestId(wrapper, 'case-confirm')
  if (confirm.exists()) {
    await confirm.trigger('click')
    await flushPromises()
  }
}

beforeEach(() => vi.clearAllMocks())
// Each case is attached to the page so focus can be checked; clear it after
afterEach(() => {
  document.body.innerHTML = ''
})

describe('AdminDisputeView', () => {
  it('shows both sides with names, and the chat', async () => {
    const wrapper = await mountCase()
    expect(api.get).toHaveBeenCalledWith('/admin/disputes/141')
    expect(wrapper.text()).toContain('D-0141')
    expect(byTestId(wrapper, 'case-claimer').text()).toContain("It's just white")
    expect(byTestId(wrapper, 'case-raiser').text()).toContain('Engraved WL')
    expect(byTestId(wrapper, 'case-chat').text()).toContain('Daniel Tan')
    expect(byTestId(wrapper, 'case-chat').text()).toContain('12:05')
  })

  it('walks through the four steps, and emails both people', async () => {
    const wrapper = await mountCase()
    expect(byTestId(wrapper, 'case-step-title').text()).toBe('What happened')
    expect(wrapper.text()).toContain("Says it's theirs.")
    await byTestId(wrapper, 'case-step-2').trigger('click')
    expect(byTestId(wrapper, 'case-step-title').text()).toBe('Both sides')
    expect(byTestId(wrapper, 'case-raiser').isVisible()).toBe(true)
    expect(byTestId(wrapper, 'case-decision').isVisible()).toBe(false)
    const mail = wrapper.find('a[href^="mailto:"]').attributes('href')
    expect(mail).toBe(
      'mailto:daniel@smu.edu.sg,weiling@smu.edu.sg?subject=FoundIt%20dispute%20D-0141',
    )
  })

  it('returns the item without a penalty for an honest mistake', async () => {
    const wrapper = await mountCase()
    api.post.mockResolvedValue({ data: {} })
    await byTestId(wrapper, 'case-reason').setValue('The engraving matches the photo')
    await byTestId(wrapper, 'case-decision').trigger('submit')
    await flushPromises()
    // Reviewing shows what will happen; nothing is saved until it is confirmed
    expect(api.post).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'case-confirm-box').text()).toContain('This cannot be undone')
    await byTestId(wrapper, 'case-confirm').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/admin/disputes/141/uphold', {
      reason: 'The engraving matches the photo',
      penalty: 'none',
    })
  })

  it('suspends the claimer when the claim looked deliberate', async () => {
    const wrapper = await mountCase()
    api.post.mockResolvedValue({ data: {} })
    await byTestId(wrapper, 'case-reason').setValue('Copied details from the chat')
    await byTestId(wrapper, 'case-penalty-suspend').setValue(true)
    await decide(wrapper)
    expect(api.post.mock.calls[0][1].penalty).toBe('suspend')
  })

  it('can warn the claimer instead', async () => {
    const wrapper = await mountCase()
    api.post.mockResolvedValue({ data: {} })
    await byTestId(wrapper, 'case-reason').setValue('Careless claim')
    await byTestId(wrapper, 'case-penalty-warn').setValue(true)
    await decide(wrapper)
    expect(api.post.mock.calls[0][1].penalty).toBe('warn')
  })

  it('goes back to editing from the confirm step', async () => {
    const wrapper = await mountCase()
    await byTestId(wrapper, 'case-reason').setValue('The engraving matches')
    await byTestId(wrapper, 'case-decision').trigger('submit')
    await flushPromises()
    await byTestId(wrapper, 'case-cancel').trigger('click')
    expect(byTestId(wrapper, 'case-confirm-box').exists()).toBe(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('keeps the claim', async () => {
    const wrapper = await mountCase()
    api.post.mockResolvedValue({ data: {} })
    await byTestId(wrapper, 'case-keep').setValue(true)
    await byTestId(wrapper, 'case-reason').setValue('No proof given')
    // Keeping the claim has no penalty to choose
    expect(byTestId(wrapper, 'case-penalty').exists()).toBe(false)
    await decide(wrapper)
    expect(api.post).toHaveBeenCalledWith('/admin/disputes/141/close', { reason: 'No proof given' })
  })

  it('shows the outcome instead of the form once decided', async () => {
    const wrapper = await mountCase('closed')
    expect(byTestId(wrapper, 'case-decision').exists()).toBe(false)
    expect(byTestId(wrapper, 'case-outcome').text()).toContain('The claim was kept')
    // No "decide" wording on a decided case
    expect(byTestId(wrapper, 'case-job').text()).not.toContain('Your job')
    expect(byTestId(wrapper, 'case-job').text()).toContain('The claim was kept')
    expect(byTestId(wrapper, 'case-step-4').text()).toContain('Decision')
  })

  it('loads the case again when someone else decided it a moment ago', async () => {
    const wrapper = await mountCase()
    api.post.mockRejectedValue({
      response: { status: 409, data: { error: 'This dispute was decided a moment ago' } },
    })
    await byTestId(wrapper, 'case-reason').setValue('The engraving matches')
    api.get.mockClear()
    await decide(wrapper)
    expect(byTestId(wrapper, 'case-decision-error').text()).toMatch(/decided a moment ago/)
    expect(api.get).toHaveBeenCalledWith('/admin/disputes/141')
  })

  it('asks for a reason before logging anything', async () => {
    const wrapper = await mountCase()
    await byTestId(wrapper, 'case-decision').trigger('submit')
    await flushPromises()
    expect(api.post).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'case-decision-error').text()).toMatch(/Give a reason/)
  })

  it('shows a refused decision beside the buttons, and keeps the form', async () => {
    const wrapper = await mountCase()
    api.post.mockRejectedValue({
      response: { data: { error: 'This dispute has already been decided' } },
    })
    await byTestId(wrapper, 'case-reason').setValue('The engraving matches')
    await decide(wrapper)
    expect(byTestId(wrapper, 'case-decision-error').text()).toBe(
      'This dispute has already been decided',
    )
    expect(byTestId(wrapper, 'case-decision').exists()).toBe(true)
  })

  it('reloads the case after a decision and says it was logged', async () => {
    const wrapper = await mountCase()
    api.post.mockResolvedValue({ data: {} })
    api.get.mockResolvedValue({ data: { ...caseFile('upheld'), decidedBy: { name: 'Admin' } } })
    await byTestId(wrapper, 'case-reason').setValue('The engraving matches')
    await decide(wrapper)
    expect(byTestId(wrapper, 'case-done').text()).toMatch(/Decision logged/)
    expect(byTestId(wrapper, 'case-outcome').text()).toContain(
      'Returned to the person who disputed',
    )
  })

  it('can only keep the claim when the lost report on the dispute is gone', async () => {
    const wrapper = await mountCase('open', { ...caseFile(), raiserLostItem: null })
    expect(byTestId(wrapper, 'case-return').element.disabled).toBe(true)
    expect(byTestId(wrapper, 'case-keep').element.checked).toBe(true)
  })

  it('moves focus to the heading of each step', async () => {
    const wrapper = await mountCase()
    await byTestId(wrapper, 'case-step-3').trigger('click')
    await flushPromises()
    expect(document.activeElement.textContent.trim()).toBe('Chat')
    expect(byTestId(wrapper, 'case-step-3').attributes('aria-selected')).toBe('true')
  })

  it('names the case in the top band', async () => {
    const wrapper = await mountCase()
    expect(wrapper.find('h1').text()).toBe('White AirPods Pro case')
  })

  it("shows each person's record on other cases, beside their name and at the decision", async () => {
    const wrapper = await mountCase()
    expect(byTestId(wrapper, 'history-claimer').text()).toContain('1 of 2 disputes lost')
    expect(byTestId(wrapper, 'history-claimer').text()).toContain('1 warning')
    expect(byTestId(wrapper, 'history-disputer').text()).toBe('Nothing else on record')
    const records = byTestId(wrapper, 'case-records').text()
    expect(records).toContain('Daniel Tan')
    expect(records).toContain('1 of 2 disputes lost')
  })

  it('sets both lost reports beside the find, picking out what agrees', async () => {
    const wrapper = await mountCase()
    const compare = byTestId(wrapper, 'case-compare')
    const agreeing = (key) =>
      compare
        .findAll(`[data-testid^="compare-${key}-"]`)
        .filter((cell) => cell.find('.compare-tag').exists())
        .map((cell) => cell.attributes('data-testid').replace(`compare-${key}-`, ''))
    expect(agreeing('raiser')).toEqual(['category', 'colour', 'brand', 'where', 'description'])
    expect(byTestId(compare, 'compare-raiser-where').text()).toContain('Same spot')
    expect(byTestId(compare, 'compare-raiser-where').text()).toContain('SCIS 1, Level 2')
    expect(byTestId(wrapper, 'case-raiser').text()).toContain('Filed 2 h before the claim')

    expect(agreeing('claimer')).toEqual(['category'])
    expect(byTestId(wrapper, 'case-claimer').text()).toContain('Filed 2 h after the claim')
  })

  it('says when someone has no lost report to compare', async () => {
    const wrapper = await mountCase('open', { ...caseFile(), claimerLostItem: null })
    expect(byTestId(wrapper, 'compare-claimer').text()).toContain('No lost report on file')
  })
})
