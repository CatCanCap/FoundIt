import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

// Only so the models load without config.env; every lookup below is a spy, so
// this file never reaches a database
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'unit-test-key'
const Item = require('../../models/item-model')
const Match = require('../../models/match-model')
const User = require('../../models/user-model')
const emailjs = require('../../alerts/emailjs')
const alerts = require('../../alerts')

// No database: the model lookups and the sending are replaced with spies
const items = {
  1: { id: 1, title: 'Black umbrella', postedBy: 10 },
  2: { id: 2, title: 'Umbrella by the lifts', postedBy: 20 },
}
const users = {
  10: { name: 'Alice', email: 'alice@smu.edu.sg', alertsOn: true },
  20: { name: 'Ben', email: 'ben@smu.edu.sg', alertsOn: true },
}
const match = (id) => ({ id, lostItemId: 1, foundItemId: 2, score: 80, reasons: [] })

afterEach(() => vi.restoreAllMocks())

describe('notifyNewMatches', () => {
  it('sends every email, even when one of them fails', async () => {
    vi.spyOn(Item, 'findById').mockImplementation(async (id) => items[id])
    vi.spyOn(User, 'findById').mockImplementation(async (id) => users[id])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const send = vi
      .spyOn(emailjs, 'sendEmail')
      .mockRejectedValueOnce(new Error('EmailJS is down'))
      .mockResolvedValue(true)

    await alerts.notifyNewMatches([match(1), match(2)])

    // Two matches × two people, and the first failure did not stop the other three
    expect(send).toHaveBeenCalledTimes(4)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('names the place in the owner’s email only when their reports already said it', async () => {
    vi.spyOn(Item, 'findById').mockImplementation(async (id) => items[id])
    vi.spyOn(User, 'findById').mockImplementation(async (id) => ({ ...users[id], id, role: 'user' }))
    vi.spyOn(Item, 'findAll').mockImplementation(async ({ status }) => (status ? [] : [items[1]]))
    const reasons = ['same category', 'same floor: SCIS 1 Level 2']
    const knows = { ...match(3), breakdown: { C: 100, A: 80, L: 80, D: 90 }, reasons }
    const guessed = { ...knows, breakdown: { C: 100, A: 80, L: 80, D: 20 } }
    const send = vi.spyOn(emailjs, 'sendEmail').mockResolvedValue(true)

    vi.spyOn(Match, 'findByLostItems').mockResolvedValue([knows])
    await alerts.notifyNewMatches([knows])
    expect(send.mock.calls[0][0].message).toContain('same floor')

    // Another of the owner's reports guessed the time wrong: the email says less
    send.mockClear()
    vi.spyOn(Match, 'findByLostItems').mockResolvedValue([knows, guessed])
    await alerts.notifyNewMatches([knows])
    expect(send.mock.calls[0][0].message).toContain('(same category)')
    expect(send.mock.calls[0][0].message).not.toContain('same floor')

    // A lookup that fails leaves the place out too
    send.mockClear()
    vi.spyOn(Match, 'findByLostItems').mockRejectedValue(new Error('database down'))
    await alerts.notifyNewMatches([knows])
    expect(send.mock.calls[0][0].message).not.toContain('same floor')
  })

  it('sends nothing when there are no new matches', async () => {
    const send = vi.spyOn(emailjs, 'sendEmail')
    await alerts.notifyNewMatches([])
    expect(send).not.toHaveBeenCalled()
  })
})

describe('notifyNewClaim', () => {
  it('emails the finder of the claimed find', async () => {
    vi.spyOn(Item, 'findById').mockImplementation(async (id) => items[id])
    vi.spyOn(User, 'findById').mockImplementation(async (id) => users[id])
    const send = vi.spyOn(emailjs, 'sendEmail').mockResolvedValue(true)

    await alerts.notifyNewClaim(match(7))

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].toEmail).toBe('ben@smu.edu.sg')
  })

  it('never throws, so a failed email cannot undo the claim', async () => {
    vi.spyOn(Item, 'findById').mockRejectedValue(new Error('database is down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(alerts.notifyNewClaim(match(7))).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledTimes(1)
  })
})
