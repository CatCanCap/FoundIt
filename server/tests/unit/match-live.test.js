import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { isLive } = require('../../models/match-model')

const match = (status, lostItemId = 1, foundItemId = 2) => ({ id: 9, lostItemId, foundItemId, status })
const statuses = (lost, found) => new Map([[1, lost], [2, found]])

describe('isLive', () => {
  it('keeps a suggestion while both items are still open', () => {
    expect(isLive(match('suggested'), statuses('open', 'open'))).toBe(true)
  })

  it('drops a suggestion once either item is no longer open', () => {
    expect(isLive(match('suggested'), statuses('open', 'matched'))).toBe(false)
    expect(isLive(match('suggested'), statuses('resolved', 'open'))).toBe(false)
    expect(isLive(match('suggested'), statuses('open', 'archived'))).toBe(false)
    // An item it knows nothing about (removed) is not open either
    expect(isLive(match('suggested'), new Map([[1, 'open']]))).toBe(false)
  })

  it('always keeps a claimed or confirmed match, so both people can follow their handoff', () => {
    expect(isLive(match('claimed'), statuses('matched', 'matched'))).toBe(true)
    expect(isLive(match('confirmed'), statuses('resolved', 'resolved'))).toBe(true)
  })

  it('never keeps a rejected match', () => {
    expect(isLive(match('rejected'), statuses('open', 'open'))).toBe(false)
  })

  it('reads item ids given as text too', () => {
    expect(isLive(match('suggested', '1', '2'), statuses('open', 'open'))).toBe(true)
  })
})
