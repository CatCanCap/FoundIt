import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')
const matching = require('../../matching')
const alerts = require('../../alerts')
const Match = require('../../models/match-model')
const Item = require('../../models/item-model')
const { assertTestDatabase } = require('./helpers')
const { seedDatabase } = require('../../scripts/seed')
const { loadSeed } = require('../../data/load')

const originalFindMatches = matching.findMatches
const originalNotifyNewMatches = alerts.notifyNewMatches
let token, aliceToken

// Found where and when Alice's seeded umbrella (item 1) was lost. The seed's
// dates count back from today, so a fixed date here would drift further away
// every day and the match would eventually fall under the cut-off.
function foundUmbrella() {
  const { spotId, from } = loadSeed(new Date()).items[0].trail[0]
  const to = new Date(new Date(from).getTime() + 30 * 60 * 1000).toISOString()
  return {
    type: 'found', title: 'Black umbrella by the lifts', category: 'Umbrella', colour: 'Black',
    trail: [{ spotId, from, to }],
  }
}

function post(body) {
  return request(app).post('/api/items').set('Authorization', `Bearer ${token}`).send(body)
}

beforeAll(async () => {
  assertTestDatabase()
  await seedDatabase()
  const login = await request(app).post('/api/auth/login')
    .send({ email: 'ben.lim.2024@business.smu.edu.sg', password: 'FoundIt-demo-2' })
  token = login.body.token
  const alice = await request(app).post('/api/auth/login')
    .send({ email: 'alice.tan.2024@scis.smu.edu.sg', password: 'FoundIt-demo-1' })
  aliceToken = alice.body.token
})

afterEach(() => {
  matching.findMatches = originalFindMatches
  alerts.notifyNewMatches = originalNotifyNewMatches
})

function edit(itemId, body) {
  return request(app).patch(`/api/items/${itemId}`).set('Authorization', `Bearer ${token}`).send(body)
}

function result(candidateId, score) {
  return { candidateId, score, breakdown: { C: 100, A: 50, L: 50, D: 50 }, reasons: [] }
}

describe('matching hook', () => {
  it('scores a new item with the real engine', async () => {
    // Item 1 is Alice's black umbrella, lost at the same spot (spot 5)
    const res = await post(foundUmbrella())
    expect(res.status).toBe(201)
    expect(res.body.matches[0]).toMatchObject({ lostItemId: 1, status: 'suggested' })
    expect(res.body.matches.length).toBeLessThanOrEqual(5)
    expect(res.body.matches.every((m) => m.score >= 50)).toBe(true)
  })

  it('passes open opposite-type items and the reference lists to findMatches', async () => {
    let received
    matching.findMatches = (newItem, candidates, context) => {
      received = { newItem, candidates, context }
      return []
    }
    await post(foundUmbrella())

    expect(received.newItem.type).toBe('found')
    expect(received.candidates.length).toBeGreaterThan(0)
    expect(received.candidates.every((c) => c.type === 'lost' && c.status === 'open')).toBe(true)
    expect(received.candidates[0].trail.length).toBeGreaterThan(0)
    const seed = loadSeed(new Date())
    expect(received.context.spots).toHaveLength(seed.spots.length)
    expect(received.context.categories).toHaveLength(seed.categories.length)
    expect(received.context.colours.map((c) => c.name)).toContain('Navy')
  })

  it('saves the results with lost and found ids the right way round', async () => {
    matching.findMatches = (newItem, candidates) => [
      { candidateId: 1, score: 87.5, breakdown: { C: 100, A: 75, L: 100, D: 50 },
        reasons: ['same category', 'both mention Totes'] },
      { candidateId: 3, score: 55, breakdown: { C: 50, A: 60, L: 60, D: 50 }, reasons: [] },
    ]
    const res = await post(foundUmbrella())
    const itemId = res.body.item.id

    expect(res.body.matches).toHaveLength(2)
    expect(res.body.matches[0]).toMatchObject({
      lostItemId: 1, foundItemId: itemId, score: 87.5, status: 'suggested',
      breakdown: { C: 100, A: 75, L: 100, D: 50 },
      reasons: ['same category', 'both mention Totes'],
    })

    const saved = await request(app).get(`/api/items/${itemId}/matches`)
      .set('Authorization', `Bearer ${token}`)
    expect(saved.status).toBe(200)
    expect(saved.body.map((m) => m.score)).toEqual([87.5, 55])

    // Item 1 is Alice's lost item; she sees the same match from her side
    const otherSide = await request(app).get('/api/items/1/matches')
      .set('Authorization', `Bearer ${aliceToken}`)
    expect(otherSide.body.some((m) => m.foundItemId === itemId)).toBe(true)
  })

  it('accepts a findMatches that is async', async () => {
    matching.findMatches = async () => [
      { candidateId: 5, score: 66, breakdown: { C: 100, A: 20, L: 60, D: 40 }, reasons: ['async result'] },
    ]
    const res = await post(foundUmbrella())
    expect(res.status).toBe(201)
    expect(res.body.matches.map((m) => m.lostItemId)).toEqual([5])
  })

  it('still saves the item when an async findMatches rejects', async () => {
    matching.findMatches = async () => { throw new Error('async scoring bug') }
    const res = await post(foundUmbrella())
    expect(res.status).toBe(201)
    expect(res.body.matches).toEqual([])
  })

  it('still saves the item when findMatches throws', async () => {
    matching.findMatches = () => { throw new Error('scoring bug') }
    const res = await post(foundUmbrella())
    expect(res.status).toBe(201)
    expect(res.body.matches).toEqual([])
    expect((await request(app).get(`/api/items/${res.body.item.id}`)).status).toBe(200)
  })

  it.each([
    ['nothing', () => undefined],
    ['a result with a missing candidate', () => [{ candidateId: 999999, score: 80, breakdown: {}, reasons: [] }]],
    ['a score outside 0 to 100', () => [{ candidateId: 1, score: 140, breakdown: {}, reasons: [] }]],
  ])('still saves the item when findMatches returns %s', async (label, fake) => {
    matching.findMatches = fake
    const res = await post(foundUmbrella())
    expect(res.status).toBe(201)
    expect(res.body.matches).toEqual([])
  })
})

describe('GET /api/items/:id/matches', () => {
  it('requires login and a real item', async () => {
    expect((await request(app).get('/api/items/1/matches')).status).toBe(401)
    const missing = await request(app).get('/api/items/999999/matches')
      .set('Authorization', `Bearer ${token}`)
    expect(missing.status).toBe(404)
  })

  it('shows matches only to the person who posted the item', async () => {
    // Item 1 was posted by Alice; Ben is logged in
    const res = await request(app).get('/api/items/1/matches')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })
})

describe('alerts and re-scoring', () => {
  it('alerts only about pairs that were never scored before', async () => {
    const alerted = []
    alerts.notifyNewMatches = async (matches) => { alerted.push(matches) }

    matching.findMatches = () => [result(15, 80)]
    const res = await post(foundUmbrella())
    expect(res.body.matches[0].isNew).toBe(true)
    expect(alerted).toHaveLength(1)
    expect(alerted[0].map((m) => m.lostItemId)).toEqual([15])

    // Editing the description scores the item again; only pair 17 is new
    matching.findMatches = () => [result(15, 85), result(17, 60)]
    const edited = await edit(res.body.item.id, { description: 'Black umbrella with a wooden handle' })
    expect(edited.status).toBe(200)
    expect(alerted).toHaveLength(2)
    expect(alerted[1].map((m) => m.lostItemId)).toEqual([17])

    const saved = await request(app).get(`/api/items/${res.body.item.id}/matches`)
      .set('Authorization', `Bearer ${token}`)
    expect(saved.body.map((m) => [m.lostItemId, m.score])).toEqual([[15, 85], [17, 60]])
  })

  it('sends no alert when nothing new was found', async () => {
    let calls = 0
    alerts.notifyNewMatches = async () => { calls += 1 }
    matching.findMatches = () => []
    await post(foundUmbrella())
    expect(calls).toBe(0)
  })

  it('still saves the item and its matches when the alerts fail', async () => {
    alerts.notifyNewMatches = async () => { throw new Error('email service down') }
    matching.findMatches = () => [result(19, 70)]
    const res = await post(foundUmbrella())
    expect(res.status).toBe(201)
    expect(res.body.matches.map((m) => m.lostItemId)).toEqual([19])
  })

  it('drops earlier suggestions that no longer fit after an edit, and keeps the ones that still do', async () => {
    matching.findMatches = () => [result(27, 80), result(29, 60)]
    const res = await post(foundUmbrella())

    // After the edit: nothing in the top 5, and scored alone, only 29 still fits
    matching.findMatches = (item, candidates) => (candidates.length === 1 && candidates[0].id === 29
      ? [result(29, 55)] : [])
    const edited = await edit(res.body.item.id, { title: 'Blue umbrella', description: 'A blue umbrella' })
    expect(edited.status).toBe(200)

    const saved = await request(app).get(`/api/items/${res.body.item.id}/matches`)
      .set('Authorization', `Bearer ${token}`)
    expect(saved.body.map((m) => [m.lostItemId, m.score])).toEqual([[29, 55]])
  })

  it('leaves a rejected match alone when an edit scores again', async () => {
    matching.findMatches = () => [result(31, 80), result(33, 70)]
    const res = await post(foundUmbrella())
    const [first, second] = res.body.matches
    await Match.updateStatus(second.id, 'rejected')

    matching.findMatches = () => []
    await edit(res.body.item.id, { description: 'Changed' })
    expect((await Match.findById(second.id)).status).toBe('rejected')
    // Neither pair named the find's place, so the dropped one is kept as a wrong guess
    expect((await Match.findById(first.id)).status).toBe('rejected')
  })

  it('does not score again when only the photo changes', async () => {
    const res = await post(foundUmbrella())
    let calls = 0
    matching.findMatches = () => { calls += 1; return [] }
    await edit(res.body.item.id, { photoUrl: 'https://res.cloudinary.com/demo/image/upload/u.jpg' })
    expect(calls).toBe(0)
  })

  it('does not score a resolved item again', async () => {
    const res = await post(foundUmbrella())
    await edit(res.body.item.id, { status: 'resolved' })
    let calls = 0
    matching.findMatches = () => { calls += 1; return [] }
    await edit(res.body.item.id, { title: 'Black umbrella, now returned' })
    expect(calls).toBe(0)
  })
})

describe('which matches are shown', () => {
  it('hides rejected matches and suggestions whose other item is taken, but keeps claimed ones', async () => {
    matching.findMatches = () => [result(21, 90), result(23, 80), result(25, 70)]
    const res = await post(foundUmbrella())
    const [first, second, third] = res.body.matches

    await Match.updateStatus(first.id, 'rejected')
    // Lost item 23 was claimed through some other match
    await Item.updateStatus(23, 'matched')

    const url = `/api/items/${res.body.item.id}/matches`
    let shown = await request(app).get(url).set('Authorization', `Bearer ${token}`)
    expect(shown.body.map((m) => m.lostItemId)).toEqual([25])

    // Once this match is claimed, both items are matched and it stays visible
    await Match.updateStatus(third.id, 'claimed')
    await Item.updateStatus(25, 'matched')
    await Item.updateStatus(res.body.item.id, 'matched')
    shown = await request(app).get(url).set('Authorization', `Bearer ${token}`)
    expect(shown.body.map((m) => m.id)).toEqual([third.id])
    expect(second.lostItemId).toBe(23)
  })
})
