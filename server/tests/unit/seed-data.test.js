import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loadSeed, resolveTime } = require('../../data/load')
const rawPairs = require('../../data/seed-pairs.json')

const NOW = new Date('2026-10-09T06:00:00Z') // 14:00 Singapore time
const seed = loadSeed(NOW)
const itemsById = new Map(seed.items.map((item) => [item.id, item]))
const spotIds = new Set(seed.spots.map((spot) => spot.id))
const categoryNames = new Set(seed.categories.map((category) => category.name))
const colourNames = new Set(seed.colours.map((colour) => colour.name))
const relatedOf = new Map(seed.categories.map((category) => [category.name, category.related]))
const DAY = 24 * 60 * 60 * 1000

describe('resolveTime', () => {
  it('counts back whole Singapore days and applies the time of day', () => {
    // 14:00 SGT on 9 Oct; two days ago at 10:00 SGT is 02:00 UTC on 7 Oct
    expect(resolveTime(NOW, 2, '10:00').toISOString()).toBe('2026-10-07T02:00:00.000Z')
  })

  it('uses the Singapore date just after midnight', () => {
    // 00:30 SGT on 9 Oct is 16:30 UTC on 8 Oct
    const justAfterMidnight = new Date('2026-10-08T16:30:00Z')
    expect(resolveTime(justAfterMidnight, 1, '09:00').toISOString()).toBe('2026-10-08T01:00:00.000Z')
  })
})

describe('reference data', () => {
  it('has 16 categories (15 and Other) whose related names all exist', () => {
    expect(seed.categories).toHaveLength(16)
    for (const category of seed.categories) {
      for (const name of category.related) expect(categoryNames.has(name)).toBe(true)
    }
  })

  it('has 260 unique spots with ids in file order and a collection point in every building with a Level 1', () => {
    expect(seed.spots).toHaveLength(260)
    expect(seed.spots.map((spot) => spot.id)).toEqual(seed.spots.map((spot, index) => index + 1))
    const names = seed.spots.map((spot) => `${spot.building}|${spot.floor}|${spot.area}`)
    expect(new Set(names).size).toBe(260)
    // Every Level 1 security counter takes found items (SMU's lost and found rule)
    const withLevel1 = new Set(seed.spots.filter((spot) => spot.floor === 'Level 1').map((spot) => spot.building))
    const withPoint = new Set(seed.spots.filter((spot) => spot.isCollectionPoint).map((spot) => spot.building))
    expect(withPoint).toEqual(withLevel1)
  })

  it('gives every building with levels a full set of toilets and lifts on each one', () => {
    const levels = new Map()
    for (const spot of seed.spots) {
      if (spot.building === 'Concourse' || spot.building === 'Campus Green') continue
      if (spot.building === 'Administration Building') continue
      const name = `${spot.building}|${spot.floor}`
      if (!levels.has(name)) levels.set(name, new Set())
      levels.get(name).add(spot.area)
    }
    for (const [name, areas] of levels) {
      expect(areas.has('toilets'), name).toBe(true)
      expect(areas.has('lifts, stairs & corridors'), name).toBe(true)
    }
  })

  // The levels SMU's facility booking system lists for each building (October 2026).
  // Li Ka Shing Library also has its Level 1 entrance, which has nothing to book.
  it('lists the levels of each building as the SMU booking system does', () => {
    const levelsOf = (building) => [...new Set(seed.spots.filter((spot) => spot.building === building).map((spot) => spot.floor))]
    const levels = (...codes) => codes.map((code) => (code[0] === 'B' ? `Basement ${code.slice(1)}` : `Level ${code.slice(1)}`))
    expect(levelsOf('SOE/SCIS 2')).toEqual(levels('B1', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'))
    expect(levelsOf('SCIS 1')).toEqual(levels('B1', 'L1', 'L2', 'L3', 'L4', 'L5'))
    expect(levelsOf('LKCSB')).toEqual(levels('B1', 'L1', 'L2', 'L3', 'L4', 'L5'))
    expect(levelsOf('Li Ka Shing Library')).toEqual(levels('B1', 'L1', 'L2', 'L3', 'L4', 'L5'))
    expect(levelsOf('SOSS/CIS')).toEqual(levels('B1', 'B2', 'L1', 'L2', 'L3', 'L4', 'L5'))
    expect(levelsOf('YPHSL')).toEqual(levels('B1', 'B2', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'))
    expect(levelsOf('SMU Connexion')).toEqual(levels('L1', 'L2', 'L3', 'L4', 'L5'))
  })

  // The rooms each building has in the booking system (26 October 2026); a
  // room-type area is only offered where the booking system has such a room
  it('offers only the room types each building has in the booking system', () => {
    const roomTypes = ['classrooms', 'group study rooms', 'seminar rooms', 'meeting pods', 'project rooms', 'phone booths', 'study booths', 'chatterboxes']
    const typesIn = (building) => new Set(seed.spots.filter((spot) => spot.building === building && roomTypes.includes(spot.area)).map((spot) => spot.area))
    expect(typesIn('SOSS/CIS')).toEqual(new Set(['classrooms', 'seminar rooms', 'meeting pods']))
    expect(typesIn('SMU Connexion')).toEqual(new Set(['chatterboxes', 'classrooms', 'meeting pods', 'study booths']))
    expect(typesIn('Li Ka Shing Library')).toEqual(new Set(['phone booths', 'project rooms', 'study booths']))
    expect(typesIn('YPHSL')).toEqual(new Set(['classrooms', 'group study rooms', 'meeting pods', 'project rooms', 'seminar rooms']))
    for (const building of ['SOE/SCIS 2', 'SCIS 1', 'SOA', 'LKCSB']) {
      expect(typesIn(building), building).toEqual(new Set(['classrooms', 'group study rooms', 'meeting pods', 'seminar rooms']))
    }
    for (const spot of seed.spots.filter((entry) => roomTypes.includes(entry.area))) {
      expect(spot.rooms.length, `${spot.building} ${spot.floor} ${spot.area}`).toBeGreaterThan(0)
    }
  })

  it('has the 392 bookable rooms, each named once and in a spot', () => {
    expect(seed.rooms).toHaveLength(392)
    expect(seed.rooms.map((room) => room.id)).toEqual(seed.rooms.map((room, index) => index + 1))
    expect(new Set(seed.rooms.map((room) => room.name)).size).toBe(392)
    for (const room of seed.rooms) expect(spotIds.has(room.spotId), room.name).toBe(true)
    // Each spot lists its own rooms, as GET /api/spots does
    const listed = seed.spots.flatMap((spot) => spot.rooms.map((room) => ({ ...room, spotId: spot.id })))
    expect(listed).toEqual(seed.rooms.map(({ id, spotId, name }) => ({ id, name, spotId })))
  })

  it('puts each room in its own building, on the level its number says', () => {
    const PREFIXES = {
      LKCSB: ['LKCSB'], 'Li Ka Shing Library': ['LKSLIB'], SOA: ['SOA'], 'SCIS 1': ['SCIS1'],
      'SOE/SCIS 2': ['SOE/SCIS2'], 'SOSS/CIS': ['SOSS/CIS'], 'SMU Connexion': ['SMUC'],
      YPHSL: ['YPHSL', 'KGC'], 'Administration Building': ['Admin'],
    }
    const spotsById = new Map(seed.spots.map((spot) => [spot.id, spot]))
    for (const room of seed.rooms) {
      const spot = spotsById.get(room.spotId)
      expect(PREFIXES[spot.building].some((prefix) => room.name.startsWith(prefix)), room.name).toBe(true)
      // "3-2" and "2.1" are on Level 3 and Level 2, "B1-09" on Basement 1, "KGC-4.02-PR" on Level 4
      const number = room.name.match(/(?:^KGC-(\d+)\.|\s(B?\d+)[-.]\d+$)/)
      if (!number) continue
      const code = number[1] || number[2]
      const level = code.startsWith('B') ? `Basement ${code.slice(1)}` : `Level ${Number(code)}`
      expect(spot.floor, room.name).toBe(level)
    }
  })

  it('gives every spot coordinates near the SMU campus and links to real buildings', () => {
    const buildings = new Set(seed.spots.map((spot) => spot.building))
    for (const spot of seed.spots) {
      expect(spot.coordinates.lat).toBeGreaterThan(1.29)
      expect(spot.coordinates.lat).toBeLessThan(1.30)
      expect(spot.coordinates.lng).toBeGreaterThan(103.84)
      expect(spot.coordinates.lng).toBeLessThan(103.86)
      for (const linked of spot.linkedBuildings) expect(buildings.has(linked)).toBe(true)
    }
  })

  it('gives every item 0 to 3 colours from the list, main colour first', () => {
    for (const item of seed.items) {
      expect(item.colours.length).toBeLessThanOrEqual(3)
      for (const colour of item.colours) expect(colourNames.has(colour)).toBe(true)
      expect(item.colour).toBe(item.colours[0] || null)
    }
  })

  it('has unique colours with valid hex codes and related names that exist', () => {
    expect(colourNames.size).toBe(seed.colours.length)
    for (const colour of seed.colours) {
      if (colour.hex !== null) expect(colour.hex).toMatch(/^#[0-9a-f]{6}$/)
      for (const name of colour.related) {
        expect(colourNames.has(name)).toBe(true)
        // Related works both ways, so scoring is the same from either side
        expect(seed.colours.find((other) => other.name === name).related).toContain(colour.name)
      }
    }
  })

  it('has demo users with SMU emails, alerts off and usable passwords', () => {
    expect(seed.users.length).toBeGreaterThanOrEqual(3)
    for (const user of seed.users) {
      expect(user.email).toMatch(/smu\.edu\.sg$/)
      expect(user.alertsOn).toBe(false)
      expect(user.password.length).toBeGreaterThanOrEqual(8)
      expect(['user', 'admin']).toContain(user.role)
    }
  })

  it('has exactly one admin, after the three item owners', () => {
    const admins = seed.users.filter((user) => user.role === 'admin')
    expect(admins).toHaveLength(1)
    expect(seed.users.slice(0, 3).every((user) => user.role === 'user')).toBe(true)
  })

  it('gives every user row the same keys, so a bulk insert saves no NULLs', () => {
    const keys = Object.keys(seed.users[0]).sort()
    for (const user of seed.users) expect(Object.keys(user).sort()).toEqual(keys)
  })
})

describe('pairs', () => {
  it('has 40 pairs with ids 1 to 40 and predictable item ids', () => {
    expect(seed.pairs).toHaveLength(40)
    seed.pairs.forEach((pair, index) => {
      expect(pair.pairId).toBe(index + 1)
      expect(pair.lostItemId).toBe(2 * pair.pairId - 1)
      expect(pair.foundItemId).toBe(2 * pair.pairId)
      expect(itemsById.get(pair.lostItemId).type).toBe('lost')
      expect(itemsById.get(pair.foundItemId).type).toBe('found')
      expect(pair.note.length).toBeGreaterThan(0)
    })
  })

  it('matches the planned spread of categories', () => {
    const counts = {}
    for (const pair of seed.pairs) {
      const category = itemsById.get(pair.lostItemId).category
      counts[category] = (counts[category] || 0) + 1
    }
    expect(counts).toEqual({
      Umbrella: 5, 'Water Bottle': 5, Earbuds: 4, Charger: 4, Wallet: 3, Cardholder: 3,
      'Student Card': 3, Headphones: 2, Laptop: 2, Phone: 2, Keys: 2, Bag: 2,
      Tablet: 1, Clothing: 1, Stationery: 1,
    })
  })

  it('has at least 4 related-category pairs and no unrelated mismatches', () => {
    let related = 0
    for (const pair of seed.pairs) {
      const lost = itemsById.get(pair.lostItemId)
      const found = itemsById.get(pair.foundItemId)
      // A finder who can't tell what something is files it as Other (pair 18)
      if (found.category === 'Other') continue
      if (lost.category !== found.category) {
        expect(relatedOf.get(lost.category)).toContain(found.category)
        related += 1
      }
    }
    expect(related).toBeGreaterThanOrEqual(4)
  })

  it('has a found item filed as Other, whose owner named the category', () => {
    const others = seed.pairs.filter((pair) => itemsById.get(pair.foundItemId).category === 'Other')
    expect(others.map((pair) => pair.pairId)).toEqual([18])
    expect(itemsById.get(others[0].lostItemId).category).toBe('Charger')
  })

  it('has at least 4 lost items with a trail of three places', () => {
    const long = seed.pairs.filter((pair) => itemsById.get(pair.lostItemId).trail.length >= 3)
    expect(long.length).toBeGreaterThanOrEqual(4)
  })

  it('keeps each pair within 5 days of each other', () => {
    for (const pair of seed.pairs) {
      const lost = new Date(itemsById.get(pair.lostItemId).trail[0].from)
      const found = new Date(itemsById.get(pair.foundItemId).trail[0].from)
      expect(Math.abs(found - lost)).toBeLessThanOrEqual(5 * DAY)
    }
  })

  it('never has an item found before its owner first had it that day', () => {
    for (const pair of seed.pairs) {
      const lostStart = new Date(itemsById.get(pair.lostItemId).trail[0].from)
      const foundAt = new Date(itemsById.get(pair.foundItemId).trail[0].from)
      expect(foundAt >= lostStart, `pair ${pair.pairId}`).toBe(true)
    }
  })

  it('uses daysAgo between 1 and 12 for every pair', () => {
    for (const pair of rawPairs.pairs) {
      for (const side of [pair.lost, pair.found]) {
        expect(side.daysAgo).toBeGreaterThanOrEqual(1)
        expect(side.daysAgo).toBeLessThanOrEqual(12)
      }
    }
  })
})

describe('every item', () => {
  it('has valid fields, a known category, known spots and ordered times in the past', () => {
    expect(seed.items.map((item) => item.id)).toEqual(seed.items.map((item, index) => index + 1))
    for (const item of seed.items) {
      expect(['lost', 'found']).toContain(item.type)
      expect(item.title.trim().length).toBeGreaterThan(0)
      expect(item.description.trim().length).toBeGreaterThan(0)
      expect(categoryNames.has(item.category)).toBe(true)
      if (item.colour !== null) expect(colourNames.has(item.colour), item.title).toBe(true)
      expect(item.status).toBe('open')
      expect(seed.users.some((user) => user.id === item.postedBy)).toBe(true)
      expect(item.trail.length).toBeGreaterThanOrEqual(1)
      if (item.type === 'found') expect(item.trail).toHaveLength(1)
      for (const point of item.trail) {
        expect(spotIds.has(point.spotId)).toBe(true)
        expect(new Date(point.from) <= new Date(point.to)).toBe(true)
        expect(new Date(point.to) < NOW).toBe(true)
      }
      expect(new Date(item.createdAt) < NOW).toBe(true)
    }
  })
})

describe('decoys', () => {
  const decoys = seed.decoyItemIds.map((id) => itemsById.get(id))

  it('has 12 decoys that follow the pairs', () => {
    expect(decoys).toHaveLength(12)
    expect(Math.min(...seed.decoyItemIds)).toBe(81)
  })

  it('includes the planned look-alikes', () => {
    const count = (test) => decoys.filter(test).length
    expect(count((d) => d.category === 'Umbrella' && d.colour === 'Black')).toBe(4)
    expect(count((d) => d.category === 'Earbuds' && d.colour === 'White')).toBe(2)
    expect(count((d) => d.category === 'Charger' && d.colour === 'Black')).toBe(2)
    expect(count((d) => d.category === 'Water Bottle' && d.colour === 'Blue')).toBe(2)
  })

  it('includes exactly 2 stale items older than 30 days', () => {
    const stale = seed.items.filter((item) => NOW - new Date(item.createdAt) > 30 * DAY)
    expect(stale).toHaveLength(2)
    for (const item of stale) expect(seed.decoyItemIds).toContain(item.id)
  })
})
