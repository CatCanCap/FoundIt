import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { parseId, isNonEmptyString, parseDate } = require('../../lib/validate')

describe('parseId', () => {
  it('returns the number for a positive whole number', () => {
    expect(parseId('42')).toBe(42)
    expect(parseId(7)).toBe(7)
  })

  it.each(['abc', '-1', '0', '1.5', '', undefined, '1 or 1=1', '9'.repeat(20)])(
    'rejects %s with status 400',
    (value) => {
      expect(() => parseId(value)).toThrow(expect.objectContaining({ status: 400 }))
    },
  )
})

describe('isNonEmptyString', () => {
  it('accepts text within the limit and rejects the rest', () => {
    expect(isNonEmptyString('hello', 10)).toBe(true)
    expect(isNonEmptyString('   ', 10)).toBe(false)
    expect(isNonEmptyString('x'.repeat(11), 10)).toBe(false)
    expect(isNonEmptyString(5, 10)).toBe(false)
  })
})

describe('parseDate', () => {
  it('parses an ISO string', () => {
    expect(parseDate('2026-10-09T02:00:00Z').toISOString()).toBe('2026-10-09T02:00:00.000Z')
  })

  it('accepts an offset such as +08:00 and converts it to UTC', () => {
    expect(parseDate('2026-10-09T14:00:00+08:00').toISOString()).toBe('2026-10-09T06:00:00.000Z')
    expect(parseDate('2026-10-09T14:00+08:00').toISOString()).toBe('2026-10-09T06:00:00.000Z')
  })

  it.each([
    'yesterday-ish',
    '2026-10-09T14:00',       // no timezone: would mean different moments on different servers
    '2026-10-09T14:00:00',
    '2026-10-09',
    '5',
    '2026-13-45T00:00:00Z',
    '',
  ])('rejects %s with status 400', (value) => {
    expect(() => parseDate(value)).toThrow(expect.objectContaining({ status: 400 }))
  })

  it('rejects values that are not text', () => {
    expect(() => parseDate(1760000000000)).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => parseDate(undefined)).toThrow(expect.objectContaining({ status: 400 }))
  })
})
