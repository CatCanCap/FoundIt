import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

// Only so the models load without config.env; every lookup below is a spy, so
// this file never reaches a database
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'unit-test-key'
const Item = require('../../models/item-model')
const Spot = require('../../models/spot-model')
const Category = require('../../models/category-model')
const Colour = require('../../models/colour-model')
const Match = require('../../models/match-model')
const ItemEmbedding = require('../../models/item-embedding-model')
const alerts = require('../../alerts')
const matching = require('../../matching')
const { runMatching } = require('../../matching/run')

// Alice's lost report 1, edited so that it no longer matches finds 2 and 4
const report = { id: 1, type: 'lost', title: 'Edited report', trail: [] }
const finds = [{ id: 2, type: 'found' }, { id: 4, type: 'found' }]
const earlier = [
  // Her report named find 2's building around that time
  { id: 20, lostItemId: 1, foundItemId: 2, status: 'suggested', breakdown: { L: 80, D: 90 } },
  // It guessed find 4's building wrong
  { id: 40, lostItemId: 1, foundItemId: 4, status: 'suggested', breakdown: { L: 0, D: 90 } },
]

// Where @vercel/functions looks for the running request on Vercel
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context')

afterEach(() => {
  vi.restoreAllMocks()
  delete globalThis[REQUEST_CONTEXT]
})

// A new item with one new match, and nothing saved before
function oneNewMatch() {
  vi.spyOn(Item, 'findOpenByType').mockResolvedValue(finds)
  vi.spyOn(Spot, 'findAll').mockResolvedValue([])
  vi.spyOn(Category, 'findAll').mockResolvedValue([])
  vi.spyOn(Colour, 'findAll').mockResolvedValue([])
  // No embeddings, so the test never calls Google or a database
  vi.spyOn(ItemEmbedding, 'findByItemIds').mockRejectedValue(new Error('no embeddings here'))
  vi.spyOn(Match, 'findByItem').mockResolvedValue([])
  vi.spyOn(matching, 'findMatches').mockResolvedValue([
    { candidateId: 2, score: 80, breakdown: {}, reasons: [] },
  ])
  const saved = [{ id: 7, lostItemId: 1, foundItemId: 2, isNew: true }]
  vi.spyOn(Match, 'saveMany').mockResolvedValue(saved)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  return saved
}

describe('runMatching after an edit', () => {
  it('deletes pairs that no longer fit, but keeps a wrong guess at the place as rejected', async () => {
    vi.spyOn(Item, 'findOpenByType').mockResolvedValue(finds)
    vi.spyOn(Spot, 'findAll').mockResolvedValue([])
    vi.spyOn(Category, 'findAll').mockResolvedValue([])
    vi.spyOn(Colour, 'findAll').mockResolvedValue([])
    vi.spyOn(Match, 'findByItem').mockResolvedValue(earlier)
    vi.spyOn(matching, 'findMatches').mockResolvedValue([])
    const save = vi.spyOn(Match, 'saveMany').mockResolvedValue([])
    const remove = vi.spyOn(Match, 'removeSuggested').mockResolvedValue()
    const reject = vi.spyOn(Match, 'rejectSuggested').mockResolvedValue()

    await runMatching(report)

    expect(remove).toHaveBeenCalledWith([20])
    // Deleting it would let her post another guess at where find 4 was handed in
    expect(reject).toHaveBeenCalledWith([40])
    expect(save).not.toHaveBeenCalled()
  })
})

describe('runMatching and the alert emails', () => {
  it('returns the saved matches without waiting for the emails, and hands them to Vercel', async () => {
    const saved = oneNewMatch()
    const waitUntil = vi.fn()
    globalThis[REQUEST_CONTEXT] = { get: () => ({ waitUntil }) }
    let finishEmails
    const notify = vi.spyOn(alerts, 'notifyNewMatches')
      .mockReturnValue(new Promise((resolve) => { finishEmails = resolve }))

    // The emails never finish here, yet runMatching still returns
    expect(await runMatching(report)).toEqual(saved)
    expect(notify).toHaveBeenCalledWith(saved)
    // Vercel keeps the function running until this promise settles
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise)
    finishEmails()
  })

  it('logs a failed email instead of failing the post', async () => {
    const saved = oneNewMatch()
    let sending
    globalThis[REQUEST_CONTEXT] = { get: () => ({ waitUntil: (promise) => { sending = promise } }) }
    vi.spyOn(alerts, 'notifyNewMatches').mockRejectedValue(new Error('email service down'))

    expect(await runMatching(report)).toEqual(saved)
    await expect(sending).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('Match alerts failed for item 1:', expect.any(Error))
  })
})
