import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')
const Match = require('../../models/match-model')
const Item = require('../../models/item-model')
const { assertTestDatabase } = require('./helpers')
const { seedDatabase } = require('../../scripts/seed')

// Seeded: Alice posted the lost items, Ben the found items, Chloe the decoys.
// Pair k is lost item 2k-1 and found item 2k.
let alice, ben

async function login(email, password) {
  return (await request(app).post('/api/auth/login').send({ email, password })).body.token
}

function as(token) {
  const auth = (r) => r.set('Authorization', `Bearer ${token}`)
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
  }
}

async function suggest(k, score = 90) {
  const [match] = await Match.saveMany([
    { lostItemId: 2 * k - 1, foundItemId: 2 * k, score, breakdown: { C: 100, A: 80, L: 100, D: 90 }, reasons: ['same category'] },
  ])
  return match
}

beforeAll(async () => {
  assertTestDatabase()
  await seedDatabase()
  alice = await login('alice.tan.2024@scis.smu.edu.sg', 'FoundIt-demo-1')
  ben = await login('ben.lim.2024@business.smu.edu.sg', 'FoundIt-demo-2')
})

describe('GET /api/matches/mine', () => {
  it('needs a login', async () => {
    expect((await request(app).get('/api/matches/mine')).status).toBe(401)
  })

  it('lists your lost reports with the found items that might be them', async () => {
    const match = await suggest(1, 91)
    const res = await as(alice).get('/api/matches/mine')
    expect(res.status).toBe(200)

    const report = res.body.reports.find((r) => r.item.id === 1)
    expect(report.item.type).toBe('lost')
    const shown = report.matches.find((m) => m.id === match.id)
    expect(shown).toMatchObject({ score: 91, foundItemId: 2, status: 'suggested' })
    expect(shown.item).toMatchObject({ id: 2, type: 'found' })
    expect(shown.item.trail.length).toBe(1)
    // Reports with matches come first
    expect(res.body.reports[0].matches.length).toBeGreaterThan(0)
  })

  it('hides where and when the find was handed in unless the report already said it', async () => {
    const [match] = await Match.saveMany([{
      lostItemId: 5, foundItemId: 6, score: 70, breakdown: { C: 100, A: 90, L: 30, D: 100 },
      reasons: ['same category', 'nearby buildings: SOE and SCIS 1', 'within a day'],
    }])
    const res = await as(alice).get('/api/matches/mine')
    const shown = res.body.reports.find((r) => r.item.id === 5).matches.find((m) => m.id === match.id)
    expect(shown.item.placeHidden).toBe(true)
    expect(shown.item.trail).toEqual([{ spotId: null, roomId: null, from: null, to: null }])
    expect(shown.reasons).toEqual(['same category'])
    expect(shown.reasonParts).toEqual([{ lead: 'same category', detail: '' }])
    expect(shown.breakdown).toMatchObject({ L: null, D: null })
    expect(shown.score).toBe(70)
  })

  it('shows nothing of other people', async () => {
    const res = await as(ben).get('/api/matches/mine')
    expect(res.status).toBe(200)
    // Ben only posted found items
    expect(res.body.reports).toEqual([])
  })

  it('leaves out a resolved lost report', async () => {
    await suggest(2)
    await Item.updateStatus(3, 'resolved')
    const res = await as(alice).get('/api/matches/mine')
    expect(res.body.reports.some((r) => r.item.id === 3)).toBe(false)
  })
})

describe('POST /api/matches/:id/reject', () => {
  it('lets the owner hide a suggested match, which then leaves the page', async () => {
    const match = await suggest(4)
    const res = await as(alice).post(`/api/matches/${match.id}/reject`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('rejected')

    const page = await as(alice).get('/api/matches/mine')
    const report = page.body.reports.find((r) => r.item.id === 7)
    expect(report.matches.some((m) => m.id === match.id)).toBe(false)
  })

  it('stays hidden when the pair is scored again', async () => {
    const match = await suggest(5)
    await as(alice).post(`/api/matches/${match.id}/reject`)
    const [again] = await Match.saveMany([
      { lostItemId: 9, foundItemId: 10, score: 95, breakdown: {}, reasons: [] },
    ])
    expect(again.status).toBe('rejected')
  })

  it('refuses the finder and anyone else (403)', async () => {
    const match = await suggest(6)
    expect((await as(ben).post(`/api/matches/${match.id}/reject`)).status).toBe(403)
  })

  it('refuses a match that is not suggested any more (409)', async () => {
    const match = await suggest(7)
    await Match.updateStatus(match.id, 'claimed')
    expect((await as(alice).post(`/api/matches/${match.id}/reject`)).status).toBe(409)
  })

  it('answers 404 for a missing match and 400 for a bad id', async () => {
    expect((await as(alice).post('/api/matches/999999/reject')).status).toBe(404)
    expect((await as(alice).post('/api/matches/abc/reject')).status).toBe(400)
  })
})
