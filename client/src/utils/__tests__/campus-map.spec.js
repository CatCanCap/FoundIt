import { describe, it, expect } from 'vitest'
import { spotsInBuilding, floorsInBuilding, spotsOnFloor, areaLabel } from '../campus-map'

describe('spotsInBuilding', () => {
  const spots = [
    { id: 1, building: 'LKCSB', floor: 'Level 2', area: 'seminar rooms' },
    { id: 2, building: 'SCIS 1', floor: 'Level 1', area: 'lobby' },
    { id: 3, building: 'LKCSB', floor: 'Basement 1', area: 'group study rooms' },
    { id: 4, building: 'LKCSB', floor: 'Level 1', area: 'atrium' },
  ]

  it('lists only that building, lowest floor first', () => {
    expect(spotsInBuilding(spots, 'LKCSB').map((s) => s.id)).toEqual([3, 4, 1])
  })

  it('returns nothing for a building with no spots', () => {
    expect(spotsInBuilding(spots, 'YPHSL')).toEqual([])
  })
})

describe('floorsInBuilding and spotsOnFloor', () => {
  const spots = [
    { id: 4, building: 'SCIS 1', floor: 'Level 1', area: 'lobby' },
    { id: 5, building: 'SCIS 1', floor: 'Level 2', area: 'lift lobby' },
    { id: 6, building: 'SCIS 1', floor: 'Level 2', area: 'seminar rooms' },
    { id: 16, building: 'LKCSB', floor: 'Basement 1', area: 'group study rooms' },
  ]

  it('lists each level of a building once, lowest first', () => {
    expect(floorsInBuilding(spots, 'SCIS 1')).toEqual(['Level 1', 'Level 2'])
    expect(floorsInBuilding(spots, 'YPHSL')).toEqual([])
  })

  it('lists the spots on one level', () => {
    expect(spotsOnFloor(spots, 'SCIS 1', 'Level 2').map((s) => s.id)).toEqual([5, 6])
    expect(spotsOnFloor(spots, 'SCIS 1', 'Level 3')).toEqual([])
  })
})

describe('areaLabel', () => {
  it('capitalises each word of a facility', () => {
    expect(areaLabel('project rooms')).toBe('Project Rooms')
    expect(areaLabel('Koufu food court')).toBe('Koufu Food Court')
    expect(areaLabel('Bras Basah MRT exit')).toBe('Bras Basah MRT Exit')
    expect(areaLabel('lifts, stairs & corridors')).toBe('Lifts, Stairs & Corridors')
  })

  it('keeps shop names as they are written', () => {
    expect(areaLabel('Each-a-Cup')).toBe('Each-a-Cup')
    expect(areaLabel('1983 A Taste of Nanyang')).toBe('1983 A Taste of Nanyang')
    expect(areaLabel('TripletS by Bakery Cuisine')).toBe('TripletS by Bakery Cuisine')
    expect(areaLabel('Nature Café')).toBe('Nature Café')
    expect(areaLabel('benches by the library')).toBe('Benches by the Library')
  })
})
