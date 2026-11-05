import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')
const { assertTestDatabase } = require('./helpers')
const { seedDatabase } = require('../../scripts/seed')
const Match = require('../../models/match-model')
const Handoff = require('../../models/handoff-model')
const Item = require('../../models/item-model')

const DAY = 24 * 60 * 60 * 1000

const realSecret = process.env.CRON_SECRET

beforeAll(async () => {
  assertTestDatabase()
  await seedDatabase()
})

afterEach(() => {
  process.env.CRON_SECRET = realSecret
})

describe('daily job', () => {
  it('rejects a missing or wrong secret', async () => {
    expect((await request(app).get('/api/cron/daily')).status).toBe(401)
    const wrong = await request(app).get('/api/cron/daily').set('Authorization', 'Bearer wrong')
    expect(wrong.status).toBe(401)
  })

  it('rejects every caller when no secret is configured', async () => {
    delete process.env.CRON_SECRET
    const res = await request(app).get('/api/cron/daily').set('Authorization', 'Bearer undefined')
    expect(res.status).toBe(401)
  })

  it('archives the two stale seed items, then finds nothing more to do', async () => {
    const first = await request(app).get('/api/cron/daily')
      .set('Authorization', `Bearer ${realSecret}`)
    expect(first.status).toBe(200)
    expect(first.body).toEqual({ ok: true, archived: 2, handoffsCompleted: 0 })

    const archived = await request(app).get('/api/items?status=archived')
    expect(archived.body).toHaveLength(2)

    const second = await request(app).get('/api/cron/daily')
      .set('Authorization', `Bearer ${realSecret}`)
    expect(second.body).toEqual({ ok: true, archived: 0, handoffsCompleted: 0 })
  })

  it('completes handoffs handed over more than 7 days ago that the owner never confirmed', async () => {
    // Seeded pairs 3 and 4: lost items 5 and 7, found items 6 and 8
    const [old] = await Match.saveMany([{ lostItemId: 5, foundItemId: 6, score: 90, breakdown: {}, reasons: [] }])
    const [recent] = await Match.saveMany([{ lostItemId: 7, foundItemId: 8, score: 90, breakdown: {}, reasons: [] }])
    // Both were claimed, which is what lets a handoff complete
    await Match.updateStatus(old.id, 'claimed')
    await Match.updateStatus(recent.id, 'claimed')
    const oldHandoff = await Handoff.create({ matchId: old.id, method: 'drop-off', spotId: 10, scheduledAt: null })
    const recentHandoff = await Handoff.create({ matchId: recent.id, method: 'meetup', spotId: 5, scheduledAt: null })
    await Handoff.update(oldHandoff.id, { status: 'handed_over', handedOverAt: new Date(Date.now() - 8 * DAY).toISOString() })
    await Handoff.update(recentHandoff.id, { status: 'handed_over', handedOverAt: new Date(Date.now() - 2 * DAY).toISOString() })

    const res = await request(app).get('/api/cron/daily').set('Authorization', `Bearer ${realSecret}`)
    expect(res.body.handoffsCompleted).toBe(1)

    expect((await Handoff.findById(oldHandoff.id)).status).toBe('completed')
    expect((await Match.findById(old.id)).status).toBe('confirmed')
    expect((await Item.findById(5)).status).toBe('resolved')
    expect((await Item.findById(6)).status).toBe('resolved')

    expect((await Handoff.findById(recentHandoff.id)).status).toBe('handed_over')
    expect((await Item.findById(7)).status).toBe('open')
  })
})
