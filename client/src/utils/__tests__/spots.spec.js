import { describe, it, expect } from 'vitest'
import { spotName } from '../spots'

describe('spotName', () => {
  it('names the building, floor and area', () => {
    expect(spotName({ building: 'SCIS 1', floor: 'Level 2', area: 'lift lobby' })).toBe(
      'SCIS 1, Level 2 · Lift Lobby',
    )
  })

  it("uses the building's short name, as on the map", () => {
    expect(
      spotName({ building: 'Li Ka Shing Library', floor: 'Level 2', area: 'service desk' }),
    ).toBe('LKS Library, Level 2 · Service Desk')
  })

  it('copes with a spot it does not know', () => {
    expect(spotName(undefined)).toBe('Unknown place')
  })
})
