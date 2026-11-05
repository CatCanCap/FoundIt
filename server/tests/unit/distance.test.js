import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { metresBetween } = require('../../lib/distance')

describe('metresBetween', () => {
  it('is zero for the same point', () => {
    expect(metresBetween({ lat: 1.2966, lng: 103.8499 }, { lat: 1.2966, lng: 103.8499 })).toBe(0)
  })

  it('measures about 111 m for a thousandth of a degree of latitude', () => {
    const d = metresBetween({ lat: 1.296, lng: 103.85 }, { lat: 1.297, lng: 103.85 })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })
})
