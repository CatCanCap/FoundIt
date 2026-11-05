import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')
const Match = require('../../models/match-model')
const Item = require('../../models/item-model')
const Spot = require('../../models/spot-model')
const Message = require('../../models/message-model')
const { assertTestDatabase } = require('./helpers')
const { seedDatabase } = require('../../scripts/seed')

// Seeded: Alice posted the lost items, Ben the found items, Chloe the decoys.
// Pair k is lost item 2k-1 and found item 2k.
let alice, ben, chloe, collectionPoints
const originalAnnounce = Message.announce
let pings

async function login(email, password) {
  return (await request(app).post('/api/auth/login').send({ email, password })).body.token
}

function as(token) {
  const auth = (r) => r.set('Authorization', `Bearer ${token}`)
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    patch: (url, body) => auth(request(app).patch(url)).send(body),
  }
}

// A fresh suggested match for seeded pair k
async function matchForPair(k) {
  const [match] = await Match.saveMany([
    { lostItemId: 2 * k - 1, foundItemId: 2 * k, score: 90, breakdown: {}, reasons: [] },
  ])
  return match
}

// Alice claims pair k with one detail only she would know
async function claimed(k) {
  const match = await matchForPair(k)
  const res = await as(alice).post(`/api/claims/${match.id}`, { detail: 'A blue star sticker on the lid' })
  expect(res.status).toBe(201)
  return match
}

beforeAll(async () => {
  assertTestDatabase()
  await seedDatabase()
  alice = await login('alice.tan.2024@scis.smu.edu.sg', 'FoundIt-demo-1')
  ben = await login('ben.lim.2024@business.smu.edu.sg', 'FoundIt-demo-2')
  chloe = await login('chloe.ng.2025@economics.smu.edu.sg', 'FoundIt-demo-3')
  collectionPoints = await Spot.findCollectionPoints()
})

beforeEach(() => {
  pings = []
  Message.announce = async (channel) => { pings.push(channel) }
})

afterEach(() => {
  Message.announce = originalAnnounce
})

describe('claim', () => {
  it('needs a detail, from the owner only', async () => {
    const match = await matchForPair(3)
    expect((await as(alice).post(`/api/claims/${match.id}`, {})).status).toBe(400)
    expect((await as(ben).post(`/api/claims/${match.id}`, { detail: 'mine' })).status).toBe(403)
    expect((await as(chloe).post(`/api/claims/${match.id}`, { detail: 'mine' })).status).toBe(403)
  })

  it('marks the match claimed and both items matched, and shows the detail to both people', async () => {
    const match = await matchForPair(5)
    const res = await as(alice).post(`/api/claims/${match.id}`, { detail: '  A blue star sticker  ' })
    expect(res.status).toBe(201)
    expect(res.body.claim).toMatchObject({ detail: 'A blue star sticker', status: 'active' })
    expect(res.body.claim).not.toHaveProperty('claimerId')
    expect((await Match.findById(match.id)).status).toBe('claimed')
    expect((await Item.findById(9)).status).toBe('matched')
    expect((await Item.findById(10)).status).toBe('matched')

    const forBen = await as(ben).get(`/api/claims/${match.id}`)
    expect(forBen.body).toMatchObject({ role: 'finder', claim: { detail: 'A blue star sticker' }, lostItem: null })
    expect((await as(chloe).get(`/api/claims/${match.id}`)).status).toBe(403)
    // A retried claim from the same owner answers with the claim that stands
    const again = await as(alice).post(`/api/claims/${match.id}`, { detail: 'again' })
    expect(again.status).toBe(200)
    expect(again.body.claim).toMatchObject({ detail: 'A blue star sticker', status: 'active' })
  })

  it('lets the finder decline, which reopens both items and closes the chat', async () => {
    const match = await claimed(6)
    expect((await as(alice).post(`/api/claims/${match.id}/decline`, { reason: 'No' })).status).toBe(403)
    expect((await as(ben).post(`/api/claims/${match.id}/decline`, {})).status).toBe(400)
    const res = await as(ben).post(`/api/claims/${match.id}/decline`, { reason: 'No sticker on it' })
    expect(res.status).toBe(200)
    expect(res.body.claim).toBeNull()
    expect((await Match.findById(match.id)).status).toBe('rejected')
    expect((await Item.findById(11)).status).toBe('open')
    expect((await Item.findById(12)).status).toBe('open')
    expect((await as(alice).get(`/api/messages/${match.id}`)).status).toBe(403)
    const forAlice = (await as(alice).get(`/api/claims/${match.id}`)).body
    expect(forAlice.closed).toMatchObject({ status: 'declined', reason: 'No sticker on it' })
  })

  it('refuses a claim on an item already being returned through another match', async () => {
    await claimed(7)
    // A second suggested match on the same found item 14
    const [other] = await Match.saveMany([{ lostItemId: 81, foundItemId: 14, score: 60, breakdown: {}, reasons: [] }])
    const res = await as(chloe).post(`/api/claims/${other.id}`, { detail: 'Mine' })
    expect(res.status).toBe(400)
  })

  it('lists the claims for both people', async () => {
    const forAlice = (await as(alice).get('/api/claims/mine')).body
    expect(forAlice.length).toBeGreaterThan(0)
    expect(forAlice.every((row) => row.role === 'owner')).toBe(true)
    const forBen = (await as(ben).get('/api/claims/mine')).body
    expect(forBen.every((row) => row.role === 'finder')).toBe(true)
  })
})

describe('chat', () => {
  it('stays closed until the owner claims, then pings on each message', async () => {
    const match = await matchForPair(8)
    expect((await as(alice).get(`/api/messages/${match.id}`)).status).toBe(403)
    await as(alice).post(`/api/claims/${match.id}`, { detail: 'A blue star sticker' })

    const sent = await as(ben).post(`/api/messages/${match.id}`, { text: '  Found it by the lifts  ' })
    expect(sent.status).toBe(201)
    expect(sent.body.text).toBe('Found it by the lifts')

    const { channel } = (await as(alice).get(`/api/messages/${match.id}/channel`)).body
    expect(channel).toMatch(new RegExp(`^chat-${match.id}-[0-9a-f]{32}$`))
    expect(pings).toEqual([channel])

    await as(alice).post(`/api/messages/${match.id}`, { text: 'Thank you!' })
    const all = (await as(alice).get(`/api/messages/${match.id}`)).body
    expect(all.map((m) => m.text)).toEqual(['Found it by the lifts', 'Thank you!'])
    const newer = await as(ben).get(`/api/messages/${match.id}`).query({ after: all[0].sentAt })
    expect(newer.body.map((m) => m.text)).toEqual(['Thank you!'])

    expect((await as(chloe).get(`/api/messages/${match.id}`)).status).toBe(403)
  })
})

describe('handoff', () => {
  it('lists collection points nearest first', async () => {
    const res = await request(app).get('/api/handoffs/collection-points').query({ near: 5 })
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(collectionPoints.length)
    const distances = res.body.map((p) => p.distanceMetres)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
  })

  it('can only be planned after a claim, by the finder', async () => {
    const match = await matchForPair(9)
    const point = collectionPoints[0]
    expect((await as(ben).post('/api/handoffs', { matchId: match.id, method: 'meetup', spotId: point.id })).status).toBe(403)
    await as(alice).post(`/api/claims/${match.id}`, { detail: 'A blue star sticker' })
    expect((await as(alice).post('/api/handoffs', { matchId: match.id, method: 'meetup', spotId: point.id })).status).toBe(403)
  })

  it('runs pending, then handed over by the finder, then confirmed by the owner', async () => {
    const match = await claimed(10)
    const point = collectionPoints[0]

    expect((await as(ben).post('/api/handoffs', { matchId: match.id, method: 'drop-off', spotId: 5 })).status).toBe(400)
    const made = await as(ben).post('/api/handoffs', { matchId: match.id, method: 'drop-off', spotId: point.id })
    expect(made.status).toBe(201)
    expect(made.body).toMatchObject({ status: 'pending', method: 'drop-off', spotId: point.id })
    expect((await as(ben).post('/api/handoffs', { matchId: match.id, method: 'meetup', spotId: 5 })).status).toBe(409)
    expect((await as(alice).get(`/api/handoffs/match/${match.id}`)).body.id).toBe(made.body.id)
    expect((await as(ben).post(`/api/claims/${match.id}/decline`, { reason: 'Too late' })).status).toBe(400)

    const handoffUrl = `/api/handoffs/${made.body.id}`
    expect((await as(alice).post(`${handoffUrl}/handed-over`)).status).toBe(403)
    const handedOver = await as(ben).post(`${handoffUrl}/handed-over`)
    expect(handedOver.body.status).toBe('handed_over')
    expect(handedOver.body.handedOverAt).toBeTruthy()
    expect((await as(ben).patch(handoffUrl, { method: 'meetup' })).status).toBe(400)

    expect((await as(ben).post(`${handoffUrl}/confirm`)).status).toBe(403)
    const done = await as(alice).post(`${handoffUrl}/confirm`)
    expect(done.body.status).toBe('completed')
    expect((await Match.findById(match.id)).status).toBe('confirmed')
    expect((await Item.findById(19)).status).toBe('resolved')
    expect((await Item.findById(20)).status).toBe('resolved')

    // The chat is read-only now, and the resolved page has its figures
    expect((await as(alice).post(`/api/messages/${match.id}`, { text: 'Thanks!' })).status).toBe(409)
    const summary = await as(ben).get(`/api/handoffs/match/${match.id}/summary`)
    expect(summary.status).toBe(200)
    expect(summary.body.finderReturns).toBeGreaterThan(0)
  })

  it('lets the owner confirm straight away, without waiting for the finder', async () => {
    const match = await claimed(11)
    const made = await as(ben).post('/api/handoffs', { matchId: match.id, method: 'meetup', spotId: 5 })
    const done = await as(alice).post(`/api/handoffs/${made.body.id}/confirm`)
    expect(done.body.status).toBe('completed')
  })
})
