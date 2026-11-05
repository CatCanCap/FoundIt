import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { toCamel, toSnake } = require('../../lib/case')

describe('toCamel', () => {
  it('converts column names to camelCase', () => {
    expect(toCamel({ lost_item_id: 1, photo_url: 'x', id: 2 }))
      .toEqual({ lostItemId: 1, photoUrl: 'x', id: 2 })
  })

  it('leaves nested values untouched', () => {
    const row = { breakdown: { C: 100, A: 50, L: 80, D: 90 }, reasons: ['same floor'] }
    expect(toCamel(row)).toEqual(row)
  })

  it('passes null through', () => {
    expect(toCamel(null)).toBe(null)
  })
})

describe('toSnake', () => {
  it('converts field names to snake_case and drops undefined values', () => {
    expect(toSnake({ lostItemId: 1, photoUrl: undefined, isCollectionPoint: true }))
      .toEqual({ lost_item_id: 1, is_collection_point: true })
  })
})
