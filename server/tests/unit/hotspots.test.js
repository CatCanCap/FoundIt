import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { summariseHotspots, hideSmallCounts, median } = require('../../stats/hotspots')

const spots = [
  { id: 1, building: 'SCIS 1' },
  { id: 2, building: 'SCIS 1' },
  { id: 3, building: 'Li Ka Shing Library' },
]

// A found item at a spot. `at` is a Singapore time, e.g. '2026-10-14T10:30:00+08:00'
function found(id, spotId, at, status = 'open') {
  const when = new Date(at).toISOString()
  return { id, type: 'found', status, createdAt: when, trail: [{ spotId, from: when, to: when }] }
}

describe('median', () => {
  it('is the middle value, or the mean of the two middle values', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('is null for no values', () => {
    expect(median([])).toBeNull()
  })
})

describe('summariseHotspots', () => {
  it('groups found items by building, most first, counting every spot in a building', () => {
    const items = [
      found(1, 1, '2026-10-14T10:00:00+08:00'),
      found(2, 2, '2026-10-14T11:00:00+08:00'),
      found(3, 3, '2026-10-14T12:00:00+08:00'),
    ]
    const { buildings } = summariseHotspots({ items, spots })
    expect(buildings.map((b) => [b.building, b.count])).toEqual([
      ['SCIS 1', 2],
      ['Li Ka Shing Library', 1],
    ])
  })

  it('counts each spot separately for the heatmap, most first', () => {
    const items = [
      found(1, 1, '2026-10-14T10:00:00+08:00'),
      found(2, 2, '2026-10-14T11:00:00+08:00'),
      found(3, 2, '2026-10-14T12:00:00+08:00'),
    ]
    expect(summariseHotspots({ items, spots }).spots).toEqual([
      { spotId: 2, count: 2 },
      { spotId: 1, count: 1 },
    ])
  })

  it('works out the resolution rate as a whole percent', () => {
    const items = [
      found(1, 1, '2026-10-14T10:00:00+08:00', 'resolved'),
      found(2, 1, '2026-10-14T10:00:00+08:00'),
      found(3, 1, '2026-10-14T10:00:00+08:00'),
    ]
    const { buildings } = summariseHotspots({ items, spots })
    expect(buildings[0]).toMatchObject({ resolved: 1, resolutionRate: 33 })
  })

  it('measures the median return time in hours from the handoff times', () => {
    const items = [
      found(1, 1, '2026-10-14T10:00:00+08:00', 'resolved'),
      found(2, 1, '2026-10-14T10:00:00+08:00', 'resolved'),
      found(3, 3, '2026-10-14T10:00:00+08:00', 'resolved'),
    ]
    const returns = new Map([
      [1, '2026-10-14T14:00:00+08:00'], // 4 hours
      [2, '2026-10-15T10:00:00+08:00'], // 24 hours
      [3, '2026-10-14T12:00:00+08:00'], // 2 hours
    ])
    const { buildings } = summariseHotspots({ items, spots, returns })
    expect(buildings.find((b) => b.building === 'SCIS 1').medianReturnHours).toBe(14)
    expect(buildings.find((b) => b.building === 'Li Ka Shing Library').medianReturnHours).toBe(2)
  })

  it('leaves the return time empty when nothing in a building was returned', () => {
    const items = [found(1, 1, '2026-10-14T10:00:00+08:00')]
    const { buildings } = summariseHotspots({ items, spots })
    expect(buildings[0]).toMatchObject({ resolved: 0, resolutionRate: 0, medianReturnHours: null })
    expect(summariseHotspots({ items: [], spots }).buildings).toEqual([])
  })

  it('counts items by hour of the day in Singapore time', () => {
    const items = [
      found(1, 1, '2026-10-14T00:30:00+08:00'),
      found(2, 1, '2026-10-14T23:59:00+08:00'),
      found(3, 1, '2026-10-14T23:01:00+08:00'),
    ]
    const { byHour } = summariseHotspots({ items, spots })
    expect(byHour).toHaveLength(24)
    expect(byHour[0]).toBe(1)
    expect(byHour[23]).toBe(2)
  })

  it('puts an item at a spot it does not know under "Unknown place"', () => {
    const { buildings } = summariseHotspots({
      items: [found(1, 99, '2026-10-14T10:00:00+08:00')],
      spots,
    })
    expect(buildings[0].building).toBe('Unknown place')
  })

  it('counts a lost report once in each building on its trail', () => {
    const at = (time) => new Date(`2026-10-14T${time}:00+08:00`).toISOString()
    const lost = {
      id: 7,
      type: 'lost',
      status: 'open',
      createdAt: at('16:00'),
      trail: [
        { spotId: 1, from: at('09:00'), to: at('10:00') },
        { spotId: 2, from: at('10:30'), to: at('11:00') }, // also SCIS 1: not counted again
        { spotId: 3, from: at('14:00'), to: at('15:00') },
      ],
    }
    const { buildings, spots: points, byHour } = summariseHotspots({ items: [lost], spots })
    expect(buildings.map((b) => [b.building, b.count])).toEqual([
      ['Li Ka Shing Library', 1],
      ['SCIS 1', 1],
    ])
    expect(points).toEqual([
      { spotId: 1, count: 1 },
      { spotId: 3, count: 1 },
    ])
    expect(byHour[9]).toBe(1)
    expect(byHour[14]).toBe(1)
  })

  it('counts resolved lost reports in every building they passed through', () => {
    const at = (time) => new Date(`2026-10-14T${time}:00+08:00`).toISOString()
    const lost = {
      id: 8,
      type: 'lost',
      status: 'resolved',
      createdAt: at('16:00'),
      trail: [
        { spotId: 1, from: at('09:00'), to: at('10:00') },
        { spotId: 3, from: at('11:00'), to: at('12:00') },
      ],
    }
    const returns = new Map([[8, '2026-10-15T04:00:00+08:00']]) // 12 hours later
    const { buildings } = summariseHotspots({ items: [lost], spots, returns })
    expect(buildings.every((b) => b.resolutionRate === 100 && b.medianReturnHours === 12)).toBe(true)
  })
})

describe('hideSmallCounts', () => {
  const summary = {
    buildings: [
      { building: 'SCIS 1', count: 4 },
      { building: 'SOE', count: 2 },
    ],
    spots: [
      { spotId: 1, count: 3 },
      { spotId: 2, count: 1 },
    ],
    byHour: [0, 1, 3, 5, ...new Array(20).fill(0)],
  }

  it('leaves out every building, spot and hour counted fewer than the minimum', () => {
    const shown = hideSmallCounts(summary, 3)
    expect(shown.buildings.map((entry) => entry.building)).toEqual(['SCIS 1'])
    expect(shown.spots).toEqual([{ spotId: 1, count: 3 }])
    expect(shown.byHour.slice(0, 4)).toEqual([0, 0, 3, 5])
    expect(shown.hidden).toBe(true)
    // The summary it was given is left as it was
    expect(summary.buildings).toHaveLength(2)
  })

  it('says nothing was hidden when every count reaches the minimum', () => {
    expect(hideSmallCounts(summary, 1).hidden).toBe(false)
  })
})
