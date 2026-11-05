import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const {
  forViewer, hidePlace, knowsWhereAndWhen, knownFinds, isPlaceOrTimeReason, matchForViewer,
} = require('../../lib/item-privacy')
const { findMatches } = require('../../matching')
const { loadSeed } = require('../../data/load')

const point = { spotId: 4, roomId: 12, from: '2026-10-20T02:00:00.000Z', to: '2026-10-20T03:00:00.000Z' }
const found = { id: 7, type: 'found', postedBy: 1, photoUrl: 'https://res.cloudinary.com/x.jpg', trail: [point] }
const lost = { id: 8, type: 'lost', postedBy: 1, photoUrl: 'https://res.cloudinary.com/y.jpg', trail: [point, point] }
const finder = { id: 1, role: 'user' }
const stranger = { id: 2, role: 'user' }
const admin = { id: 3, role: 'admin' }
const match = (L, D, extra = {}) => ({
  id: 5, lostItemId: 8, foundItemId: 7, score: 70, status: 'suggested',
  breakdown: { C: 100, A: 80, L, D }, reasons: [], ...extra,
})

describe('hidePlace', () => {
  it('drops the spot, room and times of every point', () => {
    const hidden = hidePlace(lost)
    expect(hidden.placeHidden).toBe(true)
    expect(hidden.trail).toEqual([
      { spotId: null, roomId: null, from: null, to: null },
      { spotId: null, roomId: null, from: null, to: null },
    ])
    // The item it was given is left as it was
    expect(lost.trail[0].spotId).toBe(4)
  })
})

describe('forViewer: where and when a found item was handed in', () => {
  it('is hidden from someone logged out, or logged in without a report that said it', () => {
    for (const viewer of [null, undefined, stranger]) {
      const shown = forViewer(found, viewer)
      expect(shown.placeHidden).toBe(true)
      expect(shown.trail[0]).toEqual({ spotId: null, roomId: null, from: null, to: null })
      // The photo still shows, to help the owner recognise it
      expect(shown.photoUrl).toBe(found.photoUrl)
    }
  })

  it('shows to the finder and to admins', () => {
    expect(forViewer(found, finder)).toBe(found)
    expect(forViewer(found, admin)).toBe(found)
  })

  it('shows to someone whose report already named the place and time', () => {
    expect(forViewer(found, stranger, new Set([7]))).toBe(found)
    expect(forViewer(found, stranger, new Set([9])).placeHidden).toBe(true)
  })

  it('compares ids as numbers', () => {
    expect(forViewer({ ...found, id: '7' }, stranger, new Set([7])).placeHidden).toBeUndefined()
  })
})

describe('forViewer: a lost report', () => {
  it('keeps its places for everyone but hides its photo from others', () => {
    const shown = forViewer(lost, stranger)
    expect(shown.photoUrl).toBeNull()
    expect(shown.trail).toEqual(lost.trail)
    expect(shown.placeHidden).toBeUndefined()
  })

  it('shows its photo to its poster and admins', () => {
    expect(forViewer(lost, finder)).toBe(lost)
    expect(forViewer(lost, admin)).toBe(lost)
  })

  it('leaves one without a photo as it is', () => {
    const plain = { ...lost, photoUrl: null }
    expect(forViewer(plain, stranger)).toBe(plain)
  })

  it('passes no item through', () => {
    expect(forViewer(null, stranger)).toBeNull()
  })
})

describe('knowsWhereAndWhen', () => {
  it('needs the same building or closer and a time within about a week', () => {
    expect(knowsWhereAndWhen(match(60, 50))).toBe(true)
    expect(knowsWhereAndWhen(match(100, 100))).toBe(true)
    // Nearby building only
    expect(knowsWhereAndWhen(match(30, 100))).toBe(false)
    // Right building, but more than a week apart
    expect(knowsWhereAndWhen(match(100, 49.9))).toBe(false)
    expect(knowsWhereAndWhen(match(undefined, undefined))).toBe(false)
    expect(knowsWhereAndWhen({ breakdown: null })).toBe(false)
    expect(knowsWhereAndWhen(null)).toBe(false)
  })

  it('collects the finds of the matches that pass it', () => {
    const finds = knownFinds([match(80, 90, { foundItemId: '7' }), match(0, 90, { foundItemId: 9 })])
    expect([...finds]).toEqual([7])
  })

  it('counts a find only when every one of the person’s reports on it passes, so one wrong guess is final', () => {
    // A first report guessed the wrong building; a second one names the right one
    const wrongThenRight = [match(0, 90, { lostItemId: 1 }), match(80, 90, { lostItemId: 2 })]
    expect(knownFinds(wrongThenRight).has(7)).toBe(false)
    // In either order
    expect(knownFinds([...wrongThenRight].reverse()).has(7)).toBe(false)
    // Two reports that both said it are fine
    expect(knownFinds([match(80, 90, { lostItemId: 1 }), match(60, 70, { lostItemId: 2 })]).has(7)).toBe(true)
  })
})

describe('matchForViewer', () => {
  const reasons = [
    'same category', 'same brand: Totes', 'both mention: wooden, handle', 'same colour: Black',
    'nearby buildings: SOE and SCIS 1', 'same building: SCIS 1', 'same floor: SCIS 1 Level 2',
    'same room: SCIS1 GSR 2-1', 'same area: SCIS 1, Level 2', 'same place: LKS Library, Level 2',
    'trail covers 4 buildings: place and time count for less', 'within a day', '1 day apart', '3 days apart',
  ]

  it('drops the place and time reasons and scores when the report did not say them', () => {
    const shown = matchForViewer(match(30, 90, { reasons }))
    expect(shown.reasons).toEqual(['same category', 'same brand: Totes', 'both mention: wooden, handle', 'same colour: Black'])
    expect(shown.breakdown).toEqual({ C: 100, A: 80, L: null, D: null })
    expect(shown.score).toBe(70)
  })

  it('keeps the match whole when the report did say them', () => {
    const whole = match(80, 90, { reasons })
    expect(matchForViewer(whole)).toBe(whole)
  })

  it('follows the person’s finds when given them, over the match on its own', () => {
    const whole = match(80, 90, { reasons })
    // Another of their reports guessed wrong, so the find is not in their set
    expect(matchForViewer(whole, new Set()).reasons).toEqual(['same category', 'same brand: Totes', 'both mention: wooden, handle', 'same colour: Black'])
    expect(matchForViewer(match(0, 0, { reasons }), new Set([7]))).toEqual(match(0, 0, { reasons }))
  })

  it('copes with a match without reasons', () => {
    expect(matchForViewer(match(0, 0, { reasons: undefined })).reasons).toEqual([])
    expect(matchForViewer(null)).toBeNull()
  })
})

describe('with the real matching engine on the seed data', () => {
  const seed = loadSeed()
  const context = { spots: seed.spots, categories: seed.categories, colours: seed.colours }
  const lostItems = seed.items.filter((item) => item.type === 'lost')
  const foundItems = seed.items.filter((item) => item.type === 'found')
  const words = [...new Set(seed.spots.flatMap((spot) => [spot.building, spot.area]).filter(Boolean))]

  it('leaves no building, area or time gap in the reasons of a match that did not earn them', () => {
    let dropped = 0
    for (const lostItem of lostItems) {
      for (const result of findMatches(lostItem, foundItems, context)) {
        const kept = matchForViewer({ ...result, breakdown: { ...result.breakdown, L: 0 } }).reasons
        dropped += result.reasons.length - kept.length
        for (const text of kept) {
          expect(isPlaceOrTimeReason(text)).toBe(false)
          expect(text).not.toMatch(/apart|within a day|trail covers/)
          for (const word of words) expect(text.split(': ')[1] || '').not.toContain(word)
        }
      }
    }
    // The seeded pairs share places and days, so plenty were dropped
    expect(dropped).toBeGreaterThan(40)
  })

  it('does not show the place to a made-up report that copies a find but guesses the place and day wrong', () => {
    const find = foundItems[0]
    const findSpot = seed.spots.find((spot) => spot.id === find.trail[0].spotId)
    const elsewhere = seed.spots.find((spot) => spot.building !== findSpot.building
      && !(findSpot.linkedBuildings || []).includes(spot.building)
      && !(spot.linkedBuildings || []).includes(findSpot.building))
    const tenDaysEarlier = (time) => new Date(new Date(time).getTime() - 10 * 86400000).toISOString()
    const fake = {
      ...find, id: 9999, type: 'lost', postedBy: 999,
      trail: [{ spotId: elsewhere.id, roomId: null, from: tenDaysEarlier(find.trail[0].from), to: tenDaysEarlier(find.trail[0].to) }],
    }
    const [result] = findMatches(fake, [find], context)
    // Copying the visible details is enough for a match...
    expect(result?.score).toBeGreaterThanOrEqual(50)
    // ...but not to learn where and when it was found
    expect(knowsWhereAndWhen(result)).toBe(false)
  })

  it('shows the place to most real owners in the seed', () => {
    let shown = 0
    lostItems.forEach((lostItem, index) => {
      const find = foundItems[index]
      const [result] = findMatches(lostItem, [find], context)
      if (result && knowsWhereAndWhen(result)) shown += 1
    })
    expect(shown).toBeGreaterThan(lostItems.length / 2)
  })
})
