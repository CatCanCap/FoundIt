import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { buildMyMatches } = require('../../matching/my-matches')

const lost = (id, status = 'open') => ({ id, type: 'lost', status, title: `Lost ${id}` })
const found = (id, extra = {}) => ({ id, type: 'found', status: 'open', hiddenAt: null, title: `Found ${id}`, ...extra })
const match = (id, lostItemId, foundItemId, score) => ({ id, lostItemId, foundItemId, score, status: 'suggested' })

describe('buildMyMatches', () => {
  it('attaches each found item to its match, best first', () => {
    const result = buildMyMatches({
      reports: [lost(1)],
      matchesByReport: new Map([[1, [match(10, 1, 2, 61), match(11, 1, 4, 92)]]]),
      foundItems: [found(2), found(4)],
    })
    expect(result).toHaveLength(1)
    expect(result[0].item.id).toBe(1)
    expect(result[0].matches.map((m) => [m.id, m.item.id])).toEqual([
      [11, 4],
      [10, 2],
    ])
  })

  it('leaves out found items an admin removed or reports hid, and ones it cannot find', () => {
    const result = buildMyMatches({
      reports: [lost(1)],
      matchesByReport: new Map([[1, [match(10, 1, 2, 90), match(11, 1, 4, 80), match(12, 1, 6, 70), match(13, 1, 8, 60)]]]),
      foundItems: [found(2, { status: 'removed' }), found(4, { hiddenAt: '2026-10-20T00:00:00Z' }), found(6)],
    })
    expect(result[0].matches.map((m) => m.id)).toEqual([12])
  })

  it('keeps only lost reports still open or being returned', () => {
    const result = buildMyMatches({
      reports: [lost(1), lost(3, 'matched'), lost(5, 'resolved'), lost(7, 'archived'), { ...lost(9), type: 'found' }],
      matchesByReport: new Map(),
      foundItems: [],
    })
    expect(result.map((report) => report.item.id)).toEqual([1, 3])
  })

  it('puts reports with matches first, best match first, and the rest newest first', () => {
    const result = buildMyMatches({
      reports: [lost(9), lost(7), lost(5), lost(3)],
      matchesByReport: new Map([
        [7, [match(1, 7, 2, 55)]],
        [3, [match(2, 3, 4, 88)]],
      ]),
      foundItems: [found(2), found(4)],
    })
    expect(result.map((report) => report.item.id)).toEqual([3, 7, 9, 5])
    expect(result[2].matches).toEqual([])
  })

  it('keeps the claims the finder declined under their report, newest first', () => {
    const result = buildMyMatches({
      reports: [lost(1), lost(3)],
      matchesByReport: new Map([[1, []], [3, []]]),
      foundItems: [found(2), found(4), found(6, { status: 'removed' })],
      declinedByReport: new Map([[1, [
        { matchId: 20, foundItemId: 2, declinedAt: '2026-10-20T01:00:00Z' },
        { matchId: 21, foundItemId: 4, declinedAt: '2026-10-22T01:00:00Z' },
        { matchId: 22, foundItemId: 6, declinedAt: '2026-10-23T01:00:00Z' },
      ]]]),
    })
    const report1 = result.find((report) => report.item.id === 1)
    expect(report1.declined.map((entry) => [entry.matchId, entry.item.id])).toEqual([[21, 4], [20, 2]])
    expect(result.find((report) => report.item.id === 3).declined).toEqual([])
  })
})
