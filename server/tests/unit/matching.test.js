import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const {
  findMatches, rankAll, trailCredit, WEIGHTS, PROPOSAL_WEIGHTS, FULL_CREDIT_BUILDINGS,
} = require('../../matching')
const { canMatch, categoryScore } = require('../../matching/category')
const { attributeScore, brandScore } = require('../../matching/attributes')
const { locationScore } = require('../../matching/location')
const { dateScore, foundBeforeLost } = require('../../matching/dates')
const { evaluateWide, widenTrail } = require('../../matching/tune')
const { words, mentions } = require('../../matching/text')
const { loadSeed } = require('../../data/load')
const campusSpots = require('../../data/campus-spots.json')

const seed = loadSeed()
const context = { spots: seed.spots, categories: seed.categories, colours: seed.colours }
const itemsById = new Map(seed.items.map((item) => [item.id, item]))
const lostItems = seed.items.filter((item) => item.type === 'lost')
const foundItems = seed.items.filter((item) => item.type === 'found')

// Spot ids follow the order of campus-spots.json
function spot(key) {
  return seed.spots[campusSpots.spots.findIndex((s) => s.key === key)]
}

// A place for locationScore: the spot, and the room in it when one is given
function at(key, roomId = null) {
  const found = spot(key)
  return { spot: found, room: roomId ? found.rooms.find((room) => room.id === roomId) : null }
}

function point(from, to) {
  return { spotId: 1, from, to }
}

describe('categoryScore', () => {
  it('scores the same category 100', () => {
    expect(categoryScore('Umbrella', 'Umbrella', seed.categories)).toEqual({
      score: 100, reasons: [{ lead: 'same category', detail: '' }],
    })
  })

  it('scores a related category 50 from either side', () => {
    expect(categoryScore('Wallet', 'Cardholder', seed.categories).score).toBe(50)
    // Two "Other" items share a category that says little: no "same category"
    // reason, and index.js gives the category less weight (weightsFor)
    expect(categoryScore('Other', 'Other', seed.categories)).toEqual({ score: 100, reasons: [] })
    expect(categoryScore('Cardholder', 'Wallet', seed.categories).score).toBe(50)
  })

  it('scores an unrelated or missing category 0', () => {
    expect(categoryScore('Umbrella', 'Laptop', seed.categories).score).toBe(0)
    expect(categoryScore(null, 'Laptop', seed.categories).score).toBe(0)
  })
})

describe('locationScore', () => {
  it('scores the same spot 100', () => {
    expect(locationScore(at('SCIS1-L2-LIFT'), at('SCIS1-L2-LIFT')).score).toBe(100)
  })

  it('scores the same room 100 and names it', () => {
    expect(locationScore(at('SOE-B1-SR', 1), at('SOE-B1-SR', 1))).toEqual({
      score: 100,
      reasons: [{ lead: 'same room', detail: 'SOE/SCIS2 Seminar Room B1-1' }],
    })
  })

  it('scores two different rooms of the same kind on one level below the same room', () => {
    const result = locationScore(at('SOE-B1-SR', 1), at('SOE-B1-SR', 2))
    expect(result.score).toBe(85)
    expect(result.reasons[0].lead).toBe('same area')
  })

  it('scores a spot with rooms 90 when one report did not name its room', () => {
    expect(locationScore(at('SOE-B1-SR', 1), at('SOE-B1-SR')).score).toBe(90)
    expect(locationScore(at('SOE-B1-SR'), at('SOE-B1-SR')).score).toBe(90)
  })

  it('keeps 100 for the same spot when the spot has no rooms', () => {
    expect(locationScore(at('SOE-B1-GYM'), at('SOE-B1-GYM')).score).toBe(100)
  })

  it('scores every room level in the engine through the trail’s roomId', () => {
    const lost = { ...lostItems[0], trail: [{ ...lostItems[0].trail[0], spotId: spot('SOE-B1-SR').id, roomId: 1 }] }
    const found = { ...foundItems[0], trail: [{ ...lostItems[0].trail[0], spotId: spot('SOE-B1-SR').id, roomId: 1 }] }
    const otherRoom = { ...found, trail: [{ ...found.trail[0], roomId: 2 }] }
    const [same] = rankAll(lost, [found], context)
    const [different] = rankAll(lost, [otherRoom], context)
    expect(same.breakdown.L).toBe(100)
    expect(different.breakdown.L).toBe(85)
    expect(same.reasons).toContain('same room: SOE/SCIS2 Seminar Room B1-1')
  })

  it('scores the same floor of a building 80', () => {
    expect(locationScore(at('SCIS1-L2-LIFT'), at('SCIS1-L2-SR')).score).toBe(80)
  })

  it('scores another floor of the same building 60', () => {
    expect(locationScore(at('SCIS1-L3-SR'), at('SCIS1-L1-LOBBY')).score).toBe(60)
  })

  it('scores a linked building 30 from either side', () => {
    expect(locationScore(at('LKS-L1-ENTRANCE'), at('GREEN-BENCHES')).score).toBe(30)
    expect(locationScore(at('GREEN-BENCHES'), at('LKS-L1-ENTRANCE')).score).toBe(30)
  })

  it('scores an unlinked building or an unknown spot 0', () => {
    expect(locationScore(at('SOSS-L1-LOBBY'), at('LKS-L1-ENTRANCE')).score).toBe(0)
    expect(locationScore(undefined, at('LKS-L1-ENTRANCE')).score).toBe(0)
  })
})

describe('dateScore', () => {
  it('scores overlapping time windows 100', () => {
    const result = dateScore(
      point('2026-10-01T02:00:00Z', '2026-10-01T04:00:00Z'),
      point('2026-10-01T03:00:00Z', '2026-10-01T03:30:00Z'),
    )
    expect(result.score).toBe(100)
    expect(result.reasons).toEqual([{ lead: 'within a day', detail: '' }])
  })

  it('falls in a straight line to 50 at 7 days apart', () => {
    const result = dateScore(
      point('2026-10-01T00:00:00Z', '2026-10-01T01:00:00Z'),
      point('2026-10-08T01:00:00Z', '2026-10-08T02:00:00Z'),
    )
    expect(result.score).toBeCloseTo(50)
    expect(result.reasons).toEqual([{ lead: '7 days apart', detail: '' }])
  })

  it('scores 14 or more days apart 0, whichever came first', () => {
    const early = point('2026-10-01T00:00:00Z', '2026-10-01T01:00:00Z')
    const late = point('2026-10-20T00:00:00Z', '2026-10-20T01:00:00Z')
    expect(dateScore(early, late).score).toBe(0)
    expect(dateScore(late, early).score).toBe(0)
    expect(dateScore(early, late).reasons).toEqual([])
  })
})

describe('text helpers', () => {
  it('drops common words, joins hyphens and cuts plurals', () => {
    expect(words('Found my EZ-Link cards near the lifts')).toEqual(['ezlink', 'card', 'lift'])
  })

  it('does not cut the s off words ending in ss or short words', () => {
    expect(words('glass gas case')).toEqual(['glass', 'gas', 'case'])
  })

  it('finds a brand of several words in a description', () => {
    expect(mentions('Large black Hydro Flask, dented', 'Hydro Flask')).toBe(true)
    expect(mentions('Large black flask', 'Hydro Flask')).toBe(false)
  })
})

describe('brandScore', () => {
  it('scores the same brand 100 and a different brand 0, ignoring case', () => {
    expect(brandScore({ brand: 'MUJI' }, { brand: 'Muji' }).score).toBe(100)
    expect(brandScore({ brand: 'Sony' }, { brand: 'Apple' }).score).toBe(0)
  })

  it('counts a brand the other report only mentions in its text', () => {
    const lost = { brand: 'Totes', title: 'Black umbrella', description: '' }
    const found = { brand: null, title: 'Umbrella', description: 'Totes umbrella with a wooden handle' }
    expect(brandScore(lost, found)).toEqual({
      score: 100,
      reasons: [{ lead: 'both mention', detail: 'Totes' }],
    })
  })

  it('leaves the brand out when only one report knows it', () => {
    const lost = { brand: 'Bellroy', title: 'Wallet', description: 'Slim wallet' }
    const found = { brand: '', title: 'Card wallet', description: 'Small leather cardholder' }
    expect(brandScore(lost, found).score).toBeNull()
  })
})

describe('attributeScore', () => {
  it('does not punish a report with no colour or brand', () => {
    const a = { title: 'Keys with Totoro keychain', description: '', category: 'Keys', colour: null, brand: null }
    const b = { title: 'Keys on Totoro keychain', description: '', category: 'Keys', colour: null, brand: null }
    const result = attributeScore(a, b, seed.colours)
    expect(result.parts).toMatchObject({ colour: null, brand: null })
    expect(result.score).toBeGreaterThan(0)
    expect(result.reasons).toContainEqual({ lead: 'both mention', detail: 'totoro, keychain' })
  })

  it('gives partial credit for a related colour', () => {
    const a = { title: 'Bottle', description: '', colour: 'Navy', brand: null }
    const b = { title: 'Bottle', description: '', colour: 'Blue', brand: null }
    const result = attributeScore(a, b, seed.colours)
    expect(result.parts.colour).toBe(50)
    expect(result.reasons).toContainEqual({ lead: 'similar colour', detail: 'Navy and Blue' })
  })
})

describe('findMatches', () => {
  const pair1 = seed.pairs[0]
  const found1 = itemsById.get(pair1.foundItemId)

  it('returns the true match first, in the agreed shape', () => {
    const results = findMatches(found1, lostItems, context)
    expect(results[0]).toEqual({
      candidateId: pair1.lostItemId,
      score: expect.any(Number),
      breakdown: { C: 100, A: expect.any(Number), L: 100, D: expect.any(Number) },
      reasons: expect.arrayContaining(['same category', 'same colour', 'same brand: Totes']),
    })
  })

  it('returns at most 5 results, all 50 or more, best first', () => {
    for (const item of seed.items) {
      const pool = item.type === 'lost' ? foundItems : lostItems
      const results = findMatches(item, pool, context)
      expect(results.length).toBeLessThanOrEqual(5)
      expect(results.every((r) => r.score >= 50 && r.score <= 100)).toBe(true)
      expect(results.map((r) => r.score)).toEqual([...results.map((r) => r.score)].sort((a, b) => b - a))
    }
  })

  it('scores the total as the weighted sum of the breakdown', () => {
    const [top] = findMatches(found1, lostItems, context)
    const { C, A, L, D } = top.breakdown
    expect(top.score).toBeCloseTo(WEIGHTS.C * C + WEIGHTS.A * A + WEIGHTS.L * L + WEIGHTS.D * D, 0)
  })

  it('uses the best stop on a lost trail', () => {
    // Pair 3: the owner visited three places and the item was found at the second
    const pair3 = seed.pairs[2]
    const lost3 = itemsById.get(pair3.lostItemId)
    const [top] = findMatches(lost3, foundItems, context)
    expect(top.candidateId).toBe(pair3.foundItemId)
    expect(top.breakdown.L).toBe(100)
    expect(top.reasons.some((reason) => reason.includes('stop 2 of 3 on your trail'))).toBe(true)
  })

  it('never matches your own reports', () => {
    const mine = lostItems.map((item) => ({ ...item, postedBy: found1.postedBy }))
    expect(findMatches(found1, mine, context)).toEqual([])
  })

  it('returns an empty array when there is nothing to compare', () => {
    expect(findMatches(found1, [], context)).toEqual([])
  })

  it('does not change the items or the reference lists it is given', () => {
    const before = JSON.stringify({ found1, lostItems, context })
    findMatches(found1, lostItems, context)
    expect(JSON.stringify({ found1, lostItems, context })).toBe(before)
  })
})

describe('seeded pairs', () => {
  it.each(seed.pairs.map((pair) => [pair.pairId, pair]))(
    'pair %i ranks its true match in the top 3 both ways',
    (pairId, pair) => {
      const fromFound = rankAll(itemsById.get(pair.foundItemId), lostItems, context)
      const fromLost = rankAll(itemsById.get(pair.lostItemId), foundItems, context)
      expect(fromFound.slice(0, 3).map((r) => r.candidateId)).toContain(pair.lostItemId)
      expect(fromLost.slice(0, 3).map((r) => r.candidateId)).toContain(pair.foundItemId)
    },
  )
})

// Why the weights are not the proposal's: both mixes find the true match, but the tuned one shows
// far fewer wrong matches. If this fails after a change to a signal, run `node matching/tune.js
// --compare` and update the numbers in the README.
describe('the weights in use', () => {
  function measure(weights) {
    const withWeights = { ...context, weights }
    let wrongShown = 0
    let trueShown = 0
    for (const pair of seed.pairs) {
      const queries = [
        [itemsById.get(pair.foundItemId), lostItems, pair.lostItemId],
        [itemsById.get(pair.lostItemId), foundItems, pair.foundItemId],
      ]
      for (const [posted, pool, partner] of queries) {
        const shown = findMatches(posted, pool, withWeights)
        if (shown.some((r) => r.candidateId === partner)) trueShown += 1
        wrongShown += shown.filter((r) => r.candidateId !== partner).length
      }
    }
    let decoyShown = 0
    for (const decoyId of seed.decoyItemIds) {
      const decoy = itemsById.get(decoyId)
      decoyShown += findMatches(decoy, decoy.type === 'lost' ? foundItems : lostItems, withWeights).length
    }
    return { wrongShown, trueShown, decoyShown }
  }

  it('add up to 1 so a score stays between 0 and 100', () => {
    for (const weights of [WEIGHTS, PROPOSAL_WEIGHTS]) {
      expect(weights.C + weights.A + weights.L + weights.D).toBeCloseTo(1, 10)
    }
  })

  it('show every true match with far fewer wrong matches than the proposal weights', () => {
    const tuned = measure(WEIGHTS)
    const proposal = measure(PROPOSAL_WEIGHTS)
    expect(tuned.trueShown).toBe(seed.pairs.length * 2)
    expect(tuned.wrongShown).toBeLessThan(proposal.wrongShown / 2)
    expect(tuned.decoyShown).toBeLessThan(proposal.decoyShown / 2)
  })
})

// Shift a trail point by a number of hours (negative = earlier)
function moved(point, hours) {
  const shift = (time) => new Date(new Date(time).getTime() + hours * 60 * 60 * 1000).toISOString()
  return { ...point, from: shift(point.from), to: shift(point.to) }
}

describe('found before lost', () => {
  const pair1 = seed.pairs[0]
  const lost1 = itemsById.get(pair1.lostItemId)
  const found1 = itemsById.get(pair1.foundItemId)

  it('is true only when the item was found more than an hour before the owner was there', () => {
    const lostPoint = { from: '2026-10-18T10:00:00+08:00', to: '2026-10-18T12:00:00+08:00' }
    expect(foundBeforeLost(lostPoint, { from: '2026-10-17T09:00:00+08:00', to: '2026-10-17T09:30:00+08:00' })).toBe(true)
    expect(foundBeforeLost(lostPoint, { from: '2026-10-18T08:00:00+08:00', to: '2026-10-18T08:59:00+08:00' })).toBe(true)
    expect(foundBeforeLost(lostPoint, { from: '2026-10-18T08:30:00+08:00', to: '2026-10-18T09:30:00+08:00' })).toBe(false)
    expect(foundBeforeLost(lostPoint, { from: '2026-10-19T09:00:00+08:00', to: '2026-10-19T09:30:00+08:00' })).toBe(false)
  })

  it('never matches an item handed in the day before it was lost, in either direction', () => {
    const early = { ...found1, id: 999, trail: [moved(lost1.trail[0], -24)] }
    expect(rankAll(lost1, [early], context)).toEqual([])
    expect(rankAll(early, [lost1], context)).toEqual([])
  })

  it('skips only the trail stops the item was found before', () => {
    // Stop 1 is the real place but after the item was found; stop 2 is earlier, in another building
    const elsewhere = seed.spots.find((s) => s.building !== spotOf(found1).building)
    const trail = [moved(found1.trail[0], 24), { ...moved(found1.trail[0], -3), spotId: elsewhere.id }]
    const ranked = rankAll({ ...lost1, trail }, [found1], context)
    expect(ranked).toHaveLength(1)
    // Without the rule, stop 1 would give the same place (100)
    expect(ranked[0].breakdown.L).toBeLessThan(100)
  })

  it('leaves the seeded true pairs alone, since none of them is found before lost', () => {
    for (const pair of seed.pairs) {
      const lost = itemsById.get(pair.lostItemId)
      const found = itemsById.get(pair.foundItemId)
      expect(lost.trail.some((point) => !foundBeforeLost(point, found.trail[0]))).toBe(true)
    }
  })
})

function spotOf(item) {
  return seed.spots.find((s) => s.id === item.trail[0].spotId)
}

describe('wide trails', () => {
  const spotsById = new Map(seed.spots.map((s) => [s.id, s]))
  const pair1 = seed.pairs[0]
  const lost1 = itemsById.get(pair1.lostItemId)
  const found1 = itemsById.get(pair1.foundItemId)

  it('gives full credit up to 3 buildings, then 3 / buildings', () => {
    expect(trailCredit(lost1, spotsById).credit).toBe(1)
    expect(trailCredit(widenTrail(lost1, 3), spotsById).credit).toBe(1)
    expect(trailCredit(widenTrail(lost1, 6), spotsById)).toEqual({ credit: 0.5, buildings: 6 })
    expect(trailCredit(widenTrail(lost1, 10), spotsById)).toEqual({ credit: 0.3, buildings: 10 })
  })

  it('counts buildings, not stops, so several stops in one building keep full credit', () => {
    const sameBuilding = seed.spots.filter((s) => s.building === spotOf(lost1).building)
    const trail = sameBuilding.slice(0, 3).map((s) => ({ ...lost1.trail[0], spotId: s.id }))
    expect(trailCredit({ ...lost1, trail }, spotsById).credit).toBe(1)
  })

  it('scales place and time down and says why', () => {
    const [top] = rankAll(widenTrail(lost1, 10), [found1], context)
    expect(top.breakdown.L).toBe(30)
    expect(top.reasons).toContain('trail covers 10 buildings: place and time count for less')
  })

  it("ranks the owner's umbrella above a stranger's found exactly at one of 10 trail stops", () => {
    // A vague owner lists 10 buildings. Their umbrella was handed in a day later on another
    // floor of a trail building; a stranger's plain umbrella was found right at stop 7.
    // Without the discount the stranger's ranked first, 68.6 to 67.3.
    const owner = { ...widenTrail(lost1, 10), brand: null, description: 'Black umbrella, lost it somewhere today' }
    const home = spotOf(found1)
    const otherFloor = seed.spots.find((s) => s.building === home.building && s.floor !== home.floor)
    const real = { ...found1, trail: [{ ...moved(found1.trail[0], 24), spotId: otherFloor.id }] }
    const stranger = {
      id: 950, type: 'found', title: 'Black umbrella', description: 'Folding umbrella found on a chair',
      category: 'Umbrella', colour: 'Black', brand: null, postedBy: 77, trail: [moved(owner.trail[6], 1)],
    }
    expect(rankAll(owner, [real, stranger], { ...context, fullCreditBuildings: Infinity })[0].candidateId).toBe(950)
    const results = findMatches(owner, [real, stranger], context)
    expect(results.map((r) => r.candidateId)).toEqual([found1.id])
  })

  it('shows far fewer wrong matches when every owner lists 10 buildings', () => {
    const discounted = evaluateWide(10, FULL_CREDIT_BUILDINGS)
    const undiscounted = evaluateWide(10, Infinity)
    expect(discounted.wrongShown).toBeLessThan(undiscounted.wrongShown / 3)
    expect(discounted.shown).toBeGreaterThanOrEqual(seed.pairs.length - 3)
  })
})

describe('only the same or a related category matches', () => {
  // Two reports at the same spot, an hour apart, both black: everything but the category agrees
  const when = { from: '2026-10-20T06:00:00Z', to: '2026-10-20T07:00:00Z' }
  const later = { from: '2026-10-20T08:00:00Z', to: '2026-10-20T08:10:00Z' }
  const lostReport = (fields) => ({
    id: 900, type: 'lost', postedBy: 1, colour: 'Black', brand: null, description: '',
    trail: [{ spotId: 1, ...when }], ...fields,
  })
  const foundReport = (fields) => ({
    id: 901, type: 'found', postedBy: 2, colour: 'Black', brand: null, description: '',
    trail: [{ spotId: 1, ...later }], ...fields,
  })
  const headphones = lostReport({
    title: 'Black Sony headphones', category: 'Headphones', brand: 'Sony',
    description: 'Over-ear headphones in a hard case',
  })

  it('never offers an umbrella for headphones, however much else agrees', () => {
    const umbrella = foundReport({ title: 'Black compact umbrella', category: 'Umbrella' })
    expect(rankAll(headphones, [umbrella], context)).toEqual([])
  })

  it('still matches a related category', () => {
    const earbuds = foundReport({ title: 'Sony earbuds, black case', category: 'Earbuds', brand: 'Sony' })
    expect(rankAll(headphones, [earbuds], context).map((r) => r.candidateId)).toEqual([901])
  })

  it('matches an Other report only when the text backs it up', () => {
    const powerBank = lostReport({
      title: 'White Anker power bank', category: 'Charger', colour: 'White', brand: 'Anker',
      description: 'PowerCore 10000 power bank with a short USB-C cable',
    })
    const vague = foundReport({ title: 'White thing', category: 'Other', colour: 'White' })
    const described = foundReport({
      title: 'Small power bank', category: 'Other', colour: 'White',
      description: 'Power bank with a short USB-C cable, left on a desk',
    })
    expect(rankAll(powerBank, [vague], context)).toEqual([])
    expect(rankAll(powerBank, [described], context).map((r) => r.candidateId)).toEqual([901])
  })

  it('asks the same of two Other reports', () => {
    const pick = lostReport({ title: 'Guitar pick tin', category: 'Other' })
    const lanyard = foundReport({ title: 'Lanyard with keychain', category: 'Other' })
    expect(rankAll(pick, [lanyard], context)).toEqual([])
  })

  it('counts the same brand or 2 shared words as backing for Other', () => {
    expect(canMatch('Other', 'Charger', seed.categories, { sameBrand: true, sharedWords: 0 })).toBe(true)
    expect(canMatch('Other', 'Other', seed.categories, { sameBrand: false, sharedWords: 2 })).toBe(true)
    expect(canMatch('Charger', 'Other', seed.categories, { sameBrand: false, sharedWords: 1 })).toBe(false)
    expect(canMatch('Wallet', 'Cardholder', seed.categories, {})).toBe(true)
    expect(canMatch('Umbrella', 'Headphones', seed.categories, { sameBrand: true, sharedWords: 5 })).toBe(false)
  })

  it('finds pair 18, a charger the finder filed as Other', () => {
    const pair = seed.pairs.find((p) => p.pairId === 18)
    const [top] = findMatches(itemsById.get(pair.foundItemId), lostItems, context)
    expect(top.candidateId).toBe(pair.lostItemId)
  })
})
