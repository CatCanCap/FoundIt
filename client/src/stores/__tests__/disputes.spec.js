import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ default: { get: vi.fn() }, TOKEN_KEY: 'foundit_token' }))

import api from '@/api'
import { useAuthStore } from '../auth'
import { useDisputesStore } from '../disputes'

const upheld = {
  id: 150,
  itemId: 2,
  status: 'upheld',
  decidedAt: '2026-10-25T09:00:00Z',
  item: { id: 2, title: 'Black Coach wallet' },
}

function answer({ mine = [], onMyClaims = [] } = {}) {
  api.get.mockImplementation(async (url) => {
    if (url === '/disputes/mine') return { data: mine }
    if (url === '/disputes/on-my-claims') return { data: onMyClaims }
    return { data: [] }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
  useAuthStore().token = 'token'
  useAuthStore().user = { id: 7, name: 'Chloe Ng', role: 'user' }
})

describe('disputes store', () => {
  it('pops up each new verdict once, naming the item', async () => {
    answer({ mine: [upheld] })
    const disputes = useDisputesStore()
    await disputes.load()
    expect(disputes.toasts).toEqual([
      { id: 'verdict-150', disputeId: 150, title: 'Black Coach wallet' },
    ])
    expect(disputes.unreadCount).toBe(1)

    disputes.dismissToast('verdict-150')
    await disputes.load()
    expect(disputes.toasts).toEqual([])
    // Closing the notice is not the same as reading the verdict
    expect(disputes.unreadCount).toBe(1)
  })

  it('remembers what was read in this browser, for each account', async () => {
    answer({ mine: [upheld] })
    let disputes = useDisputesStore()
    await disputes.load()
    disputes.markRead(150)
    expect(disputes.toasts).toEqual([])
    expect(disputes.unreadCount).toBe(0)

    // A fresh start (a page refresh) keeps it read and does not pop it up again
    setActivePinia(createPinia())
    useAuthStore().token = 'token'
    useAuthStore().user = { id: 7, name: 'Chloe Ng', role: 'user' }
    disputes = useDisputesStore()
    await disputes.load()
    expect(disputes.unreadCount).toBe(0)
    expect(disputes.toasts).toEqual([])

    // Someone else on the same laptop still hears about their own verdicts
    useAuthStore().user = { id: 8, name: 'Alice Tan', role: 'user' }
    await disputes.load()
    expect(disputes.unreadCount).toBe(1)
  })

  it('leaves out the claimer withdrawing their own claim, and open disputes', async () => {
    answer({
      onMyClaims: [
        { ...upheld, id: 151, status: 'withdrawn' },
        { ...upheld, id: 152, status: 'open', decidedAt: null },
      ],
    })
    const disputes = useDisputesStore()
    await disputes.load()
    expect(disputes.unreadCount).toBe(0)
    expect(disputes.toasts).toEqual([])
  })

  it("forgets the last person's disputes and notices when they log out", async () => {
    answer({ mine: [upheld] })
    const disputes = useDisputesStore()
    await disputes.load()
    expect(disputes.verdicts).toHaveLength(1)
    expect(disputes.toasts).toHaveLength(1)

    useAuthStore().logout()
    expect(disputes.raised).toEqual([])
    expect(disputes.onMyClaims).toEqual([])
    expect(disputes.toasts).toEqual([])
    expect(disputes.unreadCount).toBe(0)
  })

  it('drops an answer that arrives after someone else signed in', async () => {
    let finish
    api.get.mockImplementation(
      (url) =>
        new Promise((resolve) => {
          if (url === '/disputes/mine') finish = () => resolve({ data: [upheld] })
          else resolve({ data: [] })
        }),
    )
    const disputes = useDisputesStore()
    const loading = disputes.load()
    useAuthStore().user = { id: 8, name: 'Alice Tan', role: 'user' }
    finish()
    expect(await loading).toBe(false)
    expect(disputes.raised).toEqual([])
    expect(disputes.toasts).toEqual([])
  })

  it('keeps the marks of each account under its own user id', async () => {
    answer({ mine: [upheld] })
    const disputes = useDisputesStore()
    await disputes.load()
    disputes.markRead(150)
    expect(JSON.parse(localStorage.getItem('foundit-verdicts-7')).read).toEqual([150])
    expect(localStorage.getItem('foundit-verdicts-8')).toBe(null)
  })

  it('checks nothing for an admin', async () => {
    useAuthStore().user = { id: 1, name: 'FoundIt Admin', role: 'admin' }
    const disputes = useDisputesStore()
    expect(await disputes.load()).toBe(false)
    expect(api.get).not.toHaveBeenCalled()
  })
})
