import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))
vi.mock('@/realtime', () => ({ onNewMessage: vi.fn(() => () => {}) }))

import api from '@/api'
import { onNewMessage } from '@/realtime'
import { useAuthStore } from '@/stores/auth'
import HandoffView from '../HandoffView.vue'

const byTestId = (wrapper, id) => wrapper.find(`[data-testid="${id}"]`)

const OWNER = { id: 1, name: 'Wei Ling Tan', role: 'user', emailVerifiedAt: '2026-10-01T00:00:00Z' }
const FINDER = { id: 2, name: 'Marcus Koh', role: 'user', emailVerifiedAt: '2026-10-01T00:00:00Z' }

const spots = [
  {
    id: 1,
    building: 'SCIS 1',
    floor: 'Level 2',
    area: 'room 2-4',
    coordinates: { lat: 1.2973, lng: 103.8494 },
  },
  {
    id: 7,
    building: 'SCIS 1',
    floor: 'Level 1',
    area: 'concierge',
    isCollectionPoint: true,
    coordinates: { lat: 1.2974, lng: 103.8495 },
  },
]
const foundItem = {
  id: 3307,
  title: 'Navy Hydro Flask',
  category: 'Water Bottle',
  photoUrl: null,
  createdAt: '2026-10-14T01:00:00Z',
  trail: [{ spotId: 1, from: '2026-10-14T00:50:00Z', to: '2026-10-14T00:55:00Z' }],
}
const claim = {
  id: 5,
  matchId: 10,
  detail: 'Cat sticker near the base',
  status: 'active',
  createdAt: '2026-10-14T01:12:00Z',
}
const pending = {
  id: 9,
  matchId: 10,
  method: 'drop-off',
  spotId: 7,
  status: 'pending',
  createdAt: '2026-10-14T01:31:00Z',
  handedOverAt: null,
  completedAt: null,
}
const messages = [
  {
    id: 1,
    matchId: 10,
    senderId: 2,
    text: 'Found this outside room 2-4',
    sentAt: '2026-10-14T01:20:00Z',
    removedAt: null,
  },
  {
    id: 2,
    matchId: 10,
    senderId: 1,
    text: 'Cat sticker, dent on the lid',
    sentAt: '2026-10-14T01:24:00Z',
    removedAt: null,
  },
  {
    id: 3,
    matchId: 10,
    senderId: 2,
    text: '',
    sentAt: '2026-10-14T01:25:00Z',
    removedAt: '2026-10-14T02:00:00Z',
  },
]

function overviewFor(role, fields = {}) {
  return {
    role,
    match: { id: 10, status: 'claimed', score: 92, reasons: [] },
    claim,
    foundItem,
    lostItem: null,
    handoff: null,
    disputeOpen: false,
    ...fields,
  }
}

let current
let myDisputes = []
function answerWith(overview) {
  current = overview
  api.get.mockImplementation((url) => {
    if (url === '/spots') return Promise.resolve({ data: spots })
    if (url === '/claims/10') return Promise.resolve({ data: current })
    if (url === '/messages/10/channel') return Promise.resolve({ data: { channel: 'chat-10-abc' } })
    if (url === '/messages/10') return Promise.resolve({ data: messages })
    if (url === '/handoffs/collection-points') return Promise.resolve({ data: [spots[1]] })
    if (url === '/disputes/on-my-claims') return Promise.resolve({ data: myDisputes })
    if (url === '/matches/mine') {
      return Promise.resolve({ data: { reports: [{ matches: [{ status: 'suggested' }] }] } })
    }
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
}

async function mountAs(user, overview) {
  answerWith(overview)
  const auth = useAuthStore()
  auth.token = 'abc'
  auth.user = user
  const blank = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/matches/:id/handoff', component: HandoffView },
      { path: '/matches/:id/claim', component: blank },
      { path: '/matches/:id/resolved', component: blank },
      { path: '/:rest(.*)', component: blank },
    ],
  })
  router.push('/matches/10/handoff')
  await router.isReady()
  const wrapper = mount(HandoffView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

let wrapper
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
})
afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllEnvs()
})

describe('HandoffView, the owner', () => {
  it('opens the chat after the claim, without names or contact details (V12.1)', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    expect(byTestId(wrapper, 'handoff-title').text()).toBe('Navy Hydro Flask, with the finder')
    expect(byTestId(wrapper, 'handoff-line').text()).toBe('Claimed by you · 14 Oct, 09:12')
    expect(byTestId(wrapper, 'handoff-chip').text()).toBe('Matched')
    expect(wrapper.text()).toContain('Contact details hidden')
    // The item's own name, not "this item"
    expect(byTestId(wrapper, 'chat-intro').text()).toBe(
      'You claimed the Navy Hydro Flask. Claims are logged to your SMU account.',
    )
    expect(byTestId(wrapper, 'partner-line').text()).toBe('Found your Navy Hydro Flask')
    expect(wrapper.text()).not.toContain('Marcus')
    // The item and step box was removed from the chat
    expect(byTestId(wrapper, 'where-its-at').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Claim checked in the chat')
    expect(byTestId(wrapper, 'waiting-check').text()).toContain('Cat sticker near the base')
    expect(onNewMessage).toHaveBeenCalledWith('chat-10-abc', expect.any(Function))
  })

  it('shows whose message is whose, and hides removed text', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    const rows = wrapper.findAll('[data-testid="chat-message"]')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('The finder · 09:20')
    expect(rows[1].text()).toContain('You · 09:24')
    expect(rows[1].find('[data-testid="report-message"]').exists()).toBe(false)
    expect(rows[2].text()).toContain('This message was removed by an admin')
  })

  it('reports the other person’s message only after asking', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    api.post.mockResolvedValue({ data: {} })
    const first = wrapper.findAll('[data-testid="chat-message"]')[0]
    await first.find('[data-testid="report-message"]').trigger('click')
    expect(api.post).not.toHaveBeenCalled()
    await first.find('[data-testid="report-message-confirm"]').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/reports', {
      messageId: 1,
      reason: 'Reported from the handoff chat',
    })
    expect(first.find('[data-testid="message-reported"]').exists()).toBe(true)
  })

  it('shows the Matches number in the header here too', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    expect(byTestId(wrapper, 'badge-matches').text()).toBe('1')
  })

  it('lets messages from one person in the same minute share one time', async () => {
    messages.splice(3, 0, {
      id: 5,
      matchId: 10,
      senderId: 2,
      text: 'One more thing',
      sentAt: '2026-10-14T01:20:30Z',
    })
    try {
      ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
      const rows = wrapper.findAll('[data-testid="chat-message"]')
      // 09:20 and 09:20:30 from the finder: the time shows once, under the second
      expect(rows[0].text()).not.toContain('09:20')
      expect(rows[0].find('[data-testid="report-message"]').exists()).toBe(true)
      expect(rows[1].text()).toContain('The finder · 09:20')
    } finally {
      messages.splice(3, 1)
    }
  })

  it('shows a message straight away while it is sent, and says when it was not', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    let answer
    api.post.mockReturnValue(new Promise((resolve, reject) => (answer = { resolve, reject })))
    await byTestId(wrapper, 'chat-input').setValue('On my way')
    await wrapper.find('form.handoff__composer').trigger('submit')
    await flushPromises()
    const last = () => wrapper.findAll('[data-testid="chat-message"]').at(-1)
    expect(last().text()).toContain('On my way')
    expect(last().text()).toContain('Sending…')
    expect(byTestId(wrapper, 'chat-input').element.value).toBe('')

    answer.reject({ response: { data: { error: 'Could not reach the server' } } })
    await flushPromises()
    expect(last().text()).toContain('Not sent')
    api.post.mockResolvedValue({
      data: { id: 9, matchId: 10, senderId: 1, text: 'On my way', sentAt: '2026-10-14T02:00:00Z' },
    })
    await last().find('[data-testid="message-retry"]').trigger('click')
    await flushPromises()
    expect(last().text()).toContain('You · 10:00')
    expect(wrapper.findAll('[data-testid="chat-message"]')).toHaveLength(4)
  })

  it('shows no alert for the chat you are in when a new message arrives', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
      const fresh = {
        id: 6,
        matchId: 10,
        senderId: 2,
        text: 'Here now',
        sentAt: '2026-10-14T03:00:00Z',
      }
      api.get.mockImplementation((url) =>
        url === '/messages/10'
          ? Promise.resolve({ data: [fresh] })
          : Promise.resolve({ data: url === '/claims/10' ? current : [] }),
      )
      await vi.advanceTimersByTimeAsync(5100)
      await flushPromises()
      expect(wrapper.text()).toContain('Here now')
      expect(byTestId(wrapper, 'slide-toast').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the owner why the finder declined', async () => {
    const declined = overviewFor('owner', {
      claim: null,
      match: { id: 10, status: 'rejected' },
      closed: {
        status: 'declined',
        reason: 'No sticker on this one',
        decidedAt: '2026-10-14T02:00:00Z',
      },
    })
    ;({ wrapper } = await mountAs(OWNER, declined))
    const box = byTestId(wrapper, 'handoff-closed')
    expect(box.text()).toContain('The finder declined your claim')
    expect(byTestId(wrapper, 'closed-reason').text()).toContain('No sticker on this one')
    expect(box.text()).toContain('Your lost report is open again')
    expect(box.find('a[href="/matches"]').exists()).toBe(true)
  })

  it('sends a message and shows it', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    api.post.mockResolvedValue({
      data: {
        id: 4,
        matchId: 10,
        senderId: 1,
        text: 'See you at 6',
        sentAt: '2026-10-14T02:00:00Z',
      },
    })
    await byTestId(wrapper, 'chat-input').setValue('  See you at 6 ')
    await wrapper.find('form.handoff__composer').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/messages/10', { text: 'See you at 6' })
    expect(wrapper.findAll('[data-testid="chat-message"]')).toHaveLength(4)
    expect(byTestId(wrapper, 'chat-input').element.value).toBe('')
  })

  it('shows the plan with walking directions, and confirms "Yes, I have it" (V12.3, V12.5)', async () => {
    const handedOver = { ...pending, status: 'handed_over', handedOverAt: '2026-10-14T09:30:00Z' }
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner', { handoff: handedOver })))
    expect(byTestId(wrapper, 'handoff-chip').text()).toBe('Handoff pending')
    expect(byTestId(wrapper, 'handoff-line').text()).toBe(
      'The finder dropped it off · 14 Oct, 17:30',
    )
    expect(byTestId(wrapper, 'handoff-plan').text()).toContain(
      'Drop-off at SCIS 1, Level 1 · Concierge',
    )
    // Opens the walking route. Without a Mapbox token it offers a link instead; the
    // token is switched off here so the test is the same on every machine
    vi.stubEnv('VITE_MAPBOX_TOKEN', '')
    expect(byTestId(wrapper, 'walking-route').exists()).toBe(false)
    await byTestId(wrapper, 'walking-directions').trigger('click')
    expect(byTestId(wrapper, 'walking-route').exists()).toBe(true)
    expect(byTestId(wrapper, 'walking-directions-link').attributes('href')).toContain(
      'travelmode=walking',
    )
    expect(byTestId(wrapper, 'got-it-back').text()).toContain('resolves itself on 21 Oct')

    api.post.mockResolvedValue({ data: {} })
    current = overviewFor('owner', {
      handoff: { ...handedOver, status: 'completed', completedAt: '2026-10-15T02:02:00Z' },
      match: { id: 10, status: 'confirmed' },
    })
    await byTestId(wrapper, 'confirm-have-it').trigger('click')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/handoffs/9/confirm')
    expect(byTestId(wrapper, 'handoff-resolved').exists()).toBe(true)
    expect(byTestId(wrapper, 'chat-input').exists()).toBe(false)
  })

  it('shows the server’s message when a dispute pauses the confirm', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner', { handoff: pending })))
    api.post.mockRejectedValue({
      response: {
        data: {
          error: 'This item is under dispute. An admin will decide before it can be completed.',
        },
      },
    })
    await byTestId(wrapper, 'confirm-have-it').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'handoff-action-error').text()).toContain('under dispute')
  })

  it('pauses with a note while a dispute is open, and hides "Got it back?"', async () => {
    ;({ wrapper } = await mountAs(
      OWNER,
      overviewFor('owner', { handoff: pending, disputeOpen: true }),
    ))
    expect(byTestId(wrapper, 'handoff-chip').text()).toBe('Paused')
    expect(byTestId(wrapper, 'handoff-paused').exists()).toBe(true)
    expect(byTestId(wrapper, 'got-it-back').exists()).toBe(false)
  })

  it('does not let the finder hand it over while a dispute is open', async () => {
    ;({ wrapper } = await mountAs(
      FINDER,
      overviewFor('finder', { handoff: pending, disputeOpen: true }),
    ))
    expect(byTestId(wrapper, 'handoff-paused').exists()).toBe(true)
    expect(byTestId(wrapper, 'mark-handed-over').exists()).toBe(false)
    expect(byTestId(wrapper, 'handed-over').exists()).toBe(false)
  })

  it('goes to the claim page when the owner has not claimed yet', async () => {
    const unclaimed = overviewFor('owner', { claim: null, match: { id: 10, status: 'suggested' } })
    let router
    ;({ wrapper, router } = await mountAs(OWNER, unclaimed))
    expect(router.currentRoute.value.path).toBe('/matches/10/claim')
  })

  it('is read-only once resolved (V12.6)', async () => {
    const done = {
      ...pending,
      status: 'completed',
      handedOverAt: '2026-10-14T09:30:00Z',
      completedAt: '2026-10-15T02:02:00Z',
    }
    ;({ wrapper } = await mountAs(
      OWNER,
      overviewFor('owner', { handoff: done, match: { id: 10, status: 'confirmed' } }),
    ))
    expect(byTestId(wrapper, 'handoff-chip').text()).toBe('Resolved')
    expect(byTestId(wrapper, 'chat-input').exists()).toBe(false)
    expect(byTestId(wrapper, 'see-summary').attributes('href')).toBe('/matches/10/resolved')
  })
})

describe('HandoffView, a claim closed by a dispute', () => {
  // As in the recording: returned, then disputed, then given to someone else
  const returnedThenGiven = (role) =>
    overviewFor(role, {
      claim: null,
      match: { id: 10, status: 'rejected' },
      handoff: {
        ...pending,
        status: 'completed',
        handedOverAt: '2026-10-14T09:30:00Z',
        completedAt: '2026-10-15T02:02:00Z',
      },
      closed: { status: 'overturned', decidedAt: '2026-10-16T02:00:00Z', reason: null },
    })

  it('shows the closed page with the admin decision, not a red error box', async () => {
    myDisputes = [
      {
        id: 1,
        itemId: 3307,
        status: 'upheld',
        decidedAt: '2026-10-16T02:00:00Z',
        decisionReason: 'The other student had the receipt.',
        returnBy: '2026-10-19T02:00:00Z',
      },
    ]
    ;({ wrapper } = await mountAs(OWNER, returnedThenGiven('owner')))
    expect(byTestId(wrapper, 'handoff-error').exists()).toBe(false)
    expect(api.get).not.toHaveBeenCalledWith('/messages/10', expect.anything())
    const box = byTestId(wrapper, 'handoff-closed')
    expect(box.text()).toContain('An admin closed this claim')
    expect(byTestId(wrapper, 'closed-dispute-reason').text()).toContain(
      'The other student had the receipt.',
    )
    expect(byTestId(wrapper, 'closed-return-by').text()).toContain('19 Oct')
    expect(byTestId(wrapper, 'closed-see-dispute').attributes('href')).toBe('/disputes')
    expect(byTestId(wrapper, 'handoff-title').text()).toContain('Navy Hydro Flask')
    myDisputes = []
  })

  it('sends the finder to the item page for the dispute', async () => {
    ;({ wrapper } = await mountAs(FINDER, returnedThenGiven('finder')))
    expect(api.get).not.toHaveBeenCalledWith('/disputes/on-my-claims')
    expect(byTestId(wrapper, 'closed-see-dispute').attributes('href')).toBe('/items/3307/record')
  })

  it('still shows the page when the messages cannot load', async () => {
    answerWith(overviewFor('owner'))
    const original = api.get.getMockImplementation()
    api.get.mockImplementation((url, ...rest) =>
      url === '/messages/10'
        ? Promise.reject({
            response: { data: { error: 'The chat opens once the owner claims the item' } },
          })
        : original(url, ...rest),
    )
    const auth = useAuthStore()
    auth.token = 'abc'
    auth.user = OWNER
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/matches/:id/handoff', component: HandoffView },
        { path: '/:rest(.*)', component: { template: '<div />' } },
      ],
    })
    router.push('/matches/10/handoff')
    await router.isReady()
    wrapper = mount(HandoffView, { global: { plugins: [router] } })
    await flushPromises()
    expect(byTestId(wrapper, 'handoff-error').exists()).toBe(false)
    expect(byTestId(wrapper, 'handoff-title').text()).toContain('Navy Hydro Flask')
    expect(byTestId(wrapper, 'handoff-action-error').text()).toContain('The chat opens')
  })
})

describe('HandoffView, the finder', () => {
  it('checks the claim and accepts it with a plan (V12.2)', async () => {
    ;({ wrapper } = await mountAs(FINDER, overviewFor('finder')))
    const box = byTestId(wrapper, 'check-claim')
    expect(box.text()).toContain('Do their details fit the item?')
    expect(box.text()).toContain('Cat sticker near the base')

    await byTestId(wrapper, 'accept-claim').trigger('click')
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/handoffs/collection-points', { params: { near: 1 } })
    await wrapper.find('input[name="plan"][value="drop-off"]').setValue()

    api.post.mockResolvedValue({ data: pending })
    current = overviewFor('finder', { handoff: pending })
    await byTestId(wrapper, 'check-claim').find('form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/handoffs', {
      matchId: 10,
      method: 'drop-off',
      spotId: 7,
    })
    expect(byTestId(wrapper, 'check-claim').exists()).toBe(false)
    expect(byTestId(wrapper, 'mark-handed-over').exists()).toBe(true)
  })

  it('declines only with a reason, and the chat ends', async () => {
    ;({ wrapper } = await mountAs(FINDER, overviewFor('finder')))
    await byTestId(wrapper, 'decline-claim').trigger('click')
    expect(api.post).not.toHaveBeenCalled()
    // No reason yet: the button waits for one
    expect(byTestId(wrapper, 'decline-confirm').attributes('disabled')).toBeDefined()

    api.post.mockResolvedValue({
      data: overviewFor('finder', {
        claim: null,
        match: { id: 10, status: 'rejected' },
        closed: { status: 'declined', reason: 'No sticker', decidedAt: '2026-10-14T02:00:00Z' },
      }),
    })
    await byTestId(wrapper, 'decline-reason').setValue('  No sticker  ')
    await byTestId(wrapper, 'decline-form').trigger('submit')
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/claims/10/decline', { reason: 'No sticker' })
    expect(byTestId(wrapper, 'handoff-closed').text()).toContain('You declined this claim')
    expect(byTestId(wrapper, 'closed-reason').text()).toContain('No sticker')
    expect(byTestId(wrapper, 'chat-input').exists()).toBe(false)
  })

  it('marks it handed over, sending how it went back with the step (V12.4)', async () => {
    ;({ wrapper } = await mountAs(FINDER, overviewFor('finder', { handoff: pending })))
    expect(byTestId(wrapper, 'handed-over').text()).toBe('Mark as dropped off')
    await wrapper.find('input[name="handed-method"][value="meetup"]').setValue()
    expect(byTestId(wrapper, 'handed-over').text()).toBe('Mark as handed over')

    api.patch.mockResolvedValue({ data: {} })
    api.post.mockResolvedValue({ data: {} })
    current = overviewFor('finder', {
      handoff: {
        ...pending,
        method: 'meetup',
        status: 'handed_over',
        handedOverAt: '2026-10-14T09:30:00Z',
      },
    })
    await byTestId(wrapper, 'handed-over').trigger('click')
    await flushPromises()
    // One request, so a failed step never leaves the plan changed
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.post).toHaveBeenCalledWith('/handoffs/9/handed-over', { method: 'meetup' })
    expect(byTestId(wrapper, 'waiting-owner').text()).toContain('21 Oct')
    expect(byTestId(wrapper, 'got-it-back').exists()).toBe(false)
  })

  it('follows a changed plan in "Handed it over?"', async () => {
    ;({ wrapper } = await mountAs(FINDER, overviewFor('finder', { handoff: pending })))
    expect(byTestId(wrapper, 'handed-over').text()).toBe('Mark as dropped off')
    await byTestId(wrapper, 'change-plan').trigger('click')
    await flushPromises()
    await wrapper.find('input[name="edit"][value="meetup"]').setValue()
    api.patch.mockResolvedValue({ data: {} })
    current = overviewFor('finder', { handoff: { ...pending, method: 'meetup' } })
    await byTestId(wrapper, 'handoff-plan').find('form').trigger('submit')
    await flushPromises()
    expect(api.patch).toHaveBeenCalledWith('/handoffs/9', { method: 'meetup', spotId: 7 })
    expect(byTestId(wrapper, 'handed-over').text()).toBe('Mark as handed over')
  })

  it('shows the load error from the API', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'This is not your match' } } })
    const auth = useAuthStore()
    auth.token = 'abc'
    auth.user = FINDER
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/matches/:id/handoff', component: HandoffView }],
    })
    router.push('/matches/10/handoff')
    await router.isReady()
    wrapper = mount(HandoffView, { global: { plugins: [router] } })
    await flushPromises()
    expect(byTestId(wrapper, 'handoff-error').text()).toContain('This is not your match')
    // Not a dead end: links back to Returns and Matches
    expect(byTestId(wrapper, 'handoff-error').find('a[href="/returns"]').exists()).toBe(true)
    expect(byTestId(wrapper, 'handoff-error').find('a[href="/matches"]').exists()).toBe(true)
  })
})

describe('HandoffView, no answer from FoundIt', () => {
  it('shows the "can\'t reach" panel, not the missing-match one, and loads again', async () => {
    api.get.mockRejectedValue({ response: { status: 504, data: '<html>Gateway timeout</html>' } })
    const auth = useAuthStore()
    auth.token = 'abc'
    auth.user = OWNER
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/matches/:id/handoff', component: HandoffView }],
    })
    router.push('/matches/10/handoff')
    await router.isReady()
    wrapper = mount(HandoffView, { global: { plugins: [router] } })
    await flushPromises()
    expect(byTestId(wrapper, 'handoff-error').find('h2').text()).toBe(
      "We can't reach FoundIt right now",
    )
    expect(byTestId(wrapper, 'page-problem').exists()).toBe(false)

    answerWith(overviewFor('owner', { handoff: pending }))
    await byTestId(wrapper, 'connection-retry').trigger('click')
    await flushPromises()
    expect(byTestId(wrapper, 'handoff-error').exists()).toBe(false)
    expect(wrapper.text()).toContain('Navy Hydro Flask')
  })
})

describe('HandoffView, checking for news', () => {
  afterEach(() => vi.useRealTimers())

  const callsTo = (url) => api.get.mock.calls.filter(([called]) => called === url).length

  it('never checks again after the page fails to load (a wrong match number)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    api.get.mockRejectedValue({ response: { data: { error: 'Match not found' } } })
    const auth = useAuthStore()
    auth.token = 'abc'
    auth.user = FINDER
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/matches/:id/handoff', component: HandoffView }],
    })
    router.push('/matches/99999/handoff')
    await router.isReady()
    wrapper = mount(HandoffView, { global: { plugins: [router] } })
    await flushPromises()
    // The header has its own checks; this page's own requests must stop
    const before = callsTo('/claims/99999') + callsTo('/messages/99999')
    expect(before).toBe(1)
    await vi.advanceTimersByTimeAsync(60000)
    expect(callsTo('/claims/99999') + callsTo('/messages/99999')).toBe(before)
  })

  it('does not check a resolved chat again', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    ;({ wrapper } = await mountAs(
      OWNER,
      overviewFor('owner', {
        match: { id: 10, status: 'confirmed' },
        handoff: { ...pending, status: 'completed', completedAt: '2026-10-15T02:00:00Z' },
      }),
    ))
    const before = callsTo('/messages/10') + callsTo('/claims/10')
    await vi.advanceTimersByTimeAsync(60000)
    expect(callsTo('/messages/10') + callsTo('/claims/10')).toBe(before)
  })

  it('checks a live chat every 5 seconds, and stops once the claim is declined', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    const start = callsTo('/messages/10')
    await vi.advanceTimersByTimeAsync(5100)
    expect(callsTo('/messages/10')).toBe(start + 1)

    // The finder declines; the next look at the overview closes the chat
    current = overviewFor('owner', {
      claim: null,
      match: { id: 10, status: 'rejected' },
      closed: { status: 'declined', reason: 'No sticker', decidedAt: '2026-10-14T03:00:00Z' },
    })
    await vi.advanceTimersByTimeAsync(5100)
    await flushPromises()
    expect(byTestId(wrapper, 'handoff-closed').exists()).toBe(true)
    const after = callsTo('/messages/10') + callsTo('/claims/10')
    await vi.advanceTimersByTimeAsync(60000)
    expect(callsTo('/messages/10') + callsTo('/claims/10')).toBe(after)
  })

  it('waits while your message is being sent, so it never shows twice', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    let answer
    api.post.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    await byTestId(wrapper, 'chat-input').setValue('On my way')
    await wrapper.find('form.handoff__composer').trigger('submit')
    const saved = {
      id: 9,
      matchId: 10,
      senderId: 1,
      text: 'On my way',
      sentAt: '2026-10-14T02:00:00Z',
    }
    // The saved copy is already on the server, but the check must not merge it yet
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url === '/messages/10' ? [saved] : current }),
    )
    const before = callsTo('/messages/10')
    await vi.advanceTimersByTimeAsync(5100)
    expect(callsTo('/messages/10')).toBe(before)
    answer({ data: saved })
    await flushPromises()
    const texts = wrapper.findAll('[data-testid="chat-message"]').map((m) => m.text())
    expect(texts.filter((text) => text.includes('On my way'))).toHaveLength(1)
  })
})

describe('HandoffView, finding your way', () => {
  it('links back to Returns and to the item page', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    expect(byTestId(wrapper, 'handoff-back').attributes('href')).toBe('/returns')
    expect(wrapper.find('a[href="/items/3307/record"]').exists()).toBe(true)
  })

  it('puts a day divider above the first message of each day', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    const days = wrapper.findAll('[data-testid="chat-day"]')
    expect(days).toHaveLength(1)
    expect(days[0].text()).toBe('Wed 14 Oct')
  })

  it('lets the owner confirm in one tap, with no "Not yet" step', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner', { handoff: pending })))
    expect(byTestId(wrapper, 'not-yet').exists()).toBe(false)
    expect(byTestId(wrapper, 'confirm-have-it').exists()).toBe(true)
  })

  it('announces only the message list to screen readers, not the whole page', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    expect(wrapper.find('main').attributes('aria-live')).toBeUndefined()
    expect(byTestId(wrapper, 'chat').attributes('aria-live')).toBe('polite')
  })
})

describe('HandoffView, review fixes', () => {
  afterEach(() => vi.useRealTimers())

  it('starts nothing when you leave before the page has loaded', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    answerWith(overviewFor('owner'))
    let finishLoading
    const slow = new Promise((resolve) => (finishLoading = resolve))
    const answer = api.get.getMockImplementation()
    api.get.mockImplementation((url) => (url === '/claims/10' ? slow : answer(url)))
    const auth = useAuthStore()
    auth.token = 'abc'
    auth.user = OWNER
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/matches/:id/handoff', component: HandoffView }],
    })
    router.push('/matches/10/handoff')
    await router.isReady()
    const leaving = mount(HandoffView, { global: { plugins: [router] } })
    leaving.unmount()
    finishLoading({ data: overviewFor('owner') })
    await flushPromises()
    const calls = api.get.mock.calls.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(api.get.mock.calls.length).toBe(calls)
    expect(onNewMessage).not.toHaveBeenCalled()
  })

  it('hides the text of a message an admin removes, without a reload', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    expect(wrapper.text()).toContain('Found this outside room 2-4')
    const answer = api.get.getMockImplementation()
    const removed = [
      { ...messages[0], text: '', removedAt: '2026-10-14T03:00:00Z' },
      ...messages.slice(1),
    ]
    api.get.mockImplementation((url) =>
      url === '/messages/10' ? Promise.resolve({ data: removed }) : answer(url),
    )
    // The round that also checks the other person's steps reloads the chat
    await vi.advanceTimersByTimeAsync(10100)
    await flushPromises()
    expect(wrapper.text()).not.toContain('Found this outside room 2-4')
  })

  it('leaves you where you are when you scrolled up to read', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    const list = byTestId(wrapper, 'chat').element
    Object.defineProperty(list, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(list, 'clientHeight', { value: 300, configurable: true })
    list.scrollTop = 100
    const answer = api.get.getMockImplementation()
    const newer = { ...messages[0], id: 4, text: 'Still there?', sentAt: '2026-10-14T04:00:00Z' }
    api.get.mockImplementation((url) =>
      url === '/messages/10' ? Promise.resolve({ data: [newer] }) : answer(url),
    )
    await vi.advanceTimersByTimeAsync(5100)
    await flushPromises()
    expect(wrapper.text()).toContain('Still there?')
    expect(list.scrollTop).toBe(100)
  })

  it('shows a message as reported when it was already reported before a reload', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    api.post.mockRejectedValue({ response: { status: 409, data: { error: 'Already reported' } } })
    const first = wrapper.findAll('[data-testid="chat-message"]')[0]
    await first.find('[data-testid="report-message"]').trigger('click')
    await first.find('[data-testid="report-message-confirm"]').trigger('click')
    await flushPromises()
    expect(first.find('[data-testid="message-reported"]').exists()).toBe(true)
    expect(byTestId(wrapper, 'handoff-action-error').exists()).toBe(false)
  })

  it('keeps "Reported" after a reload, for the person who reported it only', async () => {
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    api.post.mockResolvedValue({ data: {} })
    const first = wrapper.findAll('[data-testid="chat-message"]')[0]
    await first.find('[data-testid="report-message"]').trigger('click')
    await first.find('[data-testid="report-message-confirm"]').trigger('click')
    await flushPromises()
    wrapper.unmount()

    // The page opens again, as after a reload
    ;({ wrapper } = await mountAs(OWNER, overviewFor('owner')))
    const again = wrapper.findAll('[data-testid="chat-message"]')[0]
    expect(again.find('[data-testid="message-reported"]').exists()).toBe(true)
    expect(again.find('[data-testid="report-message"]').exists()).toBe(false)
    wrapper.unmount()

    // Someone else on the same computer has not reported anything
    setActivePinia(createPinia())
    ;({ wrapper } = await mountAs({ ...OWNER, id: 5 }, overviewFor('owner')))
    const theirs = wrapper.findAll('[data-testid="chat-message"]')[0]
    expect(theirs.find('[data-testid="message-reported"]').exists()).toBe(false)
  })

  it('lets the finder neither accept nor decline while a dispute is open', async () => {
    ;({ wrapper } = await mountAs(FINDER, overviewFor('finder', { disputeOpen: true })))
    expect(byTestId(wrapper, 'accept-claim').attributes('disabled')).toBeDefined()
    expect(byTestId(wrapper, 'decline-claim').attributes('disabled')).toBeDefined()
  })
})
