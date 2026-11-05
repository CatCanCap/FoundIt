import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { formatReason, parseReason, reason } = require('../../matching/reasons')
const { findMatches } = require('../../matching')
const { buildMyMatches } = require('../../matching/my-matches')
const { forms } = require('../../matching/text')
const { keywordScore } = require('../../matching/attributes')
const { loadSeed } = require('../../data/load')

const seed = loadSeed()
const context = { spots: seed.spots, categories: seed.categories, colours: seed.colours }

describe('reasons', () => {
  it('saves a reason as "lead: detail" and reads it back the same', () => {
    expect(formatReason(reason('same brand', 'Hydro Flask'))).toBe('same brand: Hydro Flask')
    expect(formatReason(reason('within a day'))).toBe('within a day')
    expect(parseReason('same brand: Hydro Flask')).toEqual({ lead: 'same brand', detail: 'Hydro Flask' })
    expect(parseReason('within a day')).toEqual({ lead: 'within a day', detail: '' })
  })

  it('reads a reason saved before this form whole, as its lead', () => {
    expect(parseReason('same brand (Sony)')).toEqual({ lead: 'same brand (Sony)', detail: '' })
  })

  it('reads back every reason the seeded pairs produce, so rewording one cannot break the page', () => {
    const lost = seed.items.filter((item) => item.type === 'lost')
    const found = seed.items.filter((item) => item.type === 'found')
    let checked = 0
    for (const item of [...lost, ...found]) {
      const pool = item.type === 'lost' ? found : lost
      for (const result of findMatches(item, pool, context)) {
        for (const text of result.reasons) {
          const parts = parseReason(text)
          expect(parts.lead).not.toBe('')
          expect(parts.lead).not.toContain(': ')
          expect(formatReason(parts)).toBe(text)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('sends each match its reasons as { lead, detail } from GET /api/matches/mine', () => {
    const [report] = buildMyMatches({
      reports: [{ id: 1, type: 'lost', status: 'open' }],
      matchesByReport: new Map([
        [1, [{ id: 7, foundItemId: 2, score: 90, reasons: ['same category', 'same brand: Sony'] }]],
      ]),
      foundItems: [{ id: 2, status: 'open' }],
    })
    expect(report.matches[0].reasonParts).toEqual([
      { lead: 'same category', detail: '' },
      { lead: 'same brand', detail: 'Sony' },
    ])
  })
})

describe('words in reasons', () => {
  it('keeps each word as it was written beside the stem used for scoring', () => {
    expect(forms('Over-ear headphones, stickers')).toEqual([
      { stem: 'overear', word: 'over-ear' },
      { stem: 'headphone', word: 'headphones' },
      { stem: 'sticker', word: 'stickers' },
    ])
  })

  it('names the shared words as written, not as stems', () => {
    const a = { title: 'Sony over-ear headphones', description: 'Hard case with stickers' }
    const b = { title: 'Over-ear headphones', description: 'In a hard case, stickers on it' }
    const { reasons } = keywordScore(a, b, [])
    expect(reasons[0].lead).toBe('both mention')
    expect(reasons[0].detail).toContain('over-ear')
    expect(reasons[0].detail).not.toContain('overear')
  })
})
