import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')
const { truncateAll, registerUser, insertBasics } = require('./helpers')
const Item = require('../../models/item-model')
const Match = require('../../models/match-model')

let alice, ben, spotIds, roomIds

function lostUmbrella(overrides = {}) {
  return {
    type: 'lost',
    title: 'Black Totes umbrella',
    description: 'Folding umbrella with a wooden handle',
    category: 'Umbrella',
    colour: 'Black',
    brand: 'Totes',
    trail: [
      { spotId: spotIds[0], from: '2026-10-07T02:00:00Z', to: '2026-10-07T04:00:00Z' },
      { spotId: spotIds[2], from: '2026-10-07T04:00:00Z', to: '2026-10-07T05:00:00Z' },
    ],
    ...overrides,
  }
}

function post(user, body) {
  return request(app).post('/api/items').set('Authorization', `Bearer ${user.token}`).send(body)
}

beforeAll(async () => {
  await truncateAll()
  ;({ spotIds, roomIds } = await insertBasics())
  alice = await registerUser(app)
  ben = await registerUser(app)
})

describe('reference lists', () => {
  it('lists spots with coordinates as an object, and their rooms in order', async () => {
    const res = await request(app).get('/api/spots')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(3)
    expect(res.body[0]).toMatchObject({
      building: 'SCIS 1', linkedBuildings: ['Concourse'], isCollectionPoint: false,
      coordinates: { lat: 1.2973, lng: 103.8494 },
    })
    expect(res.body[0].lat).toBeUndefined()
    expect(res.body[0].rooms).toEqual([
      { id: roomIds[0], name: 'SCIS1 GSR 2-1' },
      { id: roomIds[1], name: 'SCIS1 GSR 2-2' },
    ])
    expect(res.body[1].rooms).toEqual([])
  })

  it('lists categories', async () => {
    const res = await request(app).get('/api/categories')
    expect(res.status).toBe(200)
    expect(res.body.map((c) => c.name).sort()).toEqual(['Umbrella', 'Wallet'])
  })

  it('lists colours with their hex codes', async () => {
    const res = await request(app).get('/api/colours')
    expect(res.status).toBe(200)
    expect(res.body.find((c) => c.name === 'Navy')).toMatchObject({ hex: '#1f2a5a', related: ['Blue', 'Black'] })
  })
})

describe('colour', () => {
  const postedIds = []

  // The tests further down expect to find only the items they posted themselves
  afterAll(async () => {
    for (const id of postedIds) await Item.remove(id)
  })

  it('saves a colour from the list the way the list spells it', async () => {
    const res = await post(alice, lostUmbrella({ colour: ' navy ' }))
    postedIds.push(res.body.item.id)
    expect(res.status).toBe(201)
    expect(res.body.item.colour).toBe('Navy')
  })

  it('accepts no colour', async () => {
    const res = await post(alice, lostUmbrella({ colour: '' }))
    postedIds.push(res.body.item.id)
    expect(res.status).toBe(201)
    expect(res.body.item.colour).toBeNull()
  })

  it.each(['Dark', 'Reddish orange', 42])('rejects the colour %s', async (colour) => {
    const res = await post(alice, lostUmbrella({ colour }))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Pick a colour from the list')
  })

  it('checks the colour on edit too', async () => {
    const created = await post(alice, lostUmbrella())
    postedIds.push(created.body.item.id)
    const url = `/api/items/${created.body.item.id}`
    const bad = await request(app).patch(url).set('Authorization', `Bearer ${alice.token}`).send({ colour: 'Teal' })
    expect(bad.status).toBe(400)
    const good = await request(app).patch(url).set('Authorization', `Bearer ${alice.token}`).send({ colour: 'grey' })
    expect(good.body.colour).toBe('Grey')
    expect(good.body.colours).toEqual(['Grey'])
  })

  it('saves up to 3 colours, main colour first, and keeps colour as the main one', async () => {
    const res = await post(alice, lostUmbrella({ colour: undefined, colours: ['navy', 'White'] }))
    postedIds.push(res.body.item.id)
    expect(res.status).toBe(201)
    expect(res.body.item.colours).toEqual(['Navy', 'White'])
    expect(res.body.item.colour).toBe('Navy')

    const url = `/api/items/${res.body.item.id}`
    const edited = await request(app).patch(url).set('Authorization', `Bearer ${alice.token}`)
      .send({ colours: ['Red', 'Black', 'Gold'] })
    expect(edited.body.colours).toEqual(['Red', 'Black', 'Gold'])
    expect(edited.body.colour).toBe('Red')
  })

  it('refuses more than 3 colours or the same colour twice', async () => {
    const tooMany = await post(alice, lostUmbrella({ colours: ['Red', 'Black', 'Gold', 'Blue'] }))
    expect(tooMany.status).toBe(400)
    const twice = await post(alice, lostUmbrella({ colours: ['Red', 'red'] }))
    expect(twice.status).toBe(400)
  })
})

describe('create item', () => {
  it('requires login', async () => {
    const res = await request(app).post('/api/items').send(lostUmbrella())
    expect(res.status).toBe(401)
  })

  it('saves a lost item with its trail in order', async () => {
    const res = await post(alice, lostUmbrella())
    expect(res.status).toBe(201)
    expect(res.body.item).toMatchObject({
      type: 'lost', status: 'open', postedBy: alice.user.id, category: 'Umbrella',
    })
    expect(res.body.item.trail).toEqual([
      { spotId: spotIds[0], roomId: null, from: '2026-10-07T02:00:00.000Z', to: '2026-10-07T04:00:00.000Z' },
      { spotId: spotIds[2], roomId: null, from: '2026-10-07T04:00:00.000Z', to: '2026-10-07T05:00:00.000Z' },
    ])
    expect(res.body.matches).toEqual([])
  })

  it('saves the exact room when the trail names one in its spot', async () => {
    const res = await post(alice, lostUmbrella({
      trail: [{ spotId: spotIds[0], roomId: roomIds[1], from: '2026-10-07T02:00:00Z', to: '2026-10-07T04:00:00Z' }],
    }))
    expect(res.status).toBe(201)
    expect(res.body.item.trail[0]).toMatchObject({ spotId: spotIds[0], roomId: roomIds[1] })
  })

  it.each([
    ['a room in another spot', () => ({ spotId: spotIds[1], roomId: roomIds[0] }), 'That room is not in the place you picked'],
    ['a room that does not exist', () => ({ spotId: spotIds[0], roomId: 999999 }), 'Room not found'],
    ['a room id that is not a number', () => ({ spotId: spotIds[0], roomId: 'GSR 2-1' }), undefined],
  ])('rejects %s with 400', async (label, point, message) => {
    const res = await post(alice, lostUmbrella({
      trail: [{ ...point(), from: '2026-10-07T02:00:00Z', to: '2026-10-07T04:00:00Z' }],
    }))
    expect(res.status).toBe(400)
    if (message) expect(res.body.error).toBe(message)
  })

  it.each([
    ['an unknown type', { type: 'stolen' }],
    ['an empty title', { title: '  ' }],
    ['a missing trail', { trail: undefined }],
    ['an empty trail', { trail: [] }],
    ['a trail time that ends before it starts',
      { trail: [{ spotId: 1, from: '2026-10-07T05:00:00Z', to: '2026-10-07T02:00:00Z' }] }],
    ['a trail time that is not a date', { trail: [{ spotId: 1, from: 'soon', to: 'later' }] }],
    ['an unknown category', { category: 'Dragon' }],
    ['an unknown spot',
      { trail: [{ spotId: 999999, from: '2026-10-07T02:00:00Z', to: '2026-10-07T04:00:00Z' }] }],
  ])('rejects %s with 400', async (label, change) => {
    const res = await post(alice, lostUmbrella(change))
    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
  })

  it('rejects a found item with more than one trail point', async () => {
    const res = await post(ben, lostUmbrella({ type: 'found' }))
    expect(res.status).toBe(400)
  })

  it('leaves no item behind when the trail cannot be saved', async () => {
    const before = (await request(app).get('/api/items')).body.length
    await post(alice, lostUmbrella({
      trail: [{ spotId: 999999, from: '2026-10-07T02:00:00Z', to: '2026-10-07T04:00:00Z' }],
    }))
    const after = (await request(app).get('/api/items')).body.length
    expect(after).toBe(before)
  })
})

describe('no hidden question (final proposal)', () => {
  it('posts a found item without a question, and ignores one if sent', async () => {
    const res = await post(ben, lostUmbrella({
      type: 'found', title: 'Grey wallet', category: 'Wallet',
      claimQuestion: 'What sticker is on it?', claimAnswer: 'Blue star',
      trail: [{ spotId: spotIds[1], from: '2026-10-08T04:00:00Z', to: '2026-10-08T04:00:00Z' }],
    }))
    expect(res.status).toBe(201)
    expect(res.body.item).not.toHaveProperty('claimQuestion')
    expect(res.body.item).not.toHaveProperty('claimAnswerHash')
    // The tests further down expect to find only the items they posted themselves
    await Item.remove(res.body.item.id)
  })
})

describe('read items', () => {
  let foundId

  beforeAll(async () => {
    const res = await post(ben, lostUmbrella({
      type: 'found', title: 'Brown leather wallet', category: 'Wallet', colour: 'Brown', brand: '',
      description: 'Found near the "Koufu" tables, has (two) cards',
      trail: [{ spotId: spotIds[2], from: '2026-10-08T04:00:00Z', to: '2026-10-08T04:30:00Z' }],
    }))
    foundId = res.body.item.id
  })

  it('returns one item, and 404 for an id that does not exist', async () => {
    expect((await request(app).get(`/api/items/${foundId}`)).body.title).toBe('Brown leather wallet')
    expect((await request(app).get('/api/items/999999')).status).toBe(404)
  })

  it('returns 400 for an id that is not a number', async () => {
    const res = await request(app).get('/api/items/abc')
    expect(res.status).toBe(400)
  })

  it('filters by type, category, poster and spot', async () => {
    const byType = await request(app).get('/api/items?type=found')
    expect(byType.body.map((i) => i.id)).toEqual([foundId])

    const byCategory = await request(app).get('/api/items?category=Umbrella')
    expect(byCategory.body.every((i) => i.category === 'Umbrella')).toBe(true)

    const byPoster = await request(app).get(`/api/items?postedBy=${ben.user.id}`)
      .set('Authorization', `Bearer ${ben.token}`)
    expect(byPoster.body.map((i) => i.id)).toEqual([foundId])

    // Every item with this spot on its trail (earlier tests posted two there)
    const bySpot = await request(app).get(`/api/items?spotId=${spotIds[0]}`)
    expect(bySpot.body.length).toBeGreaterThan(0)
    expect(bySpot.body.every((item) => item.trail.some((point) => point.spotId === spotIds[0]))).toBe(true)
    expect(bySpot.body.some((item) => item.trail.length === 2)).toBe(true)
  })

  it('filters by a time window', async () => {
    // Ben posted it, so he may see when it was found
    const res = await request(app)
      .get('/api/items?from=2026-10-08T00:00:00Z&to=2026-10-08T23:59:59Z')
      .set('Authorization', `Bearer ${ben.token}`)
    expect(res.body.map((i) => i.id)).toEqual([foundId])
  })

  it('searches title and description', async () => {
    const res = await request(app).get('/api/items?q=leather')
    expect(res.body.map((i) => i.id)).toEqual([foundId])
  })

  it('survives search text full of punctuation', async () => {
    const res = await request(app).get('/api/items').query({ q: 'a,b"c(d)%.e\\' })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('rejects an unknown filter value', async () => {
    expect((await request(app).get('/api/items?type=stolen')).status).toBe(400)
    expect((await request(app).get('/api/items?from=whenever')).status).toBe(400)
  })
})

describe('the feed view', () => {
  const made = []

  beforeAll(async () => {
    // [type, status] pairs; posted, then moved to the status directly
    for (const [type, status] of [
      ['found', 'open'], ['found', 'matched'], ['found', 'resolved'], ['found', 'archived'],
      ['lost', 'open'], ['lost', 'matched'], ['lost', 'resolved'], ['lost', 'archived'],
    ]) {
      const res = await post(type === 'found' ? ben : alice, lostUmbrella({
        type, title: `Feed ${type} ${status}`,
        trail: [{ spotId: spotIds[1], from: '2026-10-09T04:00:00Z', to: '2026-10-09T04:30:00Z' }],
      }))
      await Item.updateStatus(res.body.item.id, status)
      made.push(res.body.item.id)
    }
  })

  afterAll(async () => {
    for (const id of made) await Item.remove(id)
  })

  it('shows found items that are open, claimed or returned, and lost items only while open', async () => {
    const res = await request(app).get('/api/items').query({ view: 'feed', q: 'Feed' })
    expect(res.status).toBe(200)
    expect(res.body.map((i) => i.title).sort()).toEqual([
      'Feed found matched', 'Feed found open', 'Feed found resolved', 'Feed lost open',
    ])
  })

  it('combines with the other filters', async () => {
    const lost = await request(app).get('/api/items').query({ view: 'feed', q: 'Feed', type: 'lost' })
    expect(lost.body.map((i) => i.title)).toEqual(['Feed lost open'])
    const claimed = await request(app).get('/api/items').query({ view: 'feed', q: 'Feed', status: 'matched' })
    expect(claimed.body.map((i) => i.title)).toEqual(['Feed found matched'])
    const archived = await request(app).get('/api/items').query({ view: 'feed', q: 'Feed', status: 'archived' })
    expect(archived.body).toEqual([])
  })

  it('fills each page, since the filtering happens before limit and offset', async () => {
    const page = await request(app).get('/api/items').query({ view: 'feed', q: 'Feed', limit: 2, offset: 2 })
    expect(page.body).toHaveLength(2)
  })

  it('rejects an unknown view', async () => {
    expect((await request(app).get('/api/items?view=everything')).status).toBe(400)
  })
})

describe('trail times must be real', () => {
  const hoursFromNow = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

  it.each([
    ['in the future', hoursFromNow(1), hoursFromNow(2), 'A time cannot be in the future'],
    ['more than a year ago', '2020-01-01T00:00:00Z', '2020-01-01T01:00:00Z', 'A time cannot be more than a year ago'],
    ['a window longer than a week', hoursFromNow(-24 * 10), hoursFromNow(-1), 'A time window can be at most 7 days long'],
  ])('refuses a time %s', async (label, from, to, message) => {
    const res = await post(alice, lostUmbrella({ trail: [{ spotId: spotIds[0], from, to }] }))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(message)
  })

  it('allows a time a few minutes ahead, for a phone clock that runs fast', async () => {
    const res = await post(alice, lostUmbrella({ trail: [{ spotId: spotIds[0], from: hoursFromNow(-1), to: hoursFromNow(0.05) }] }))
    expect(res.status).toBe(201)
    await Item.remove(res.body.item.id)
  })
})

describe('limits and safety', () => {
  it('returns at most `limit` items, starting at `offset`', async () => {
    const all = (await request(app).get('/api/items')).body
    expect(all.length).toBeGreaterThanOrEqual(2)

    const firstOnly = await request(app).get('/api/items?limit=1')
    expect(firstOnly.body.map((i) => i.id)).toEqual([all[0].id])

    const secondOnly = await request(app).get('/api/items?limit=1&offset=1')
    expect(secondOnly.body.map((i) => i.id)).toEqual([all[1].id])
  })

  it.each(['0', '-5', 'abc', '501', '1.5'])('rejects limit=%s with 400', async (limit) => {
    expect((await request(app).get('/api/items').query({ limit })).status).toBe(400)
  })

  it('returns an empty list for an offset past the end', async () => {
    const res = await request(app).get('/api/items?offset=5000')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('rejects trail times and filters that have no timezone', async () => {
    const res = await post(alice, lostUmbrella({
      trail: [{ spotId: spotIds[0], from: '2026-10-07T10:00', to: '2026-10-07T12:00' }],
    }))
    expect(res.status).toBe(400)
    expect((await request(app).get('/api/items?from=2026-10-08')).status).toBe(400)
  })

  it('cannot be tricked into a different filter through the search text', async () => {
    const res = await request(app).get('/api/items').query({ q: 'zzzz,id.gt.0' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('rejects a negative or non-numeric offset', async () => {
    expect((await request(app).get('/api/items?offset=-1')).status).toBe(400)
    expect((await request(app).get('/api/items?offset=abc')).status).toBe(400)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.com/photo.jpg',
    'not a link',
    'https://evil.example/track.gif',
    'https://res.cloudinary.com.evil.com/demo/image/upload/x.jpg',
    'https://res.cloudinary.com/demo/raw/upload/x.pdf',
  ])('rejects the photo link %s', async (photoUrl) => {
    const res = await post(alice, lostUmbrella({ photoUrl }))
    expect(res.status).toBe(400)
  })

  it('accepts an https photo link and rejects a bad one on edit', async () => {
    const created = await post(alice, lostUmbrella({ photoUrl: 'https://res.cloudinary.com/demo/image/upload/umbrella.jpg' }))
    expect(created.status).toBe(201)
    expect(created.body.item.photoUrl).toBe('https://res.cloudinary.com/demo/image/upload/umbrella.jpg')

    const edited = await request(app).patch(`/api/items/${created.body.item.id}`)
      .set('Authorization', `Bearer ${alice.token}`).send({ photoUrl: 'javascript:alert(1)' })
    expect(edited.status).toBe(400)
  })

  it.each(['matched', 'open', 'archived'])('does not let the owner set status to %s directly', async (status) => {
    const created = await post(alice, lostUmbrella())
    const res = await request(app).patch(`/api/items/${created.body.item.id}`)
      .set('Authorization', `Bearer ${alice.token}`).send({ status })
    expect(res.status).toBe(400)
    expect((await request(app).get(`/api/items/${created.body.item.id}`)).body.status).toBe('open')
  })
})

describe('who may list by poster', () => {
  it('refuses ?postedBy for someone else, or with no login', async () => {
    const byAlice = await request(app).get(`/api/items?postedBy=${ben.user.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
    expect(byAlice.status).toBe(403)
    expect((await request(app).get(`/api/items?postedBy=${ben.user.id}`)).status).toBe(403)
  })
})

describe('the photo of a lost item is private', () => {
  const photo = 'https://res.cloudinary.com/demo/image/upload/private-umbrella.jpg'
  let itemId

  beforeAll(async () => {
    itemId = (await post(alice, lostUmbrella({ photoUrl: photo }))).body.item.id
  })

  afterAll(async () => {
    await Item.remove(itemId)
  })

  it('shows it to the owner only', async () => {
    const asOwner = await request(app).get(`/api/items/${itemId}`).set('Authorization', `Bearer ${alice.token}`)
    expect(asOwner.body.photoUrl).toBe(photo)

    const asBen = await request(app).get(`/api/items/${itemId}`).set('Authorization', `Bearer ${ben.token}`)
    expect(asBen.body.photoUrl).toBeNull()
    const asVisitor = await request(app).get(`/api/items/${itemId}`)
    expect(asVisitor.body.photoUrl).toBeNull()
  })

  it('leaves it out of the list and the record for everyone else', async () => {
    const list = await request(app).get('/api/items?type=lost')
    expect(list.body.find((item) => item.id === itemId).photoUrl).toBeNull()
    const record = await request(app).get(`/api/items/${itemId}/record`)
    expect(record.body.item.photoUrl).toBeNull()
  })
})

describe('where and when a find was handed in is private', () => {
  // Two days ago, so it is inside the feed's 30 days and this week, and far
  // from the umbrella report's days (D is 0), so the engine's own match on
  // the pair does not show the place
  const twoDaysAgo = Date.now() - 2 * 86400000
  const at = { from: new Date(twoDaysAgo).toISOString(), to: new Date(twoDaysAgo + 30 * 60000).toISOString() }
  // Carol's only report is the one matched here; Alice has other umbrella
  // reports from earlier tests, which the engine also matches with this find
  let findId, reportId, carol

  beforeAll(async () => {
    carol = await registerUser(app)
    findId = (await post(ben, lostUmbrella({
      type: 'found', title: 'Red Totes umbrella', colour: 'Red',
      trail: [{ spotId: spotIds[1], ...at }],
    }))).body.item.id
    reportId = (await post(carol, lostUmbrella({ title: 'My red umbrella', colour: 'Red' }))).body.item.id
  })

  afterAll(async () => {
    await Item.remove(findId)
    await Item.remove(reportId)
  })

  const get = (url, user) => {
    const req = request(app).get(url)
    return user ? req.set('Authorization', `Bearer ${user.token}`) : req
  }
  const hidden = { spotId: null, roomId: null, from: null, to: null }

  it('is left out for a visitor and for someone without a matching report', async () => {
    for (const user of [null, alice]) {
      const one = await get(`/api/items/${findId}`, user)
      expect(one.body.placeHidden).toBe(true)
      expect(one.body.trail).toEqual([hidden])
      const record = await get(`/api/items/${findId}/record`, user)
      expect(record.body.item.trail).toEqual([hidden])
      const list = await get('/api/items?type=found', user)
      expect(list.body.find((item) => item.id === findId).trail).toEqual([hidden])
    }
  })

  it('shows to the finder', async () => {
    const one = await get(`/api/items/${findId}`, ben)
    expect(one.body.placeHidden).toBeUndefined()
    expect(one.body.trail[0]).toMatchObject({ spotId: spotIds[1], ...at })
  })

  it('cannot be found out with the place or a short time window', async () => {
    const bySpot = await get(`/api/items?spotId=${spotIds[1]}`, alice)
    expect(bySpot.body.some((item) => item.id === findId)).toBe(false)
    const byTime = await get(`/api/items?from=${at.from}&to=${at.to}`, alice)
    expect(byTime.body.some((item) => item.id === findId)).toBe(false)
    const thisWeek = await get(`/api/items?from=${new Date(Date.now() - 7 * 86400000).toISOString()}`, alice)
    expect(thisWeek.body.some((item) => item.id === findId)).toBe(false)
  })

  it('still shows in the feed’s 30 days, without its place', async () => {
    const from = new Date(Date.now() - 30 * 86400000).toISOString()
    const feed = await get(`/api/items?view=feed&type=found&from=${from}`, alice)
    expect(feed.body.find((item) => item.id === findId).trail).toEqual([hidden])
  })

  it('stays hidden from a matched owner whose report named another place', async () => {
    const [match] = await Match.saveMany([{
      lostItemId: reportId, foundItemId: findId, score: 72,
      breakdown: { C: 100, A: 90, L: 30, D: 100 }, reasons: ['same category', 'nearby buildings: SOE and SCIS 1'],
    }])
    const one = await get(`/api/items/${findId}`, carol)
    expect(one.body.placeHidden).toBe(true)
    // Her report's matches leave out the hint at where it was found
    const mine = (await get(`/api/items/${reportId}/matches`, carol)).body.find((m) => m.id === match.id)
    expect(mine.reasons).toEqual(['same category'])
    expect(mine.breakdown).toMatchObject({ L: null, D: null })
    // The finder sees the match whole
    const theirs = (await get(`/api/items/${findId}/matches`, ben)).body.find((m) => m.id === match.id)
    expect(theirs.reasons).toContain('nearby buildings: SOE and SCIS 1')
    await Match.removeSuggested([match.id])
  })

  it('shows to a matched owner whose report named the building and time', async () => {
    const [match] = await Match.saveMany([{
      lostItemId: reportId, foundItemId: findId, score: 90,
      breakdown: { C: 100, A: 90, L: 60, D: 100 }, reasons: ['same category', 'same building: SCIS 1'],
    }])
    const one = await get(`/api/items/${findId}`, carol)
    expect(one.body.placeHidden).toBeUndefined()
    expect(one.body.trail[0]).toMatchObject({ spotId: spotIds[1], ...at })
    const bySpot = await get(`/api/items?spotId=${spotIds[1]}`, carol)
    expect(bySpot.body.some((item) => item.id === findId)).toBe(true)
    // Everyone else still does not see it
    expect((await get(`/api/items/${findId}`)).body.placeHidden).toBe(true)
    await Match.removeSuggested([match.id])
  })

  it('stays hidden once another report of the same person guessed wrong, even taken down', async () => {
    const guess = (await post(carol, lostUmbrella({ title: 'Red umbrella again', colour: 'Red' }))).body.item.id
    const saved = await Match.saveMany([
      { lostItemId: reportId, foundItemId: findId, score: 90, breakdown: { C: 100, A: 90, L: 60, D: 100 }, reasons: ['same category'] },
      { lostItemId: guess, foundItemId: findId, score: 70, breakdown: { C: 100, A: 90, L: 0, D: 100 }, reasons: ['same category'] },
    ])
    expect((await get(`/api/items/${findId}`, carol)).body.placeHidden).toBe(true)
    // Taking the wrong guess down does not allow another
    await request(app).delete(`/api/items/${guess}`).set('Authorization', `Bearer ${carol.token}`)
    expect((await get(`/api/items/${findId}`, carol)).body.placeHidden).toBe(true)
    await Match.removeSuggested(saved.map((match) => match.id))
    await Item.remove(guess)
  })
})

describe('a claimed report is frozen', () => {
  let itemId

  beforeAll(async () => {
    itemId = (await post(alice, lostUmbrella({ title: 'Claimed umbrella' }))).body.item.id
    await Item.updateStatus(itemId, 'matched')
  })

  afterAll(async () => {
    await Item.remove(itemId)
  })

  it.each([
    [{ status: 'resolved' }],
    [{ description: 'Changed after the claim' }],
    [{ photoUrl: 'https://res.cloudinary.com/demo/image/upload/other.jpg' }],
  ])('refuses %o with 409 while it is matched', async (body) => {
    const res = await request(app).patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${alice.token}`).send(body)
    expect(res.status).toBe(409)
    expect((await Item.findById(itemId)).status).toBe('matched')
  })

  it('refuses to delete it with 409', async () => {
    const res = await request(app).delete(`/api/items/${itemId}`).set('Authorization', `Bearer ${alice.token}`)
    expect(res.status).toBe(409)
    expect((await Item.findById(itemId)).status).toBe('matched')
  })
})

describe('edit and delete', () => {
  let itemId

  beforeAll(async () => {
    itemId = (await post(alice, lostUmbrella({ title: 'Blue umbrella' }))).body.item.id
  })

  it('lets only the owner edit', async () => {
    const byBen = await request(app).patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${ben.token}`).send({ title: 'Mine now' })
    expect(byBen.status).toBe(403)

    const byAlice = await request(app).patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${alice.token}`).send({ title: 'Navy umbrella', status: 'resolved' })
    expect(byAlice.status).toBe(200)
    expect(byAlice.body).toMatchObject({ title: 'Navy umbrella', status: 'resolved' })
  })

  it('rejects an edit that contains only fields that may not be changed', async () => {
    const res = await request(app).patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${alice.token}`).send({ postedBy: ben.user.id, type: 'found' })
    expect(res.status).toBe(400)
  })

  it('lets only the owner delete an open report, which is marked removed', async () => {
    const openId = (await post(alice, lostUmbrella({ title: 'Spare umbrella' }))).body.item.id
    const byBen = await request(app).delete(`/api/items/${openId}`)
      .set('Authorization', `Bearer ${ben.token}`)
    expect(byBen.status).toBe(403)

    const byAlice = await request(app).delete(`/api/items/${openId}`)
      .set('Authorization', `Bearer ${alice.token}`)
    expect(byAlice.status).toBe(200)
    expect((await request(app).get(`/api/items/${openId}`)).status).toBe(404)
    // Kept for the admins, with its reports and timeline
    expect((await Item.findById(openId)).status).toBe('removed')
    await Item.remove(openId)
  })

  it('refuses to delete a report that is already resolved', async () => {
    const res = await request(app).delete(`/api/items/${itemId}`).set('Authorization', `Bearer ${alice.token}`)
    expect(res.status).toBe(409)
  })
})
