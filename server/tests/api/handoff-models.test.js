import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { assertTestDatabase } = require('./helpers')
const { seedDatabase } = require('../../scripts/seed')
const Match = require('../../models/match-model')
const Claim = require('../../models/claim-model')
const Message = require('../../models/message-model')
const Handoff = require('../../models/handoff-model')

let matchId

beforeAll(async () => {
  assertTestDatabase()
  await seedDatabase()
  const [match] = await Match.saveMany([
    { lostItemId: 1, foundItemId: 2, score: 90, breakdown: { C: 100, A: 80, L: 100, D: 90 }, reasons: [] },
  ])
  matchId = match.id
})

describe('Match', () => {
  it('updates a pair that was scored before instead of adding a second row', async () => {
    await Match.saveMany([{ lostItemId: 1, foundItemId: 2, score: 70, breakdown: {}, reasons: [] }])
    const matches = await Match.findByItem(1)
    expect(matches).toHaveLength(1)
    expect(matches[0].score).toBe(70)
  })

  it('changes status and rejects an unknown one', async () => {
    expect((await Match.updateStatus(matchId, 'claimed')).status).toBe('claimed')
    await expect(Match.updateStatus(matchId, 'stolen')).rejects.toMatchObject({ status: 400 })
  })
})

describe('Claim', () => {
  it('creates an active claim logged against the claimer, and hides the claimer from others', async () => {
    const claim = await Claim.create({ matchId, claimerId: 1 })
    expect(claim).toMatchObject({ matchId, claimerId: 1, status: 'active', decidedAt: null })
    expect(await Claim.findActiveByMatch(matchId)).toMatchObject({ id: claim.id })
    expect(await Claim.findByMatches([matchId])).toHaveLength(1)
    expect(Claim.toPublic(claim)).not.toHaveProperty('claimerId')
  })

  it('allows only one active claim per match', async () => {
    await expect(Claim.create({ matchId, claimerId: 1 })).rejects.toMatchObject({ status: 409 })
  })

  it('declines a claim, after which the match can be claimed again', async () => {
    const [claim] = await Claim.findByMatch(matchId)
    const declined = await Claim.update(claim.id, { status: 'declined', decidedAt: new Date().toISOString() })
    expect(declined.status).toBe('declined')
    expect(await Claim.findActiveByMatch(matchId)).toBeNull()
    await expect(Claim.update(claim.id, { status: 'stolen' })).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a claim for a match that does not exist', async () => {
    await expect(Claim.create({ matchId: 999999, claimerId: 1 })).rejects.toMatchObject({ status: 400 })
  })
})

describe('Message', () => {
  it('returns messages oldest first, and only newer ones when asked', async () => {
    const first = await Message.create({ matchId, senderId: 1, text: 'Hi, is this yours?' })
    const second = await Message.create({ matchId, senderId: 2, text: 'Yes! Thank you' })

    const all = await Message.findByMatch(matchId)
    expect(all.map((m) => m.text)).toEqual(['Hi, is this yours?', 'Yes! Thank you'])

    const newer = await Message.findByMatch(matchId, { after: first.sentAt })
    expect(newer.map((m) => m.id)).toEqual([second.id])
  })

  it('hides the text of a removed message, except from the admin view', async () => {
    const third = await Message.create({ matchId, senderId: 2, text: 'rude words' })
    const removed = await Message.remove(third.id)
    expect(removed.removedAt).toBeTruthy()

    const chat = await Message.findByMatch(matchId)
    expect(chat.find((m) => m.id === third.id).text).toBe('')
    expect((await Message.findById(third.id)).text).toBe('')
    expect((await Message.findById(third.id, { keepRemovedText: true })).text).toBe('rude words')
  })

  it('finds the messages around one, oldest first', async () => {
    const all = await Message.findByMatch(matchId)
    const middle = await Message.findById(all[1].id, { keepRemovedText: true })
    const around = await Message.findAround(middle, 1)
    expect(around.map((m) => m.id)).toEqual([all[0].id, all[1].id, all[2].id])
    expect(around[2].text).toBe('rude words')
  })
})

describe('Handoff', () => {
  it('creates, completes and lists handoffs', async () => {
    const handoff = await Handoff.create({
      matchId, method: 'drop-off', spotId: 10, scheduledAt: '2026-10-10T04:00:00Z',
    })
    expect(handoff).toMatchObject({ method: 'drop-off', spotId: 10, status: 'pending' })

    const done = await Handoff.update(handoff.id, { status: 'completed' })
    expect(done.status).toBe('completed')

    expect(await Handoff.findByMatch(matchId)).toHaveLength(1)
    expect((await Handoff.findAll()).map((h) => h.id)).toContain(handoff.id)
  })

  it('rejects an unknown method', async () => {
    await expect(Handoff.create({ matchId, method: 'courier', spotId: 10 }))
      .rejects.toMatchObject({ status: 400 })
  })
})
