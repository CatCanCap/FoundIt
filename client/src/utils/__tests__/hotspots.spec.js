import { describe, it, expect } from 'vitest'
import {
  busiestHour,
  categoryFamilies,
  countsByBuilding,
  formatPercent,
  formatReturnTime,
  hourLabel,
  itemsInBuilding,
  mapTip,
  rankBuildings,
} from '../hotspots'
import { FAMILY_LABELS, categoryFamily } from '../design'

describe('categoryFamilies', () => {
  it('groups categories into the families that have any, in order', () => {
    const categories = [{ name: 'Laptop' }, { name: 'Umbrella' }, { name: 'Phone' }]
    expect(categoryFamilies(categories, categoryFamily, FAMILY_LABELS)).toEqual([
      { family: 'electronics', label: 'Electronics', categories: ['Laptop', 'Phone'] },
      { family: 'umbrellas', label: 'Umbrellas', categories: ['Umbrella'] },
    ])
  })
})

describe('rankBuildings', () => {
  it('gives the top building a full bar and the rest a share of it', () => {
    const ranked = rankBuildings([
      { building: 'A', count: 6 },
      { building: 'B', count: 3 },
      { building: 'C', count: 1 },
    ])
    expect(ranked.map((entry) => entry.share)).toEqual([100, 50, 17])
  })

  it('keeps only the first few', () => {
    const buildings = Array.from({ length: 8 }, (_, i) => ({ building: `B${i}`, count: 8 - i }))
    expect(rankBuildings(buildings, 5)).toHaveLength(5)
  })

  it('is empty when there are no buildings', () => {
    expect(rankBuildings([])).toEqual([])
  })
})

describe('itemsInBuilding', () => {
  const spotsById = new Map([
    [1, { id: 1, building: 'SCIS 1' }],
    [2, { id: 2, building: 'LKCSB' }],
  ])
  const item = (id, createdAt, spotIds) => ({
    id,
    createdAt,
    trail: spotIds.map((spotId) => ({ spotId })),
  })

  it('finds items with any trail stop in the building, newest first', () => {
    const items = [
      item(1, '2026-10-14T01:00:00Z', [1]),
      item(2, '2026-10-15T01:00:00Z', [2, 1]),
      item(3, '2026-10-16T01:00:00Z', [2]),
    ]
    expect(itemsInBuilding(items, spotsById, 'SCIS 1').map((entry) => entry.id)).toEqual([2, 1])
  })
})

describe('mapTip', () => {
  const byHour = Array(24).fill(0)
  byHour[12] = 5

  it('names the busiest building and hour for finds', () => {
    const stats = { buildings: [{ building: 'Li Ka Shing Library', count: 6 }], byHour }
    expect(mapTip('found', stats)).toBe('Things turn up most at LKS Library around 12pm.')
  })

  it('sends people to the worst building for lost reports', () => {
    const stats = { buildings: [{ building: 'SCIS 1', count: 1 }], byHour }
    expect(mapTip('lost', stats)).toBe('Check SCIS 1 first. 1 thing went missing there.')
  })

  it('says when there is nothing to show', () => {
    expect(mapTip('found', { buildings: [] })).toBe('Nothing handed in yet this week.')
    expect(mapTip('lost', null)).toBe('Nothing reported lost in the last 30 days.')
  })
})

describe('hotspot display helpers', () => {
  it('shows short return times in hours and long ones in days', () => {
    expect(formatReturnTime(5.24)).toBe('5.2 h')
    expect(formatReturnTime(43.2)).toBe('1.8 d')
    expect(formatReturnTime(null)).toBe('–')
  })

  it('shows a percent, or a dash when there is none', () => {
    expect(formatPercent(71)).toBe('71%')
    expect(formatPercent(null)).toBe('–')
  })

  it('turns the API buildings into counts by name', () => {
    expect(countsByBuilding([{ building: 'SOA', count: 3 }])).toEqual({ SOA: 3 })
  })
})

describe('time-of-day helpers', () => {
  it('names hours on a 12-hour clock', () => {
    expect(hourLabel(0)).toBe('12am')
    expect(hourLabel(12)).toBe('12pm')
    expect(hourLabel(13)).toBe('1pm')
  })

  it('finds the busiest hour, earlier hour on a tie, none when empty', () => {
    const byHour = Array.from({ length: 24 }, () => 0)
    byHour[9] = 3
    byHour[14] = 3
    expect(busiestHour(byHour)).toBe(9)
    expect(busiestHour(Array.from({ length: 24 }, () => 0))).toBeNull()
  })
})
