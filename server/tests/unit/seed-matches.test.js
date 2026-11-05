import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { seedMatches } = require('../../matching/seed-matches')
const { loadSeed } = require('../../data/load')

const seed = loadSeed()
const rows = seedMatches(seed)
const itemsById = new Map(seed.items.map((item) => [item.id, item]))

describe('seedMatches', () => {
  it('finds every true seeded pair', () => {
    const saved = new Set(rows.map((row) => `${row.lostItemId}-${row.foundItemId}`))
    for (const pair of seed.pairs) {
      expect(saved.has(`${pair.lostItemId}-${pair.foundItemId}`)).toBe(true)
    }
  })

  it('pairs a lost item with a found item, once per pair, scoring 50 or more', () => {
    const keys = rows.map((row) => `${row.lostItemId}-${row.foundItemId}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const row of rows) {
      expect(itemsById.get(row.lostItemId).type).toBe('lost')
      expect(itemsById.get(row.foundItemId).type).toBe('found')
      expect(row.score).toBeGreaterThanOrEqual(50)
      expect(row.score).toBeLessThanOrEqual(100)
      expect(Object.keys(row.breakdown)).toEqual(['C', 'A', 'L', 'D'])
      expect(row.reasons.length).toBeGreaterThan(0)
    }
  })

  it('gives some lost reports more than one find, so the ranked list can be seen', () => {
    const findsPerReport = new Map()
    for (const row of rows) {
      findsPerReport.set(row.lostItemId, (findsPerReport.get(row.lostItemId) || 0) + 1)
    }
    expect(Math.max(...findsPerReport.values())).toBeGreaterThan(1)
  })
})
