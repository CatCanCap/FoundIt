import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')
const { assertTestDatabase } = require('./helpers')
const { seedDatabase } = require('../../scripts/seed')
const { loadSeed } = require('../../data/load')

const NOW = new Date('2026-10-09T06:00:00Z')

beforeAll(async () => {
  assertTestDatabase()
  await seedDatabase({ now: NOW })
})

describe('seedDatabase', () => {
  it('loads every list', async () => {
    expect((await request(app).get('/api/categories')).body).toHaveLength(16)
    expect((await request(app).get('/api/spots')).body).toHaveLength(260)
    expect((await request(app).get('/api/items')).body).toHaveLength(92)
  })

  it('stores items exactly as loadSeed describes them', async () => {
    const expected = loadSeed(NOW).items
    // An admin, because a find's place is hidden from everyone else
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'foundit.admin@smu.edu.sg', password: 'FoundIt-admin-1' })
    for (const id of [1, 2, 5, 81]) {
      const res = await request(app)
        .get(`/api/items/${id}`)
        .set('Authorization', `Bearer ${login.body.token}`)
      expect(res.body).toEqual(expected.find((item) => item.id === id))
    }
  })

  it('stores spots, with their rooms, exactly as loadSeed describes them', async () => {
    const spots = (await request(app).get('/api/spots')).body
    expect(spots).toEqual(loadSeed(NOW).spots)
    expect(spots.flatMap((spot) => spot.rooms)).toHaveLength(392)
  })

  it('lets a demo user log in', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'alice.tan.2024@scis.smu.edu.sg', password: 'FoundIt-demo-1' })
    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(1)
  })

  it('gives the same result when run twice, and new rows get fresh ids', async () => {
    await seedDatabase({ now: NOW })
    expect((await request(app).get('/api/items')).body).toHaveLength(92)

    const login = await request(app).post('/api/auth/login')
      .send({ email: 'alice.tan.2024@scis.smu.edu.sg', password: 'FoundIt-demo-1' })
    const created = await request(app).post('/api/items')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        type: 'lost', title: 'Seed id check', category: 'Keys',
        trail: [{ spotId: 1, from: '2026-10-08T02:00:00Z', to: '2026-10-08T03:00:00Z' }],
      })
    expect(created.status).toBe(201)
    expect(created.body.item.id).toBe(93)
  })
})
