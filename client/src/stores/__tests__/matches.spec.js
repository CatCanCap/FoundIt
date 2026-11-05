import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({
  TOKEN_KEY: 'foundit_token',
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

import api from '@/api'
import { useAuthStore } from '../auth'
import { useMatchesStore } from '../matches'

const reports = [
  {
    item: { id: 1 },
    matches: [
      { id: 11, status: 'suggested' },
      { id: 12, status: 'rejected' },
    ],
  },
  {
    item: { id: 2 },
    matches: [
      { id: 21, status: 'suggested' },
      { id: 22, status: 'claimed' },
    ],
  },
]

function logIn(role = 'user') {
  const auth = useAuthStore()
  auth.token = 't'
  auth.user = { id: 1, name: 'Alice', role }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('matches store', () => {
  it('loads a student’s reports and counts the finds still waiting for an answer', async () => {
    logIn()
    api.get.mockResolvedValue({ data: { reports } })
    const store = useMatchesStore()
    await store.load()
    expect(api.get).toHaveBeenCalledWith('/matches/mine')
    expect(store.count).toBe(2)
  })

  it('asks for nothing when logged out or for an admin', async () => {
    const store = useMatchesStore()
    await store.load()
    logIn('admin')
    await store.load()
    expect(api.get).not.toHaveBeenCalled()
    expect(store.count).toBe(0)
  })

  it('throws from load but keeps the last reports quietly on refresh', async () => {
    logIn()
    api.get.mockResolvedValueOnce({ data: { reports } })
    const store = useMatchesStore()
    await store.refresh()
    api.get.mockRejectedValue(new Error('offline'))
    expect(await store.refresh()).toBe(false)
    expect(store.count).toBe(2)
    await expect(store.load()).rejects.toThrow('offline')
  })

  it('counts down as finds are seen, and remembers them in this browser', async () => {
    logIn()
    api.get.mockResolvedValue({ data: { reports } })
    const store = useMatchesStore()
    await store.load()
    store.markSeen([11])
    expect(store.count).toBe(1)
    setActivePinia(createPinia())
    logIn()
    const again = useMatchesStore()
    await again.load()
    expect(again.count).toBe(1)
  })

  it('asks the server again on the next call, so nothing old is shown', async () => {
    logIn()
    api.get.mockResolvedValue({ data: { reports } })
    const store = useMatchesStore()
    await store.load()
    await store.refresh()
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('asks again for someone else who signs in', async () => {
    logIn()
    api.get.mockResolvedValue({ data: { reports } })
    const store = useMatchesStore()
    await store.load()
    useAuthStore().user = { id: 2, name: 'Ben', role: 'user' }
    await store.load()
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('keeps what each account has seen apart, so the next student on a shared PC starts fresh', async () => {
    logIn()
    api.get.mockResolvedValue({ data: { reports } })
    const store = useMatchesStore()
    await store.load()
    store.markSeen([11, 21])
    expect(store.count).toBe(0)

    // Alice signs out and Ben signs in on the same browser
    useAuthStore().user = { id: 2, name: 'Ben', role: 'user' }
    await Promise.resolve()
    expect(store.reports).toEqual([])
    await store.load()
    expect(store.count).toBe(2)
    expect(localStorage.getItem('foundit-matches-seen-1')).toBe('[11,21]')
    expect(localStorage.getItem('foundit-matches-seen-2')).toBeNull()
  })

  it('closes a report with "I found it myself" and drops it from the list', async () => {
    logIn()
    api.get.mockResolvedValue({ data: { reports: structuredClone(reports) } })
    api.patch.mockResolvedValue({ data: {} })
    const store = useMatchesStore()
    await store.load()
    await store.closeReport(1)
    expect(api.patch).toHaveBeenCalledWith('/items/1', { status: 'resolved' })
    expect(store.reports.map((report) => report.item.id)).toEqual([2])
  })

  it('hides a find with "Not mine" from every report', async () => {
    logIn()
    api.get.mockResolvedValue({ data: { reports: structuredClone(reports) } })
    api.post.mockResolvedValue({ data: {} })
    const store = useMatchesStore()
    await store.load()
    await store.rejectMatch(21)
    expect(api.post).toHaveBeenCalledWith('/matches/21/reject')
    expect(store.reports[1].matches.map((match) => match.id)).toEqual([22])
    expect(store.count).toBe(1)
  })

  it('remembers declined claims the owner hid, per account', () => {
    logIn()
    const store = useMatchesStore()
    store.hideDeclined(30)
    expect(store.hidden.has(30)).toBe(true)
    expect(localStorage.getItem('foundit-hidden-declined-1')).toBe('[30]')
  })
})
