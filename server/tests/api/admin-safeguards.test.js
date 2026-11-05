// Feature 5, end to end through the API: the item record, "This is my item"
// disputes, the claimer's side, reports, and the Admin page routes. Claims are
// made through the models here, so these tests do not depend on the claim
// routes (Member 5).
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
const { completeHandoff } = require('../../lib/handoff-steps')

// alice: the real owner. ben: the finder. carl: claims the item wrongly.
// dan: someone else who also thinks it is theirs. eve: has no lost report.
let alice, ben, carl, dan, eve, admin, spotIds
let aliceLost, carlLost, danLost, found, spam, matchId, claimId, benMessage, carlMessage

function as(user) {
  const auth = (req) => req.set('Authorization', `Bearer ${user.token}`)
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
  }
}

function itemBody(type, title, overrides = {}) {
  return {
    type, title, category: 'Wallet', colour: 'Brown',
    trail: [{ spotId: spotIds[1], from: '2026-10-08T04:00:00Z', to: '2026-10-08T04:30:00Z' }],
    ...overrides,
  }
}

const aliceSide = { description: 'Student card inside with the name Alice', proofUrl: 'https://res.cloudinary.com/demo/image/upload/card.jpg' }

beforeAll(async () => {
  await truncateAll()
  ;({ spotIds } = await insertBasics())
  ;[alice, ben, carl, dan, eve, admin] = await Promise.all([1, 2, 3, 4, 5, 6].map(() => registerUser(app)))
  await makeAdmin(admin.user.id)

  // Alice and Dan report a wallet lost before anyone claims the found one
  aliceLost = (await as(alice).post('/api/items', itemBody('lost', 'Brown wallet'))).body.item
  danLost = (await as(dan).post('/api/items', itemBody('lost', 'Wallet, brown'))).body.item
  carlLost = (await as(carl).post('/api/items', itemBody('lost', 'My wallet'))).body.item
  found = (await as(ben).post('/api/items', itemBody('found', 'Brown leather wallet'))).body.item
  spam = (await as(ben).post('/api/items', itemBody('found', 'Free iPhones, DM me'))).body.item

  // Carl claims the match between his lost report and Ben's found item
  const [match] = await Match.saveMany([
    { lostItemId: carlLost.id, foundItemId: found.id, score: 80, breakdown: {}, reasons: [] },
  ])
  matchId = match.id
  claimId = (await Claim.create({ matchId, claimerId: carl.user.id, detail: 'It is brown' })).id
  await Match.updateStatus(matchId, 'claimed')
  await Item.updateStatus(carlLost.id, 'matched')
  await Item.updateStatus(found.id, 'matched')

  carlMessage = await Message.create({ matchId, senderId: carl.user.id, text: 'Hi, that is my wallet' })
  benMessage = await Message.create({ matchId, senderId: ben.user.id, text: 'something abusive' })
})

describe('item record', () => {
  it('shows a claimed item and its timeline, but never who claimed it', async () => {
    const res = await request(app).get(`/api/items/${found.id}/record`)
    expect(res.status).toBe(200)
    expect(res.body.state).toBe('claimed')
    expect(res.body.disputeOpen).toBe(false)
    expect(res.body.timeline.map((entry) => entry.event)).toEqual(['reported', 'claimed'])
    const text = JSON.stringify(res.body)
    expect(text).not.toContain(carl.user.email)
    expect(text).not.toContain('claimerId')
    expect(text).not.toContain('It is brown')
  })

  it('answers 404 for an item that does not exist', async () => {
    expect((await request(app).get('/api/items/999999/record')).status).toBe(404)
  })
})

describe('opening a dispute', () => {
  it('needs a login', async () => {
    expect((await request(app).post('/api/disputes').send({ itemId: found.id, ...aliceSide })).status).toBe(401)
  })

  it.each([
    ['the finder', () => ben, () => ({ itemId: found.id, ...aliceSide })],
    ['the claimer', () => carl, () => ({ itemId: found.id, ...aliceSide })],
    ['a lost item', () => alice, () => ({ itemId: aliceLost.id, ...aliceSide })],
    ['an item nobody claimed', () => alice, () => ({ itemId: spam.id, ...aliceSide })],
    ['no description', () => alice, () => ({ itemId: found.id })],
    ['an http proof link', () => alice, () => ({ itemId: found.id, ...aliceSide, proofUrl: 'http://x.com/a.jpg' })],
    ['someone with no lost report', () => eve, () => ({ itemId: found.id, ...aliceSide })],
  ])('refuses %s with 400', async (label, user, payload) => {
    const res = await as(user()).post('/api/disputes', payload())
    expect(res.status).toBe(400)
  })

  it('refuses a lost report in another category, so nobody can pause a handoff with an unrelated report', async () => {
    const umbrella = (await as(eve).post('/api/items', itemBody('lost', 'Black umbrella', { category: 'Umbrella' }))).body.item
    const res = await as(eve).post('/api/disputes', { itemId: found.id, ...aliceSide })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/category Wallet/)
    await Item.remove(umbrella.id)
  })

  it('opens a dispute with the lost report attached, once per person', async () => {
    const res = await as(alice).post('/api/disputes', { itemId: found.id, ...aliceSide })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ itemId: found.id, lostItemId: aliceLost.id, status: 'open' })
    expect(res.body).not.toHaveProperty('claimId')

    expect((await as(alice).post('/api/disputes', { itemId: found.id, ...aliceSide })).status).toBe(409)
    expect((await as(dan).post('/api/disputes', { itemId: found.id, description: 'Mine too' })).status).toBe(201)
  })

  it('pauses the item: the record shows it disputed and the handoff cannot complete', async () => {
    const record = (await as(ben).get(`/api/items/${found.id}/record`)).body
    expect(record.state).toBe('disputed')
    expect(record.disputeOpen).toBe(true)
    expect(record.timeline.map((entry) => entry.event)).toContain('disputed')

    const handoff = await Handoff.create({ matchId, method: 'drop-off', spotId: spotIds[1] })
    await expect(completeHandoff(handoff)).rejects.toMatchObject({ status: 409 })
    expect((await Handoff.findById(handoff.id)).status).toBe('pending')
  })
})

describe('who sees a dispute on the item record', () => {
  const disputedEvents = (record) => record.timeline.filter((entry) => entry.event === 'disputed')

  it.each([
    ['the finder', () => ben, 2],
    ['the claimer', () => carl, 2],
    ['an admin', () => admin, 2],
    ['the person who raised it, who sees only their own dispute', () => alice, 1],
  ])('shows it to %s', async (label, user, count) => {
    const record = (await as(user()).get(`/api/items/${found.id}/record`)).body
    expect(record.state).toBe('disputed')
    expect(record.disputeOpen).toBe(true)
    expect(disputedEvents(record)).toHaveLength(count)
  })

  it.each([
    ['someone logged out', () => request(app).get(`/api/items/${found.id}/record`)],
    ['someone not involved', () => as(eve).get(`/api/items/${found.id}/record`)],
    ['someone with an expired or fake token', () => request(app).get(`/api/items/${found.id}/record`).set('Authorization', 'Bearer not-a-token')],
  ])('shows %s the item as claimed, with no dispute in the timeline', async (label, send) => {
    const res = await send()
    expect(res.status).toBe(200)
    expect(res.body.state).toBe('claimed')
    expect(res.body.disputeOpen).toBe(false)
    expect(disputedEvents(res.body)).toHaveLength(0)
  })

  it('never names who raised the dispute, even to the people involved', async () => {
    for (const user of [ben, carl]) {
      const text = JSON.stringify((await as(user).get(`/api/items/${found.id}/record`)).body)
      expect(text).not.toContain('raisedBy')
      expect(text).not.toContain(alice.user.email)
      expect(text).not.toContain(dan.user.email)
    }
  })
})

describe('the claimer\'s side', () => {
  it('shows the claimer that a dispute is open, but not who raised it or what they said', async () => {
    const res = await as(carl).get('/api/disputes/on-my-claims')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({ itemId: found.id, status: 'open', claimDetail: 'It is brown' })
    // The item's name for the list, and when they claimed it, without fetching the record
    expect(res.body[0].item).toMatchObject({ id: found.id, title: 'Brown leather wallet' })
    expect(res.body[0].item).not.toHaveProperty('trail')
    expect(res.body[0].claimedAt).toBeTruthy()
    const text = JSON.stringify(res.body)
    expect(text).not.toContain('Student card')
    expect(text).not.toContain('cloudinary')
    expect(res.body[0]).not.toHaveProperty('raisedBy')
  })

  it('lets only the claimer add their side', async () => {
    const [dispute] = (await as(carl).get('/api/disputes/on-my-claims')).body
    expect((await as(alice).post(`/api/disputes/${dispute.id}/respond`, { response: 'x' })).status).toBe(403)
    expect((await as(carl).post(`/api/disputes/${dispute.id}/respond`, {})).status).toBe(400)
    const res = await as(carl).post(`/api/disputes/${dispute.id}/respond`, { response: 'Bought it last year' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ claimerResponse: 'Bought it last year' })
    expect(res.body.respondedAt).toBeTruthy()
  })

  it('keeps the claimer\'s side from the person who raised the dispute', async () => {
    const [mine] = (await as(alice).get('/api/disputes/mine')).body
    expect(mine).not.toHaveProperty('claimerResponse')
    expect(mine).not.toHaveProperty('claimId')
    expect(mine.item).toMatchObject({ id: found.id, title: 'Brown leather wallet' })
  })

  it('leaves out a post that reports hid, except for the claimer whose claim stands', async () => {
    await Item.update(found.id, { hiddenAt: new Date().toISOString() })
    try {
      const [mine] = (await as(alice).get('/api/disputes/mine')).body
      expect(mine.item).toBe(null)
      const [onMine] = (await as(carl).get('/api/disputes/on-my-claims')).body
      expect(onMine.item).toMatchObject({ id: found.id, title: 'Brown leather wallet' })
    } finally {
      await Item.update(found.id, { hiddenAt: null })
    }
  })
})

describe('reporting', () => {
  it('lets someone in the chat report the other person\'s message, once', async () => {
    const res = await as(carl).post('/api/reports', { messageId: benMessage.id, reason: 'Rude' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ kind: 'message', messageId: benMessage.id, status: 'open' })
    expect((await as(carl).post('/api/reports', { messageId: benMessage.id, reason: 'Rude' })).status).toBe(409)
  })

  it('refuses your own message, someone else\'s chat, and both or neither target', async () => {
    expect((await as(carl).post('/api/reports', { messageId: carlMessage.id, reason: 'x' })).status).toBe(400)
    expect((await as(dan).post('/api/reports', { messageId: benMessage.id, reason: 'x' })).status).toBe(403)
    expect((await as(dan).post('/api/reports', { reason: 'x' })).status).toBe(400)
    expect((await as(dan).post('/api/reports', { messageId: 1, itemId: 1, reason: 'x' })).status).toBe(400)
    expect((await as(dan).post('/api/reports', { itemId: found.id })).status).toBe(400)
    expect((await as(ben).post('/api/reports', { itemId: found.id, reason: 'x' })).status).toBe(400)
  })

  it('hides a post after 3 reports', async () => {
    for (const user of [alice, dan]) {
      expect((await as(user).post('/api/reports', { itemId: spam.id, reason: 'Spam' })).status).toBe(201)
    }
    expect((await request(app).get(`/api/items/${spam.id}`)).status).toBe(200)

    expect((await as(eve).post('/api/reports', { itemId: spam.id, reason: 'Spam' })).status).toBe(201)
    expect((await request(app).get(`/api/items/${spam.id}`)).status).toBe(404)
    expect((await as(eve).get(`/api/items/${spam.id}`)).status).toBe(404)
    const feed = (await request(app).get('/api/items')).body
    expect(feed.map((item) => item.id)).not.toContain(spam.id)

    // The poster and admins still see it, and it stays in the poster's own list
    expect((await as(ben).get(`/api/items/${spam.id}`)).status).toBe(200)
    expect((await as(admin).get(`/api/items/${spam.id}`)).status).toBe(200)
    const own = (await as(ben).get(`/api/items?postedBy=${ben.user.id}`)).body
    expect(own.map((item) => item.id)).toContain(spam.id)
  })
})

describe('admin routes', () => {
  it('refuse a visitor with 401 and a normal user with 403', async () => {
    expect((await request(app).get('/api/admin/disputes')).status).toBe(401)
    expect((await as(alice).get('/api/admin/disputes')).status).toBe(403)
    expect((await as(alice).get('/api/admin/reports')).status).toBe(403)
    expect((await as(alice).post('/api/admin/disputes/1/uphold', { reason: 'x' })).status).toBe(403)
  })

  it('list open disputes first come, first served, with the item', async () => {
    const res = await as(admin).get('/api/admin/disputes')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({ raisedBy: alice.user.id, item: { id: found.id, title: 'Brown leather wallet' } })
    expect((await as(admin).get('/api/admin/disputes?status=stolen')).status).toBe(400)
  })

  it('show the admin both sides, both lost reports and the chat', async () => {
    const [first] = (await as(admin).get('/api/admin/disputes')).body
    const res = await as(admin).get(`/api/admin/disputes/${first.id}`)
    expect(res.status).toBe(200)
    expect(res.body.claimer).toMatchObject({ id: carl.user.id, email: carl.user.email })
    expect(res.body.raisedBy.email).toBe(alice.user.email)
    expect(res.body.finder.email).toBe(ben.user.email)
    expect(res.body.claim.detail).toBe('It is brown')
    expect(res.body.dispute).toMatchObject({ description: aliceSide.description, claimerResponse: 'Bought it last year' })
    expect(res.body.foundItem.id).toBe(found.id)
    expect(res.body.claimerLostItem.id).toBe(carlLost.id)
    expect(res.body.raiserLostItem.id).toBe(aliceLost.id)
    expect(res.body.messages.map((m) => m.id)).toEqual([carlMessage.id, benMessage.id])
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|verifyCodeHash|\$2[aby]\$/)
  })

  it('keep a claim, with a reason the person who raised the dispute can read', async () => {
    const danDispute = (await as(dan).get('/api/disputes/mine')).body[0]
    expect((await as(admin).post(`/api/admin/disputes/${danDispute.id}/close`, {})).status).toBe(400)
    const res = await as(admin).post(`/api/admin/disputes/${danDispute.id}/close`, { reason: 'No proof given' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('closed')
    expect((await as(dan).get('/api/disputes/mine')).body[0]).toMatchObject({ status: 'closed', decisionReason: 'No proof given' })
  })

  it('return the item to the person who raised the dispute, and suspend a deliberate claimer', async () => {
    const aliceDispute = (await as(alice).get('/api/disputes/mine')).body[0]
    const url = `/api/admin/disputes/${aliceDispute.id}/uphold`
    expect((await as(admin).post(url, {})).status).toBe(400)
    expect((await as(admin).post(url, { reason: 'Card inside', penalty: 'fine' })).status).toBe(400)

    const res = await as(admin).post(url, { reason: 'The student card matches Alice', penalty: 'suspend' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('upheld')
    // Carl never had the wallet (the handoff was still pending), so nothing to return
    expect(res.body.returnBy).toBeNull()
    expect((await as(admin).post(url, { reason: 'again' })).status).toBe(400)

    // The claim moved to Alice's lost report, and Carl's report opened again
    expect((await Claim.findById(claimId)).status).toBe('overturned')
    expect((await Match.findById(matchId)).status).toBe('rejected')
    const newClaim = await Claim.findById(res.body.newClaimId)
    expect(newClaim).toMatchObject({ claimerId: alice.user.id, status: 'active' })
    expect(await Match.findById(newClaim.matchId)).toMatchObject({ lostItemId: aliceLost.id, foundItemId: found.id, status: 'claimed' })
    expect((await Item.findById(found.id)).status).toBe('matched')
    expect((await Item.findById(aliceLost.id)).status).toBe('matched')
    expect((await Item.findById(carlLost.id)).status).toBe('open')

    const record = (await as(admin).get(`/api/items/${found.id}/record`)).body
    expect(record.state).toBe('claimed')
    expect(record.timeline.map((entry) => entry.event)).toContain('dispute_upheld')
    const publicRecord = (await request(app).get(`/api/items/${found.id}/record`)).body
    expect(publicRecord.timeline.map((entry) => entry.event)).not.toContain('dispute_upheld')
    // Carl's overturned claim is left out too, so a second "claimed" gives nothing away
    expect(publicRecord.timeline.filter((entry) => entry.event === 'claimed')).toHaveLength(1)
    expect(record.timeline.filter((entry) => entry.event === 'claimed')).toHaveLength(2)

    const [carlsView] = (await as(carl).get('/api/disputes/on-my-claims')).body
    expect(carlsView).toMatchObject({ status: 'upheld', decisionReason: 'The student card matches Alice' })
  })

  it('a suspended user can read and log in, but not post, report or dispute', async () => {
    const me = await as(carl).get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.suspendedAt).toBeTruthy()
    expect((await as(carl).post('/api/items', itemBody('lost', 'Another wallet'))).status).toBe(403)
    expect((await as(carl).post('/api/reports', { itemId: aliceLost.id, reason: 'x' })).status).toBe(403)
  })

  it('list open reports with what was reported', async () => {
    const res = await as(admin).get('/api/admin/reports')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(4)
    expect(res.body[0].message.text).toBe('something abusive')
    expect(res.body[1].item.id).toBe(spam.id)
  })

  it('show a reported message in context, then remove it from the chat', async () => {
    const [report] = (await as(admin).get('/api/admin/reports')).body
    const detail = (await as(admin).get(`/api/admin/reports/${report.id}`)).body
    expect(detail.author.email).toBe(ben.user.email)
    expect(detail.context.map((m) => m.id)).toEqual([carlMessage.id, benMessage.id])

    const res = await as(admin).post(`/api/admin/reports/${report.id}/remove`, { reason: 'Abusive' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('actioned')
    const chat = await Message.findByMatch(matchId)
    expect(chat.find((m) => m.id === benMessage.id).text).toBe('')
  })

  it('dismiss a report, which shows a hidden post again, and refuse to act on it afterwards', async () => {
    const reports = (await as(admin).get('/api/admin/reports')).body
    const first = reports.find((r) => r.itemId === spam.id)
    expect((await as(admin).post(`/api/admin/reports/${first.id}/dismiss`, {})).status).toBe(200)
    expect((await request(app).get(`/api/items/${spam.id}`)).status).toBe(200)
    expect((await as(admin).post(`/api/admin/reports/${first.id}/warn`, { reason: 'x' })).status).toBe(400)
  })

  it('remove a fake post for good', async () => {
    const reports = (await as(admin).get('/api/admin/reports')).body
    const next = reports.find((r) => r.itemId === spam.id)
    expect((await as(admin).post(`/api/admin/reports/${next.id}/remove`, { reason: 'Fake post' })).status).toBe(200)
    expect((await request(app).get(`/api/items/${spam.id}`)).status).toBe(404)
  })

  it('lift a suspension, after which the user can post again', async () => {
    expect((await as(admin).post(`/api/admin/users/${carl.user.id}/unsuspend`, {})).status).toBe(400)
    const res = await as(admin).post(`/api/admin/users/${carl.user.id}/unsuspend`, { reason: 'Item returned' })
    expect(res.status).toBe(200)
    expect(res.body.suspendedAt).toBeNull()
    expect((await as(carl).post('/api/items', itemBody('lost', 'Another wallet'))).status).toBe(201)
  })

  it('log every admin action, newest first', async () => {
    const res = await as(admin).get('/api/admin/actions')
    expect(res.status).toBe(200)
    expect(res.body.map((entry) => entry.action)).toEqual([
      'unsuspend_user', 'remove_item', 'dismiss_report', 'remove_message',
      'suspend_user', 'uphold_dispute', 'close_dispute',
    ])
    expect(res.body[0]).toMatchObject({ admin: { id: admin.user.id }, user: { id: carl.user.id } })
  })
})

describe('withdrawing a claim', () => {
  it('gives the item to the person who raised the dispute, with no admin needed', async () => {
    // Dan disputes Alice's claim; Alice decides it might not be hers after all
    expect((await as(dan).post('/api/disputes', { itemId: found.id, description: 'Mine, with a blue tag' })).status).toBe(201)
    const [dispute] = (await as(alice).get('/api/disputes/on-my-claims')).body
    expect((await as(dan).post(`/api/disputes/${dispute.id}/withdraw`, {})).status).toBe(403)

    const res = await as(alice).post(`/api/disputes/${dispute.id}/withdraw`, {})
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('withdrawn')

    expect((await Item.findById(aliceLost.id)).status).toBe('open')
    expect((await Item.findById(danLost.id)).status).toBe('matched')
    const record = (await as(admin).get(`/api/items/${found.id}/record`)).body
    expect(record.state).toBe('claimed')
    expect(record.timeline.map((entry) => entry.event)).toContain('claim_withdrawn')
    expect((await as(alice).post(`/api/disputes/${dispute.id}/withdraw`, {})).status).toBe(400)
  })
})

describe('the daily job after a dispute is decided', () => {
  it('never completes the old handoff of a claim an admin moved to someone else', async () => {
    // Carl's claim was overturned above, but his handoff stayed behind. Make it
    // look handed over 8 days ago, which the daily job would normally complete.
    const [old] = await Handoff.findByMatch(matchId)
    const handoff = old || await Handoff.create({ matchId, method: 'meetup', spotId: spotIds[0], scheduledAt: null })
    await Handoff.update(handoff.id, {
      status: 'handed_over',
      handedOverAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    })

    const res = await request(app).get('/api/cron/daily').set('Authorization', `Bearer ${process.env.CRON_SECRET}`)
    expect(res.status).toBe(200)
    expect((await Handoff.findById(handoff.id)).status).toBe('handed_over')
    expect((await Match.findById(matchId)).status).toBe('rejected')
    expect((await Item.findById(found.id)).status).toBe('matched')
    await expect(completeHandoff(handoff)).rejects.toMatchObject({ status: 409 })
  })
})

describe('after an admin keeps a claim', () => {
  it('does not let the same person dispute that claim again', async () => {
    const [finder, owner, disputer] = await Promise.all([1, 2, 3].map(() => registerUser(app)))
    const ownerLost = (await as(owner).post('/api/items', itemBody('lost', 'Grey wallet'))).body.item
    await as(disputer).post('/api/items', itemBody('lost', 'Grey wallet, mine'))
    const item = (await as(finder).post('/api/items', itemBody('found', 'Grey wallet'))).body.item
    const [match] = await Match.saveMany([{ lostItemId: ownerLost.id, foundItemId: item.id, score: 80, breakdown: {}, reasons: [] }])
    await Claim.create({ matchId: match.id, claimerId: owner.user.id, detail: 'Grey' })
    await Match.updateStatus(match.id, 'claimed')
    await Item.updateStatus(ownerLost.id, 'matched')
    await Item.updateStatus(item.id, 'matched')

    const first = await as(disputer).post('/api/disputes', { itemId: item.id, description: 'It is mine' })
    expect(first.status).toBe(201)
    const kept = await as(admin).post(`/api/admin/disputes/${first.body.id}/close`, { reason: 'The claim detail fits' })
    expect(kept.status).toBe(200)

    const again = await as(disputer).post('/api/disputes', { itemId: item.id, description: 'Still mine' })
    expect(again.status).toBe(409)
    expect(await Dispute.hasOpenForItem(item.id)).toBe(false)
  })
})

describe('a post an admin removed', () => {
  it('stays removed: its handoff cannot complete', async () => {
    const [finder, owner] = await Promise.all([1, 2].map(() => registerUser(app)))
    const ownerLost = (await as(owner).post('/api/items', itemBody('lost', 'Black wallet'))).body.item
    const item = (await as(finder).post('/api/items', itemBody('found', 'Black wallet'))).body.item
    const [match] = await Match.saveMany([{ lostItemId: ownerLost.id, foundItemId: item.id, score: 80, breakdown: {}, reasons: [] }])
    await Claim.create({ matchId: match.id, claimerId: owner.user.id, detail: 'Black' })
    await Match.updateStatus(match.id, 'claimed')
    await Item.updateStatus(ownerLost.id, 'matched')
    const handoff = await Handoff.create({ matchId: match.id, method: 'meetup', spotId: spotIds[0], scheduledAt: null })
    await Item.updateStatus(item.id, 'removed')

    await expect(completeHandoff(handoff)).rejects.toMatchObject({ status: 409 })
    expect((await Item.findById(item.id)).status).toBe('removed')
    expect((await Item.findById(ownerLost.id)).status).toBe('matched')
  })
})
