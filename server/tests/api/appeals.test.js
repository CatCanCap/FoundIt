// Suspension appeals through the API: a suspended student appeals once for
// each suspension, sees the logged reason and the admin's reply, and an admin
// accepts (lifting the suspension) or declines, with every decision logged.
import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')
const { truncateAll, registerUser, insertBasics, makeAdmin } = require('./helpers')
const User = require('../../models/user-model')
const AdminAction = require('../../models/admin-action-model')

let sam, ria, eve, admin, spotIds

function as(user) {
  const auth = (req) => req.set('Authorization', `Bearer ${user.token}`)
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
  }
}

// Suspends someone the way a report does: the account, then the log entry
async function suspend(user, reason) {
  const at = new Date().toISOString()
  await User.update(user.user.id, { suspendedAt: at })
  await AdminAction.create({ adminId: admin.user.id, action: 'suspend_user', userId: user.user.id, reason })
  return at
}

beforeAll(async () => {
  await truncateAll()
  ;({ spotIds } = await insertBasics())
  ;[sam, ria, eve, admin] = await Promise.all(['Sam Lee', 'Ria Das', 'Eve Ong', 'Ada Admin'].map((name) =>
    registerUser(app, { name })))
  await makeAdmin(admin.user.id)
})

describe('a student who is not suspended', () => {
  it('has nothing to appeal', async () => {
    const res = await as(eve).get('/api/appeals/mine')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ suspension: null, appeal: null, canAppeal: false })
    const sent = await as(eve).post('/api/appeals', { message: 'Why?' })
    expect(sent.status).toBe(409)
  })
})

describe('a suspended student', () => {
  beforeAll(async () => {
    await suspend(sam, 'Asked for payment in chat before handing an item back.')
  })

  it('sees the logged reason and can appeal', async () => {
    const res = await as(sam).get('/api/appeals/mine')
    expect(res.body.suspension.reason).toBe('Asked for payment in chat before handing an item back.')
    expect(res.body.canAppeal).toBe(true)
  })

  it('is still refused everywhere else', async () => {
    const res = await as(sam).post('/api/items', {
      type: 'lost', title: 'Black umbrella', category: 'Umbrella', colour: 'Black',
      trail: [{ spotId: spotIds[1], from: '2026-10-08T04:00:00Z', to: '2026-10-08T04:30:00Z' }],
    })
    expect(res.status).toBe(403)
  })

  it('needs words, and only our own photos', async () => {
    expect((await as(sam).post('/api/appeals', { message: '   ' })).status).toBe(400)
    expect((await as(sam).post('/api/appeals', { message: 'x'.repeat(1001) })).status).toBe(400)
    const photo = await as(sam).post('/api/appeals', { message: 'Hi', proofUrl: 'http://evil.example/a.png' })
    expect(photo.status).toBe(400)
  })

  it('appeals once for each suspension', async () => {
    const sent = await as(sam).post('/api/appeals', { message: '  I only asked about the bus fare.  ' })
    expect(sent.status).toBe(201)
    expect(sent.body).toMatchObject({ status: 'open', message: 'I only asked about the bus fare.', reply: null })
    expect(sent.body.decidedBy).toBeUndefined()
    expect((await as(sam).post('/api/appeals', { message: 'Again' })).status).toBe(409)
    const mine = await as(sam).get('/api/appeals/mine')
    expect(mine.body.appeal.status).toBe('open')
    expect(mine.body.canAppeal).toBe(false)
  })
})

describe('an admin deciding appeals', () => {
  let samAppeal
  beforeAll(async () => {
    samAppeal = (await as(sam).get('/api/appeals/mine')).body.appeal
  })

  it('is the only one who sees the queue', async () => {
    expect((await as(eve).get('/api/admin/appeals')).status).toBe(403)
    const res = await as(admin).get('/api/admin/appeals')
    expect(res.status).toBe(200)
    expect(res.body.map((appeal) => appeal.id)).toEqual([samAppeal.id])
    expect(res.body[0].person).toMatchObject({ name: 'Sam Lee' })
    expect(res.body[0].person.history.suspensions).toBe(1)
    expect(res.body[0].suspensionReason).toBe('Asked for payment in chat before handing an item back.')
  })

  it('declines with a reply the student sees, and keeps the suspension', async () => {
    expect((await as(admin).post(`/api/admin/appeals/${samAppeal.id}/decline`, {})).status).toBe(400)
    const res = await as(admin).post(`/api/admin/appeals/${samAppeal.id}/decline`, { reason: 'The chat shows it twice.' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('declined')
    expect((await User.findById(sam.user.id)).suspendedAt).not.toBeNull()
    const mine = (await as(sam).get('/api/appeals/mine')).body
    expect(mine.appeal).toMatchObject({ status: 'declined', reply: 'The chat shows it twice.' })
    expect(mine.canAppeal).toBe(false)
    const [entry] = (await as(admin).get('/api/admin/actions')).body
    expect(entry).toMatchObject({ action: 'decline_appeal', appealId: samAppeal.id, reason: 'The chat shows it twice.' })
  })

  it('cannot decide the same appeal twice', async () => {
    const res = await as(admin).post(`/api/admin/appeals/${samAppeal.id}/accept`, { reason: 'Changed my mind' })
    expect(res.status).toBe(409)
    expect((await as(admin).get('/api/admin/appeals')).body).toEqual([])
    const all = (await as(admin).get('/api/admin/appeals?status=all')).body
    expect(all.map((appeal) => appeal.status)).toEqual(['declined'])
  })

  it('accepts, which lifts the suspension and logs it', async () => {
    await suspend(ria, 'Spam posts')
    const appeal = (await as(ria).post('/api/appeals', { message: 'Those were real items.' })).body
    const res = await as(admin).post(`/api/admin/appeals/${appeal.id}/accept`, { reason: 'Checked, they were real.' })
    expect(res.status).toBe(200)
    expect((await User.findById(ria.user.id)).suspendedAt).toBeNull()
    const mine = (await as(ria).get('/api/appeals/mine')).body
    expect(mine).toMatchObject({ suspension: null, canAppeal: false })
    expect(mine.appeal).toMatchObject({ status: 'accepted', reply: 'Checked, they were real.' })
    const [entry] = (await as(admin).get('/api/admin/actions')).body
    expect(entry).toMatchObject({ action: 'unsuspend_user', appealId: appeal.id })
  })

  it('lets a student appeal a new suspension', async () => {
    await suspend(ria, 'Rude in chat')
    expect((await as(ria).get('/api/appeals/mine')).body.canAppeal).toBe(true)
  })

  it('answers a waiting appeal when the People tab lifts the suspension', async () => {
    const appeal = (await as(ria).post('/api/appeals', { message: 'It was a joke between friends.' })).body
    const res = await as(admin).post(`/api/admin/users/${ria.user.id}/unsuspend`, { reason: 'Friends, confirmed.' })
    expect(res.status).toBe(200)
    const mine = (await as(ria).get('/api/appeals/mine')).body
    expect(mine.appeal).toMatchObject({ id: appeal.id, status: 'accepted', reply: 'Friends, confirmed.' })
  })
})
