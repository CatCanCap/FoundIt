// The Profile page's routes: change your name and password through the real app
// (supertest), with the user table swapped for an in-memory copy. The database
// client throws if anything reaches it, so nothing in the shared database can
// be read or changed.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret'
const supabase = require('../../lib/db')
const request = require('supertest')
const app = require('../../app')
const { sign } = require('../../lib/token')
const { hash } = require('../../lib/hash')
const User = require('../../models/user-model')

const NOW = new Date().toISOString()
let db
let oldHash
let dbTouched

const find = (id) => db.users.find((user) => user.id === Number(id)) || null
const copy = (row) => (row ? structuredClone(row) : null)
const fakes = {
  findByEmail: async (email) =>
    copy(db.users.find((user) => user.email === email.trim().toLowerCase())),
  findById: async (id) => copy(find(id)),
  update: async (id, fields) => copy(Object.assign(find(id), fields)),
}

const originals = []
const originalFrom = supabase.from
const originalRpc = supabase.rpc

beforeAll(async () => {
  oldHash = await hash('old-password-1')
  supabase.from = () => {
    dbTouched = true
    throw new Error('The database must not be used')
  }
  supabase.rpc = supabase.from
  for (const [name, fake] of Object.entries(fakes)) {
    originals.push([name, User[name]])
    User[name] = fake
  }
})

afterAll(() => {
  supabase.from = originalFrom
  supabase.rpc = originalRpc
  for (const [name, original] of originals) User[name] = original
})

beforeEach(() => {
  dbTouched = false
  db = {
    users: [
      {
        id: 7,
        name: 'Ben Lim',
        email: 'ben.lim.2024@business.smu.edu.sg',
        role: 'user',
        passwordHash: oldHash,
        emailVerifiedAt: NOW,
        suspendedAt: null,
        alertsOn: true,
      },
    ],
  }
})

const bearer = (token) => ({ Authorization: `Bearer ${token}` })
const login = (password) =>
  request(app)
    .post('/api/auth/login')
    .send({ email: 'ben.lim.2024@business.smu.edu.sg', password })

describe('Profile: change name', () => {
  it('saves the new name, and the next sign-in shows it', async () => {
    const token = sign(7, oldHash)
    const saved = await request(app)
      .patch('/api/auth/me')
      .set(bearer(token))
      .send({ name: '  Ben Lim Jun Wei ' })
    expect(saved.status).toBe(200)
    expect(saved.body.name).toBe('Ben Lim Jun Wei')

    const me = await request(app).get('/api/auth/me').set(bearer(token))
    expect(me.body.name).toBe('Ben Lim Jun Wei')

    // Changing the name does not touch the password: the same token and
    // password still work
    expect(me.status).toBe(200)
    expect((await login('old-password-1')).status).toBe(200)
    expect(dbTouched).toBe(false)
  })

  it('refuses an empty name and keeps the old one', async () => {
    const token = sign(7, oldHash)
    const res = await request(app).patch('/api/auth/me').set(bearer(token)).send({ name: '   ' })
    expect(res.status).toBe(400)
    expect(db.users[0].name).toBe('Ben Lim')
  })

  it('refuses anyone not signed in', async () => {
    const res = await request(app).patch('/api/auth/me').send({ name: 'Someone else' })
    expect(res.status).toBe(401)
    expect(db.users[0].name).toBe('Ben Lim')
  })

  it('never lets the request change the email, role or password', async () => {
    const token = sign(7, oldHash)
    await request(app)
      .patch('/api/auth/me')
      .set(bearer(token))
      .send({ name: 'Ben', role: 'admin', email: 'x@smu.edu.sg', passwordHash: 'x' })
    expect(db.users[0]).toMatchObject({
      name: 'Ben',
      role: 'user',
      email: 'ben.lim.2024@business.smu.edu.sg',
      passwordHash: oldHash,
    })
  })
})

describe('Profile: change password', () => {
  const change = (token, currentPassword, newPassword) =>
    request(app)
      .post('/api/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword, newPassword })

  it('changes it: the new password signs in, the old one no longer does', async () => {
    const oldToken = sign(7, oldHash)
    const res = await change(oldToken, 'old-password-1', 'new-password-2')
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()

    // This device keeps working with the token it got back
    expect((await request(app).get('/api/auth/me').set(bearer(res.body.token))).status).toBe(200)
    // Every other device (the old token) is signed out
    expect((await request(app).get('/api/auth/me').set(bearer(oldToken))).status).toBe(401)

    expect((await login('new-password-2')).status).toBe(200)
    expect((await login('old-password-1')).status).toBe(401)
    expect(dbTouched).toBe(false)
  })

  it('refuses a wrong current password and changes nothing', async () => {
    const res = await change(sign(7, oldHash), 'not-my-password', 'new-password-2')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Your current password is wrong')
    expect((await login('old-password-1')).status).toBe(200)
  })

  it('refuses a new password that is too short or the same as now', async () => {
    const token = sign(7, oldHash)
    expect((await change(token, 'old-password-1', 'short')).status).toBe(400)
    expect((await change(token, 'old-password-1', 'old-password-1')).status).toBe(400)
    expect((await login('old-password-1')).status).toBe(200)
  })

  it('refuses anyone not signed in', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old-password-1', newPassword: 'new-password-2' })
    expect(res.status).toBe(401)
    expect(db.users[0].passwordHash).toBe(oldHash)
  })
})
