// The claim, chat and handoff routes (Member 5), run through the real app with
// supertest, but with every model function they use swapped for a small
// in-memory copy. The database client is made to throw, so this file can never
// read or change the shared test database. tests/api/handoff-flow.test.js runs
// the same journey against the real test database.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret'
const supabase = require('../../lib/db')
const request = require('supertest')
const app = require('../../app')
const { sign } = require('../../lib/token')
const { httpError } = require('../../lib/errors')
const User = require('../../models/user-model')
const Item = require('../../models/item-model')
const Match = require('../../models/match-model')
const Claim = require('../../models/claim-model')
const Handoff = require('../../models/handoff-model')
const Message = require('../../models/message-model')
const Dispute = require('../../models/dispute-model')
const Spot = require('../../models/spot-model')

// ---------------------------------------------------------------------------
// The in-memory copy of the tables these routes touch
let db
const NOW = '2026-10-20T01:00:00.000Z'

function freshDb() {
  return {
    users: [
      { id: 1, name: 'Alice Tan', email: 'alice@smu.edu.sg', role: 'user', emailVerifiedAt: NOW, suspendedAt: null },
      { id: 2, name: 'Ben Lim', email: 'ben@smu.edu.sg', role: 'user', emailVerifiedAt: NOW, suspendedAt: null },
      { id: 3, name: 'Chloe Ng', email: 'chloe@smu.edu.sg', role: 'user', emailVerifiedAt: NOW, suspendedAt: null },
      { id: 4, name: 'New Person', email: 'new@smu.edu.sg', role: 'user', emailVerifiedAt: null, suspendedAt: null },
    ],
    // Alice lost 1 and 3, Ben found 2 and 4, Chloe lost 5
    items: [
      { id: 1, type: 'lost', status: 'open', postedBy: 1, title: 'Navy bottle', createdAt: '2026-10-18T01:00:00.000Z', hiddenAt: null },
      { id: 2, type: 'found', status: 'open', postedBy: 2, title: 'Navy Hydro Flask', createdAt: '2026-10-18T03:00:00.000Z', hiddenAt: null, trail: [{ spotId: 1 }] },
      { id: 3, type: 'lost', status: 'open', postedBy: 1, title: 'Black umbrella', createdAt: '2026-10-18T01:00:00.000Z', hiddenAt: null },
      { id: 4, type: 'found', status: 'open', postedBy: 2, title: 'Umbrella', createdAt: '2026-10-18T03:00:00.000Z', hiddenAt: null },
      { id: 5, type: 'lost', status: 'open', postedBy: 3, title: 'My bottle', createdAt: '2026-10-18T01:00:00.000Z', hiddenAt: null },
    ],
    matches: [
      { id: 10, lostItemId: 1, foundItemId: 2, score: 90, reasons: ['same category'], status: 'suggested', createdAt: NOW },
      { id: 11, lostItemId: 3, foundItemId: 4, score: 70, reasons: [], status: 'suggested', createdAt: NOW },
      { id: 12, lostItemId: 5, foundItemId: 2, score: 60, reasons: [], status: 'suggested', createdAt: NOW },
    ],
    claims: [],
    handoffs: [],
    messages: [],
    openDisputeItemIds: new Set(),
    spots: [
      { id: 1, building: 'SCIS 1', area: 'room 2-4', isCollectionPoint: false, coordinates: { lat: 1.2973, lng: 103.8494 } },
      { id: 7, building: 'Li Ka Shing Library', area: 'service desk', isCollectionPoint: true, coordinates: { lat: 1.2966, lng: 103.8499 } },
    ],
  }
}

let nextId = 100
const find = (table, id) => db[table].find((row) => row.id === Number(id)) || null
const copy = (row) => (row ? structuredClone(row) : null)

const fakes = [
  [User, {
    findById: async (id) => copy(find('users', id)),
  }],
  [Item, {
    findById: async (id) => copy(find('items', id)),
    findByIds: async (ids) => db.items.filter((item) => ids.map(Number).includes(item.id)).map(copy),
    findAll: async ({ type, status, postedBy } = {}) => db.items
      .filter((item) => (!type || item.type === type) && (!status || item.status === status)
        && (!postedBy || item.postedBy === postedBy))
      .map(copy),
    updateStatus: async (id, status) => {
      const item = find('items', id)
      item.status = status
      return copy(item)
    },
  }],
  [Match, {
    findById: async (id) => copy(find('matches', id)),
    findByItem: async (itemId) => db.matches
      .filter((match) => match.lostItemId === Number(itemId) || match.foundItemId === Number(itemId)).map(copy),
    findByIds: async (ids) => db.matches.filter((match) => ids.map(Number).includes(match.id)).map(copy),
    findByFoundItems: async (ids) => db.matches
      .filter((match) => ids.map(Number).includes(match.foundItemId)).map(copy),
    findByLostItems: async (ids) => db.matches
      .filter((match) => ids.map(Number).includes(match.lostItemId)).map(copy),
    updateStatus: async (id, status) => {
      const match = find('matches', id)
      match.status = status
      return copy(match)
    },
  }],
  [Claim, {
    create: async ({ matchId, claimerId, detail }) => {
      if (db.claims.some((claim) => claim.matchId === matchId && claim.status === 'active')) {
        throw httpError(409, 'Already exists')
      }
      const claim = { id: nextId++, matchId, claimerId, detail, status: 'active', createdAt: new Date().toISOString(), decidedAt: null }
      db.claims.push(claim)
      return copy(claim)
    },
    findById: async (id) => copy(find('claims', id)),
    findActiveByMatch: async (matchId) => copy(db.claims.find((claim) => claim.matchId === matchId && claim.status === 'active')),
    findByMatch: async (matchId) => db.claims.filter((claim) => claim.matchId === matchId).reverse().map(copy),
    findByMatches: async (ids) => db.claims.filter((claim) => ids.includes(claim.matchId)).map(copy),
    findByClaimer: async (userId) => db.claims.filter((claim) => claim.claimerId === userId).reverse().map(copy),
    update: async (id, fields) => {
      const claim = find('claims', id)
      Object.assign(claim, fields)
      return copy(claim)
    },
  }],
  [Handoff, {
    create: async (data) => {
      const handoff = { id: nextId++, status: 'pending', handedOverAt: null, completedAt: null, createdAt: new Date().toISOString(), ...data }
      db.handoffs.push(handoff)
      return copy(handoff)
    },
    findById: async (id) => copy(find('handoffs', id)),
    findByMatch: async (matchId) => db.handoffs.filter((handoff) => handoff.matchId === matchId).reverse().map(copy),
    findByMatches: async (ids) => db.handoffs.filter((handoff) => ids.includes(handoff.matchId)).map(copy),
    update: async (id, fields) => {
      const handoff = find('handoffs', id)
      Object.assign(handoff, fields)
      return copy(handoff)
    },
  }],
  [Message, {
    create: async ({ matchId, senderId, text }) => {
      const message = { id: nextId++, matchId, senderId, text, sentAt: new Date().toISOString(), removedAt: null }
      db.messages.push(message)
      return copy(message)
    },
    findByMatch: async (matchId) => db.messages.filter((message) => message.matchId === matchId).map(copy),
    // The newest message of each chat (the list is oldest first, so the last one)
    findLatestByMatches: async (ids) => {
      const latest = new Map()
      for (const message of db.messages) {
        if (ids.map(Number).includes(message.matchId)) latest.set(message.matchId, copy(message))
      }
      return latest
    },
    announce: async () => {},
  }],
  [Dispute, {
    hasOpenForItem: async (itemId) => db.openDisputeItemIds.has(Number(itemId)),
    // An open dispute on an item is against the claim that stands on it
    findByClaims: async (ids) => db.claims
      .filter((claim) => ids.map(Number).includes(claim.id) && claim.status === 'active'
        && db.openDisputeItemIds.has(Number(find('matches', claim.matchId).foundItemId)))
      .map((claim) => ({ id: 900 + claim.id, claimId: claim.id, status: 'open' })),
  }],
  [Spot, {
    findById: async (id) => copy(find('spots', id)),
    findCollectionPoints: async () => db.spots.filter((spot) => spot.isCollectionPoint).map(copy),
  }],
]

const originals = []
const originalFrom = supabase.from
const originalRpc = supabase.rpc

beforeAll(() => {
  // Anything that slips past the fakes fails loudly instead of reaching the database
  supabase.from = () => { throw new Error('The database must not be used in unit tests') }
  supabase.rpc = supabase.from
  for (const [model, replacements] of fakes) {
    for (const [name, fake] of Object.entries(replacements)) {
      originals.push([model, name, model[name]])
      model[name] = fake
    }
  }
})

afterAll(() => {
  supabase.from = originalFrom
  supabase.rpc = originalRpc
  for (const [model, name, original] of originals) model[name] = original
})

beforeEach(() => {
  db = freshDb()
})

function as(userId) {
  const token = sign(userId)
  const auth = (req) => req.set('Authorization', `Bearer ${token}`)
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    patch: (url, body) => auth(request(app).patch(url)).send(body),
  }
}
const alice = as(1)
const ben = as(2)
const chloe = as(3)
const newcomer = as(4)

async function claim(matchId = 10, detail = 'Cat sticker near the base') {
  const res = await alice.post(`/api/claims/${matchId}`, { detail })
  expect(res.status).toBe(201)
  return res.body
}

async function accept(matchId = 10, body = {}) {
  const res = await ben.post('/api/handoffs', { matchId, method: 'drop-off', spotId: 7, ...body })
  expect(res.status).toBe(201)
  return res.body
}

// ---------------------------------------------------------------------------
describe('POST /api/claims/:matchId', () => {
  it('lets the owner claim with a detail, and takes both items out of matching', async () => {
    const body = await claim(10, '  Cat sticker near the base  ')
    expect(body.role).toBe('owner')
    expect(body.claim).toMatchObject({ matchId: 10, detail: 'Cat sticker near the base', status: 'active' })
    expect(body.claim).not.toHaveProperty('claimerId')
    expect(body.match.status).toBe('claimed')
    expect(find('items', 1).status).toBe('matched')
    expect(find('items', 2).status).toBe('matched')
    expect(db.claims[0].claimerId).toBe(1)
  })

  it('needs a detail of up to 500 characters', async () => {
    expect((await alice.post('/api/claims/10', {})).status).toBe(400)
    expect((await alice.post('/api/claims/10', { detail: '   ' })).status).toBe(400)
    expect((await alice.post('/api/claims/10', { detail: 'x'.repeat(501) })).status).toBe(400)
    expect(db.claims).toHaveLength(0)
  })

  it('is for the owner only', async () => {
    expect((await ben.post('/api/claims/10', { detail: 'mine' })).status).toBe(403)
    expect((await chloe.post('/api/claims/10', { detail: 'mine' })).status).toBe(403)
    expect((await request(app).post('/api/claims/10').send({ detail: 'mine' })).status).toBe(401)
  })

  it('refuses an account that has not verified its SMU email', async () => {
    db.items.push({ id: 6, type: 'lost', status: 'open', postedBy: 4, title: 'x', createdAt: NOW, hiddenAt: null })
    db.matches.push({ id: 13, lostItemId: 6, foundItemId: 4, score: 55, reasons: [], status: 'suggested', createdAt: NOW })
    expect((await newcomer.post('/api/claims/13', { detail: 'mine' })).status).toBe(403)
  })

  it('answers 404 for a missing match and 400 for a bad id', async () => {
    expect((await alice.post('/api/claims/999', { detail: 'x' })).status).toBe(404)
    expect((await alice.post('/api/claims/abc', { detail: 'x' })).status).toBe(400)
  })

  it('answers a repeated claim with the claim that stands, and refuses a claim on an item already being returned', async () => {
    await claim(10)
    // Alice's page gave up waiting and she pressed Try again: no second claim, no error
    const again = await alice.post('/api/claims/10', { detail: 'again' })
    expect(again.status).toBe(200)
    expect(db.claims.filter((entry) => entry.matchId === 10)).toHaveLength(1)
    // Chloe's match points at the same found item, which is no longer open
    const res = await as(3).post('/api/claims/12', { detail: 'Mine too' })
    expect(res.status).toBe(400)
  })

  it('keeps only the first claim when two owners claim the same find at once', async () => {
    // Chloe's claim on the same find (match 12) was saved a moment earlier,
    // before the find was marked as matched
    db.claims.push({ id: nextId++, matchId: 12, claimerId: 3, detail: 'Mine', status: 'active', createdAt: NOW, decidedAt: null })
    const res = await alice.post('/api/claims/10', { detail: 'Cat sticker near the base' })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Someone else has just claimed/)
    expect(db.claims.filter((claim) => claim.status === 'active').map((claim) => claim.matchId)).toEqual([12])
    expect(find('matches', 10).status).toBe('suggested')
    expect(find('items', 1).status).toBe('open')
    // The refused claim never went ahead, so it shows nowhere
    expect((await alice.get('/api/claims/mine')).body).toEqual([])
    expect((await alice.get('/api/claims/10')).body.closed).toBeNull()
  })

  it('lets exactly one of two claims sent together go through', async () => {
    const [first, second] = await Promise.all([
      alice.post('/api/claims/10', { detail: 'Cat sticker' }),
      chloe.post('/api/claims/12', { detail: 'Dent on the lid' }),
    ])
    // 409 when both got past the first check, 400 when one finished first
    expect([first.status, second.status].filter((status) => status === 201)).toHaveLength(1)
    expect(db.claims.filter((claim) => claim.status === 'active')).toHaveLength(1)
  })

  it('refuses a found item hidden by reports', async () => {
    find('items', 2).hiddenAt = NOW
    expect((await alice.post('/api/claims/10', { detail: 'x' })).status).toBe(400)
  })
})

describe('GET /api/claims/:matchId', () => {
  it('shows both people the claim and its detail, without the claimer', async () => {
    await claim(10)
    for (const [user, role] of [[alice, 'owner'], [ben, 'finder']]) {
      const res = await user.get('/api/claims/10')
      expect(res.status).toBe(200)
      expect(res.body.role).toBe(role)
      expect(res.body.claim.detail).toBe('Cat sticker near the base')
      expect(JSON.stringify(res.body.claim)).not.toContain('claimerId')
      expect(res.body.foundItem.id).toBe(2)
      expect(res.body.handoff).toBeNull()
      expect(res.body.disputeOpen).toBe(false)
    }
    // The owner sees their own lost report; the finder does not get it
    expect((await alice.get('/api/claims/10')).body.lostItem.id).toBe(1)
    expect((await ben.get('/api/claims/10')).body.lostItem).toBeNull()
    expect((await chloe.get('/api/claims/10')).status).toBe(403)
  })

  it('answers with no claim yet for a suggested match', async () => {
    const res = await alice.get('/api/claims/10')
    expect(res.body).toMatchObject({ role: 'owner', claim: null, match: { status: 'suggested' } })
  })
})

const REASON = { reason: 'There is no sticker on this one' }

describe('POST /api/claims/:matchId/decline', () => {
  it('lets the finder decline, which reopens both items and closes the chat', async () => {
    await claim(10)
    expect((await alice.post('/api/claims/10/decline', REASON)).status).toBe(403)

    const res = await ben.post('/api/claims/10/decline', REASON)
    expect(res.status).toBe(200)
    expect(res.body.claim).toBeNull()
    expect(res.body.match.status).toBe('rejected')
    expect(db.claims[0]).toMatchObject({ status: 'declined' })
    expect(db.claims[0].decidedAt).toBeTruthy()
    expect(find('items', 1).status).toBe('open')
    expect(find('items', 2).status).toBe('open')
    expect((await alice.get('/api/messages/10')).status).toBe(403)
  })

  it('needs a reason, which both people then read on the closed chat', async () => {
    await claim(10)
    expect((await ben.post('/api/claims/10/decline', {})).status).toBe(400)
    expect((await ben.post('/api/claims/10/decline', { reason: '   ' })).status).toBe(400)
    expect((await ben.post('/api/claims/10/decline', { reason: 'x'.repeat(301) })).status).toBe(400)
    expect(db.claims[0].status).toBe('active')

    await ben.post('/api/claims/10/decline', { reason: '  There is no sticker on this one  ' })
    for (const user of [alice, ben]) {
      const { closed, claim: standing } = (await user.get('/api/claims/10')).body
      expect(standing).toBeNull()
      expect(closed).toMatchObject({ status: 'declined', reason: 'There is no sticker on this one' })
      expect(closed.decidedAt).toBeTruthy()
    }
  })

  it('keeps the lost report of the owner open, so it can be matched again', async () => {
    await claim(10)
    expect(find('items', 1).status).toBe('matched')
    await ben.post('/api/claims/10/decline', REASON)
    expect(find('items', 1).status).toBe('open')
  })

  it('answers 404 with no claim, and 400 once the finder accepted', async () => {
    expect((await ben.post('/api/claims/10/decline', REASON)).status).toBe(404)
    await claim(10)
    await accept(10)
    expect((await ben.post('/api/claims/10/decline', REASON)).status).toBe(400)
  })

  it('is refused while a dispute is open', async () => {
    await claim(10)
    db.openDisputeItemIds.add(2)
    expect((await ben.post('/api/claims/10/decline', REASON)).status).toBe(409)
  })

  it('shows no closing reason while the claim stands', async () => {
    await claim(10)
    expect((await alice.get('/api/claims/10')).body.closed).toBeNull()
  })
})

describe('GET /api/claims/mine', () => {
  it('lists claims for both the owner and the finder, and nothing for others', async () => {
    await claim(10)
    await claim(11)
    const forAlice = (await alice.get('/api/claims/mine')).body
    expect(forAlice.map((row) => [row.matchId, row.role])).toEqual(expect.arrayContaining([[10, 'owner'], [11, 'owner']]))
    const forBen = (await ben.get('/api/claims/mine')).body
    expect(forBen.map((row) => row.role)).toEqual(['finder', 'finder'])
    expect(forBen[0].foundItem).toBeTruthy()
    expect((await chloe.get('/api/claims/mine')).body).toEqual([])
  })

  it('says when the newest message was sent and who sent it, never its text', async () => {
    await claim(10)
    expect((await alice.get('/api/claims/mine')).body[0].lastMessage).toBeNull()
    await ben.post('/api/messages/10', { text: 'Found it by the lifts' })
    const forAlice = (await alice.get('/api/claims/mine')).body[0]
    expect(forAlice.lastMessage).toMatchObject({ fromMe: false })
    expect(forAlice.lastMessage.sentAt).toBeTruthy()
    expect(JSON.stringify(forAlice)).not.toContain('Found it by the lifts')
    expect((await ben.get('/api/claims/mine')).body[0].lastMessage.fromMe).toBe(true)
  })

  it('keeps a declined claim on the list, marked declined, with the reason as news', async () => {
    await claim(10)
    await ben.post('/api/claims/10/decline', REASON)
    const [row] = (await alice.get('/api/claims/mine')).body
    expect(row).toMatchObject({ matchId: 10, role: 'owner', claimStatus: 'declined', matchStatus: 'rejected' })
    // The reason is the finder's last message, so it shows as new to the owner
    expect(row.lastMessage.fromMe).toBe(false)
    expect((await ben.get('/api/claims/mine')).body[0].claimStatus).toBe('declined')
  })

  it('marks a claim whose handoff a dispute pauses, for both people', async () => {
    await claim(10)
    expect((await alice.get('/api/claims/mine')).body[0].disputeOpen).toBe(false)
    db.openDisputeItemIds.add(2)
    expect((await alice.get('/api/claims/mine')).body[0].disputeOpen).toBe(true)
    expect((await ben.get('/api/claims/mine')).body[0].disputeOpen).toBe(true)
  })
})

describe('chat', () => {
  it('stays closed until the owner claims, then lets both people talk', async () => {
    expect((await alice.get('/api/messages/10')).status).toBe(403)
    await claim(10)
    const sent = await ben.post('/api/messages/10', { text: '  Found it by the lifts  ' })
    expect(sent.status).toBe(201)
    expect(sent.body.text).toBe('Found it by the lifts')
    await alice.post('/api/messages/10', { text: 'Thank you!' })
    const all = (await alice.get('/api/messages/10')).body
    expect(all.map((message) => message.text)).toEqual(['Found it by the lifts', 'Thank you!'])
    expect((await chloe.get('/api/messages/10')).status).toBe(403)
    expect((await alice.get('/api/messages/10/channel')).body.channel).toMatch(/^chat-10-[0-9a-f]{32}$/)
  })

  it('answers before the chat ping, which finishes in the background', async () => {
    await claim(10)
    const steps = []
    const fake = Message.announce
    Message.announce = async (channel) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      steps.push(`pinged ${channel.split('-').slice(0, 2).join('-')}`)
    }
    try {
      const sent = await ben.post('/api/messages/10', { text: 'On my way' })
      steps.push('answered')
      expect(sent.status).toBe(201)
    } finally {
      Message.announce = fake
    }
    expect(steps[0]).toBe('answered')
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(steps).toEqual(['answered', 'pinged chat-10'])
  })

  it('saves a message sent twice in a row only once', async () => {
    await claim(10)
    const first = await ben.post('/api/messages/10', { text: 'On my way' })
    const again = await ben.post('/api/messages/10', { text: 'On my way' })
    expect(first.status).toBe(201)
    expect(again.status).toBe(200)
    expect(again.body.id).toBe(first.body.id)
    expect(db.messages.filter((message) => message.text === 'On my way')).toHaveLength(1)
  })

  it('still sends when the chat ping cannot reach Realtime', async () => {
    await claim(10)
    const fake = Message.announce
    const realFetch = globalThis.fetch
    const realError = console.error
    // The real announce, with the network down: it logs and gives up
    Message.announce = originals.find(([model, name]) => model === Message && name === 'announce')[2]
    globalThis.fetch = async () => {
      throw new Error('network down')
    }
    console.error = () => {}
    try {
      expect((await ben.post('/api/messages/10', { text: 'Hello' })).status).toBe(201)
    } finally {
      Message.announce = fake
      globalThis.fetch = realFetch
      console.error = realError
    }
  })

  it('becomes read-only once the handoff is resolved', async () => {
    await claim(10)
    const handoff = await accept(10)
    await alice.post(`/api/handoffs/${handoff.id}/confirm`)
    expect((await alice.get('/api/messages/10')).status).toBe(200)
    expect((await alice.post('/api/messages/10', { text: 'Thanks' })).status).toBe(409)
  })
})

describe('handoff', () => {
  it('is planned by the finder only, once the item is claimed', async () => {
    expect((await ben.post('/api/handoffs', { matchId: 10, method: 'meetup', spotId: 7 })).status).toBe(403)
    await claim(10)
    expect((await alice.post('/api/handoffs', { matchId: 10, method: 'meetup', spotId: 7 })).status).toBe(403)
    expect((await ben.post('/api/handoffs', { matchId: 10, method: 'drop-off', spotId: 1 })).status).toBe(400)
    const handoff = await accept(10)
    expect(handoff).toMatchObject({ status: 'pending', method: 'drop-off', spotId: 7 })
    expect((await ben.post('/api/handoffs', { matchId: 10, method: 'meetup', spotId: 7 })).status).toBe(409)
    expect((await alice.get('/api/claims/10')).body.handoff.id).toBe(handoff.id)
  })

  it('runs pending, handed over by the finder, then confirmed by the owner', async () => {
    await claim(10)
    const handoff = await accept(10)
    const url = `/api/handoffs/${handoff.id}`

    expect((await alice.patch(url, { method: 'meetup' })).status).toBe(200)
    expect((await alice.post(`${url}/handed-over`)).status).toBe(403)
    const handedOver = await ben.post(`${url}/handed-over`)
    expect(handedOver.body.status).toBe('handed_over')
    expect((await ben.patch(url, { method: 'drop-off' })).status).toBe(400)

    expect((await ben.post(`${url}/confirm`)).status).toBe(403)
    const done = await alice.post(`${url}/confirm`)
    expect(done.body.status).toBe('completed')
    expect(find('matches', 10).status).toBe('confirmed')
    expect(find('items', 1).status).toBe('resolved')
    expect(find('items', 2).status).toBe('resolved')
    expect((await alice.post(`${url}/confirm`)).status).toBe(400)
  })

  it('cannot be completed while a dispute is open', async () => {
    await claim(10)
    const handoff = await accept(10)
    db.openDisputeItemIds.add(2)
    const res = await alice.post(`/api/handoffs/${handoff.id}/confirm`)
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/dispute/)
  })

  it('only lets the newest plan be used when a double click saved two', async () => {
    await claim(10)
    const older = await accept(10)
    // As a second "Yes, it fits" sent at the same moment does
    const newer = { ...find('handoffs', older.id), id: nextId++ }
    db.handoffs.push(newer)
    const stale = await ben.post(`/api/handoffs/${older.id}/handed-over`)
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatch(/newer/)
    expect((await alice.post(`/api/handoffs/${older.id}/confirm`)).status).toBe(409)
    expect((await ben.patch(`/api/handoffs/${older.id}`, { method: 'meetup' })).status).toBe(409)
    expect((await ben.post(`/api/handoffs/${newer.id}/handed-over`)).status).toBe(200)
  })

  it('cannot be accepted while a dispute is open', async () => {
    await claim(10)
    db.openDisputeItemIds.add(2)
    const res = await ben.post('/api/handoffs', { matchId: 10, method: 'drop-off', spotId: 7 })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/dispute/)
    expect(db.handoffs).toHaveLength(0)
  })

  it('refuses a planned time in the past, and takes one later on', async () => {
    await claim(10)
    const past = await ben.post('/api/handoffs', { matchId: 10, method: 'drop-off', spotId: 7, scheduledAt: '2020-01-01T02:00:00Z' })
    expect(past.status).toBe(400)
    const later = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const handoff = await accept(10, { scheduledAt: later })
    expect(handoff.scheduledAt).toBe(later)
    const edit = await alice.patch(`/api/handoffs/${handoff.id}`, { scheduledAt: '2020-01-01T02:00:00Z' })
    expect(edit.status).toBe(400)
    expect((await alice.patch(`/api/handoffs/${handoff.id}`, { scheduledAt: null })).status).toBe(200)
  })

  it('saves how it went back in the same step as the handover', async () => {
    await claim(10)
    const handoff = await accept(10)
    const res = await ben.post(`/api/handoffs/${handoff.id}/handed-over`, { method: 'meetup' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'handed_over', method: 'meetup' })
  })

  it('changes nothing when the handover cannot be saved', async () => {
    await claim(10)
    // A meetup by the lifts: not a collection point, so not a drop-off place
    const handoff = await accept(10, { method: 'meetup', spotId: 1 })
    const res = await ben.post(`/api/handoffs/${handoff.id}/handed-over`, { method: 'drop-off' })
    expect(res.status).toBe(400)
    expect(find('handoffs', handoff.id)).toMatchObject({ status: 'pending', method: 'meetup' })
    db.openDisputeItemIds.add(2)
    expect((await ben.post(`/api/handoffs/${handoff.id}/handed-over`, { method: 'meetup' })).status).toBe(409)
    expect(find('handoffs', handoff.id).status).toBe('pending')
  })

  it('cannot be handed over while a dispute is open', async () => {
    await claim(10)
    const handoff = await accept(10)
    db.openDisputeItemIds.add(2)
    const res = await ben.post(`/api/handoffs/${handoff.id}/handed-over`)
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/dispute/)
    expect(find('handoffs', handoff.id).status).toBe('pending')
    // Once an admin keeps the claim, the handoff goes on
    db.openDisputeItemIds.delete(2)
    expect((await ben.post(`/api/handoffs/${handoff.id}/handed-over`)).status).toBe(200)
  })

  it('is closed once the claim no longer stands', async () => {
    await claim(10)
    const handoff = await accept(10)
    // As an admin's decision does: the claim is overturned and the match rejected
    db.claims[0].status = 'overturned'
    find('matches', 10).status = 'rejected'
    expect((await ben.post(`/api/handoffs/${handoff.id}/handed-over`)).status).toBe(409)
    expect((await alice.post(`/api/handoffs/${handoff.id}/confirm`)).status).toBe(409)
  })

  it('gives the figures for the resolved page once complete', async () => {
    await claim(10)
    const handoff = await accept(10)
    expect((await alice.get('/api/handoffs/match/10/summary')).status).toBe(404)
    await alice.post(`/api/handoffs/${handoff.id}/confirm`)
    const res = await ben.get('/api/handoffs/match/10/summary')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ method: 'drop-off', spotId: 7, finderReturns: 1, totalReturned: 1 })
    expect(res.body.daysToReturn).toBeGreaterThanOrEqual(0)
    expect((await chloe.get('/api/handoffs/match/10/summary')).status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
describe('where and when the find was handed in (lib/item-privacy.js)', () => {
  const hidden = [{ spotId: null, roomId: null, from: null, to: null }]

  it('is hidden from the owner, and claiming does not show it, unless their report said it', async () => {
    find('matches', 10).reasons = ['same category', 'nearby buildings: SCIS 1 and Concourse']
    const before = await alice.get('/api/claims/10')
    expect(before.body.foundItem.trail).toEqual(hidden)
    expect(before.body.match.reasons).toEqual(['same category'])
    const claimed = await claim(10)
    expect(claimed.foundItem.placeHidden).toBe(true)
    const list = await alice.get('/api/claims/mine')
    expect(list.body[0].foundItem.trail).toEqual(hidden)
  })

  it('shows to the finder', async () => {
    await claim(10)
    expect((await ben.get('/api/claims/10')).body.foundItem.trail).toEqual([{ spotId: 1 }])
    expect((await ben.get('/api/claims/mine')).body[0].foundItem.trail).toEqual([{ spotId: 1 }])
  })

  it('stays hidden when another of the owner’s reports guessed wrong on the same find', async () => {
    find('matches', 10).breakdown = { C: 100, A: 80, L: 80, D: 95 }
    // Alice's other report (3) is matched with the same find, at the wrong building
    db.matches.push({ id: 13, lostItemId: 3, foundItemId: 2, score: 65, reasons: [], status: 'suggested', createdAt: NOW, breakdown: { C: 100, A: 80, L: 0, D: 95 } })
    const res = await alice.get('/api/claims/10')
    expect(res.body.foundItem.placeHidden).toBe(true)
  })

  it('shows to an owner whose report named the building around that time', async () => {
    find('matches', 10).breakdown = { C: 100, A: 80, L: 80, D: 95 }
    const res = await alice.get('/api/claims/10')
    expect(res.body.foundItem.trail).toEqual([{ spotId: 1 }])
    expect(res.body.match.reasons).toEqual(['same category'])
  })
})
