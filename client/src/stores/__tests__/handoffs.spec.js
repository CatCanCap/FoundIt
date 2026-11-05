import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ TOKEN_KEY: 'foundit_token', default: { get: vi.fn() } }))

import api from '@/api'
import { useAuthStore } from '../auth'
import { useHandoffsStore } from '../handoffs'

const rows = [{ matchId: 10, role: 'owner', claimStatus: 'active', lastMessage: null }]

function logIn(role = 'user') {
  const auth = useAuthStore()
  auth.token = 't'
  auth.user = { id: 1, name: 'Alice', role }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
  api.get.mockResolvedValue({ data: rows })
})

describe('handoffs store', () => {
  it('asks for nothing when logged out or for an admin', async () => {
    const store = useHandoffsStore()
    expect(await store.load()).toBe(false)
    logIn('admin')
    expect(await store.fetchRows()).toEqual([])
    expect(api.get).not.toHaveBeenCalled()
  })

  it('shares one request when the badge and the Handoffs page ask at once', async () => {
    logIn()
    const store = useHandoffsStore()
    const [, fetched] = await Promise.all([store.load(), store.fetchRows()])
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(fetched).toEqual(rows)
    expect(store.rows).toEqual(rows)
  })

  it('asks for nothing with a leftover token when nobody is logged in', async () => {
    // The server was down at start-up: the token stays, but the login page shows
    const auth = useAuthStore()
    auth.token = 't'
    auth.user = null
    const store = useHandoffsStore()
    expect(await store.load()).toBe(false)
    expect(await store.fetchRows()).toEqual([])
    expect(api.get).not.toHaveBeenCalled()
    expect(store.toasts).toEqual([])
  })

  it('starts clean for the next person on a shared computer', async () => {
    logIn()
    const store = useHandoffsStore()
    await store.load()
    store.markSeen(10, '2026-10-14T01:24:00Z')
    store.toasts.push({ id: 'message-10-x', kind: 'message', matchId: 10, title: 'Bag' })
    expect(store.rows).toEqual(rows)

    // Alice logs out and Ben logs in on the same browser
    const auth = useAuthStore()
    auth.user = null
    await nextTick()
    auth.user = { id: 2, name: 'Ben', role: 'user' }
    await nextTick()
    expect(store.rows).toEqual([])
    expect(store.toasts).toEqual([])
    expect(store.seen).toEqual({})

    // Alice's marks are still hers when she comes back
    auth.user = { id: 1, name: 'Alice', role: 'user' }
    await nextTick()
    expect(store.seen).toEqual({ 10: '2026-10-14T01:24:00Z' })
  })

  it('never shows rows that arrive after the person changed', async () => {
    logIn()
    const store = useHandoffsStore()
    let answer
    api.get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const asked = store.fetchRows()
    useAuthStore().user = { id: 2, name: 'Ben', role: 'user' }
    await nextTick()
    answer({ data: rows })
    await asked
    expect(store.rows).toEqual([])
  })

  it('asks the server again on the next check, so nothing old is shown', async () => {
    logIn()
    const store = useHandoffsStore()
    await store.load()
    await store.load()
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('starts a new request after a step in the handoff even while one is on its way', async () => {
    logIn()
    const store = useHandoffsStore()
    await Promise.all([store.load(), store.load({ fresh: true })])
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('throws from fetchRows so the page can say what went wrong, but load stays quiet', async () => {
    logIn()
    api.get.mockRejectedValue(new Error('offline'))
    const store = useHandoffsStore()
    await expect(store.fetchRows()).rejects.toThrow('offline')
    expect(await store.load({ fresh: true })).toBe(false)
  })
})
