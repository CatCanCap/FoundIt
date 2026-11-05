import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { limit, clientAddress } = require('../../lib/rate-limit')

describe('limit', () => {
  it('allows max tries in the window, then says it is over', () => {
    const tries = limit({ max: 3, windowMs: 1000 })
    for (let i = 0; i < 3; i += 1) {
      expect(tries.isOver('a', 0)).toBe(false)
      tries.add('a', 0)
    }
    expect(tries.isOver('a', 10)).toBe(true)
    // Someone else is not affected
    expect(tries.isOver('b', 10)).toBe(false)
  })

  it('checks and counts in one step with take', () => {
    const tries = limit({ max: 2, windowMs: 1000 })
    expect([tries.take('a', 0), tries.take('a', 0), tries.take('a', 0)]).toEqual([true, true, false])
  })

  it('forgets tries once the window has passed', () => {
    const tries = limit({ max: 1, windowMs: 1000 })
    tries.add('a', 0)
    expect(tries.isOver('a', 999)).toBe(true)
    expect(tries.isOver('a', 1000)).toBe(false)
  })

  it('keeps at most maxKeys keys, dropping the oldest', () => {
    const tries = limit({ max: 1, windowMs: 1000, maxKeys: 2 })
    tries.add('a', 0)
    tries.add('b', 0)
    tries.add('c', 0)
    expect(tries.isOver('a', 1)).toBe(false)
    expect(tries.isOver('c', 1)).toBe(true)
  })
})

describe('clientAddress', () => {
  it('uses the first x-forwarded-for address, else the request address', () => {
    expect(clientAddress({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })).toBe('1.2.3.4')
    expect(clientAddress({ headers: {}, ip: '127.0.0.1' })).toBe('127.0.0.1')
  })
})
