import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')

describe('app basics', () => {
  it('answers the health check', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.database).toBe('ok')
  })

  it('does not advertise the server software and blocks content-type guessing', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('rejects a body larger than 1 MB with 413', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@smu.edu.sg', password: 'x'.repeat(1100000) })
    expect(res.status).toBe(413)
    expect(typeof res.body.error).toBe('string')
  })

  it('returns a JSON 404 for an unknown API path', async () => {
    const res = await request(app).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
  })
})
