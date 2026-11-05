// The Admin page's tools, through the API: each person's history on a dispute
// or report, the names and flags in the queues, and the People list.
// Earlier cases are made through the models, so this file needs no other
// feature's routes beyond posting items, disputes and reports.
import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')
const { truncateAll, registerUser, insertBasics, makeAdmin } = require('./helpers')
const Match = require('../../models/match-model')
const Claim = require('../../models/claim-model')
const Item = require('../../models/item-model')
const Message = require('../../models/message-model')
const Handoff = require('../../models/handoff-model')
const Dispute = require('../../models/dispute-model')
const User = require('../../models/user-model')
const AdminAction = require('../../models/admin-action-model')

// alice: disputes carl's claim now. ben: the finder. carl: has lost a dispute
// before and has a warning. dan: suspended. eve: a normal user.
let alice, ben, carl, dan, eve, admin, spotIds
let found, currentDispute, pastDispute, report

function as(user) {
  const auth = (req) => req.set('Authorization', `Bearer ${user.token}`)
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
  }
}

function itemBody(type, title) {
  return {
    type, title, category: 'Wallet', colour: 'Brown',
    trail: [{ spotId: spotIds[1], from: '2026-10-08T04:00:00Z', to: '2026-10-08T04:30:00Z' }],
  }
}

async function post(user, type, title) {
  return (await as(user).post('/api/items', itemBody(type, title))).body.item
}

// Carl claims a found item through his lost report
async function carlClaims(foundItem, lostItem) {
  const [match] = await Match.saveMany([
    { lostItemId: lostItem.id, foundItemId: foundItem.id, score: 80, breakdown: {}, reasons: [] },
  ])
  await Match.updateStatus(match.id, 'claimed')
  const claim = await Claim.create({ matchId: match.id, claimerId: carl.user.id, detail: 'Brown' })
  return { match, claim }
}

beforeAll(async () => {
  await truncateAll()
  ;({ spotIds } = await insertBasics())
  ;[alice, ben, carl, dan, eve, admin] = await Promise.all([1, 2, 3, 4, 5, 6].map((n) =>
    registerUser(app, { name: ['Alice Tan', 'Ben Lim', 'Carl Ng', 'Dan Koh', 'Eve Ong', 'Ada Admin'][n - 1] })))
  await makeAdmin(admin.user.id)

  // An earlier case: Carl claimed a wallet Ben had already handed back, and
  // an admin gave it to Alice
  const oldFound = await post(ben, 'found', 'Old brown wallet')
  const oldLost = await post(carl, 'lost', 'Old wallet')
  const old = await carlClaims(oldFound, oldLost)
  const handoff = await Handoff.create({ matchId: old.match.id, method: 'drop-off', spotId: spotIds[1] })
  await Handoff.update(handoff.id, { status: 'completed', completedAt: '2026-10-01T00:00:00Z' })
  pastDispute = await Dispute.create({
    itemId: oldFound.id, claimId: old.claim.id, raisedBy: alice.user.id, description: 'Mine',
  })
  await Dispute.update(pastDispute.id, { status: 'upheld', decidedAt: new Date().toISOString() })
  await Claim.update(old.claim.id, { status: 'overturned' })
  await AdminAction.create({ adminId: admin.user.id, action: 'warn_user', userId: carl.user.id, reason: 'Careless claim' })

  // Dan was suspended
  await User.update(dan.user.id, { suspendedAt: new Date().toISOString() })
  await AdminAction.create({ adminId: admin.user.id, action: 'suspend_user', userId: dan.user.id, reason: 'Spam' })

  // The case being decided: Carl claims Ben's wallet, Alice disputes it
  await post(alice, 'lost', 'Brown wallet')
  found = await post(ben, 'found', 'Brown leather wallet')
  const carlLost = await post(carl, 'lost', 'My wallet')
  const current = await carlClaims(found, carlLost)
  await Item.updateStatus(found.id, 'matched')
  currentDispute = (await as(alice).post('/api/disputes', { itemId: found.id, description: 'Card inside' })).body

  // Ben reports Carl's chat message
  const message = await Message.create({ matchId: current.match.id, senderId: carl.user.id, text: 'Give me your number' })
  report = (await as(ben).post('/api/reports', { messageId: message.id, reason: 'Pushy' })).body
})

describe('history on a dispute case', () => {
  it('gives the finder, claimer and disputer their record on other cases', async () => {
    const res = await as(admin).get(`/api/admin/disputes/${currentDispute.id}`)
    expect(res.status).toBe(200)
    expect(res.body.claimer.history).toMatchObject({
      disputesAgainst: 1, disputesLost: 1, warnings: 1, suspensions: 0, openReports: 1,
    })
    // This dispute is left out, so Alice's record shows only the earlier one
    expect(res.body.raisedBy.history).toMatchObject({ disputesRaised: 1, disputesRaisedWon: 1 })
    expect(res.body.finder.history).toMatchObject({ disputesRaised: 0, warnings: 0, openReports: 0 })
    expect(res.body.decidedBy).toBeNull()
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|verifyCodeHash|\$2[aby]\$/)
  })

  it('still returns the full found item and both lost reports for the evidence', async () => {
    const res = await as(admin).get(`/api/admin/disputes/${currentDispute.id}`)
    expect(res.body.foundItem).toMatchObject({ category: 'Wallet', colour: 'Brown', trail: [{ spotId: spotIds[1] }] })
    expect(res.body.raiserLostItem.title).toBe('Brown wallet')
    expect(res.body.claimerLostItem.title).toBe('My wallet')
  })
})

describe('the dispute queue', () => {
  it('names the three people and flags a returned item that was disputed', async () => {
    const res = await as(admin).get('/api/admin/disputes?status=all')
    expect(res.status).toBe(200)
    const past = res.body.find((dispute) => dispute.id === pastDispute.id)
    const now = res.body.find((dispute) => dispute.id === currentDispute.id)
    expect(now.people).toEqual({
      raisedBy: { id: alice.user.id, name: 'Alice Tan' },
      claimer: { id: carl.user.id, name: 'Carl Ng' },
      finder: { id: ben.user.id, name: 'Ben Lim' },
    })
    expect(past.itemWasReturned).toBe(true)
    expect(now.itemWasReturned).toBe(false)
    expect(past.returnDone).toBe(false)
    expect(JSON.stringify(res.body)).not.toContain('@')
  })
})

describe('reports', () => {
  it('name who wrote the reported message and who reported it', async () => {
    const res = await as(admin).get('/api/admin/reports')
    expect(res.status).toBe(200)
    expect(res.body[0].people).toEqual({
      author: { id: carl.user.id, name: 'Carl Ng' },
      reporter: { id: ben.user.id, name: 'Ben Lim' },
    })
  })

  it('give the author and the reporter their record, without this report', async () => {
    const res = await as(admin).get(`/api/admin/reports/${report.id}`)
    expect(res.status).toBe(200)
    expect(res.body.author.history).toMatchObject({ warnings: 1, disputesLost: 1, openReports: 0 })
    expect(res.body.reportedBy.history).toMatchObject({ warnings: 0 })
  })
})

describe('the People list', () => {
  it('is for admins only, and checks the status', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401)
    expect((await as(eve).get('/api/admin/users')).status).toBe(403)
    expect((await as(admin).get('/api/admin/users?status=banned')).status).toBe(400)
  })

  it('lists suspended people first, then warned ones, with their counts and last action', async () => {
    const res = await as(admin).get('/api/admin/users')
    expect(res.status).toBe(200)
    expect(res.body.map((person) => person.id)).toEqual([dan.user.id, carl.user.id])
    expect(res.body[0]).toMatchObject({
      name: 'Dan Koh', email: dan.user.email, warnings: 0, suspensions: 1,
      lastAction: { action: 'suspend_user', reason: 'Spam' },
    })
    expect(res.body[0].suspendedAt).toBeTruthy()
    expect(res.body[1]).toMatchObject({ suspendedAt: null, warnings: 1 })
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|verifyCodeHash|\$2[aby]\$/)
  })

  it('filters to suspended or warned people', async () => {
    const suspended = (await as(admin).get('/api/admin/users?status=suspended')).body
    expect(suspended.map((person) => person.id)).toEqual([dan.user.id])
    const warned = (await as(admin).get('/api/admin/users?status=warned')).body
    expect(warned.map((person) => person.id)).toEqual([carl.user.id])
  })

  it('drops someone from the suspended list once the suspension is lifted', async () => {
    const res = await as(admin).post(`/api/admin/users/${dan.user.id}/unsuspend`, { reason: 'Appeal accepted' })
    expect(res.status).toBe(200)
    const all = (await as(admin).get('/api/admin/users')).body
    expect(all.map((person) => person.id)).toEqual([carl.user.id])
    expect((await as(admin).get('/api/admin/users?status=suspended')).body).toEqual([])
  })
})
