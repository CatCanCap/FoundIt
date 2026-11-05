import { describe, it, expect } from 'vitest'
import { newestOpen, weekCounts, weekLine, handedInAgo, placeLine } from '../landing'

const NOW = new Date('2026-10-30T06:00:00Z') // Fri 30 Oct, 2 pm in Singapore
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString()
const daysAgo = (days) => hoursAgo(days * 24)

function find(id, overrides = {}) {
  return {
    id,
    type: 'found',
    status: 'open',
    createdAt: hoursAgo(id),
    trail: [{ spotId: 1, from: hoursAgo(id), to: hoursAgo(id) }],
    ...overrides,
  }
}

describe('newestOpen', () => {
  it('keeps open finds with a place, newest first, up to the count', () => {
    const items = [find(5), find(1), find(3), find(2), find(4), find(6)]
    expect(newestOpen(items, 3).map((item) => item.id)).toEqual([1, 2, 3])
  })

  it('leaves out finds that are claimed, returned or have no place', () => {
    const items = [
      find(1, { status: 'matched' }),
      find(2, { status: 'resolved' }),
      find(3, { trail: [] }),
      find(4),
    ]
    expect(newestOpen(items).map((item) => item.id)).toEqual([4])
  })

  it('does not change the list it was given', () => {
    const items = [find(2), find(1)]
    newestOpen(items)
    expect(items.map((item) => item.id)).toEqual([2, 1])
  })
})

describe('weekCounts', () => {
  it('splits finds into the last 7 days and the 7 before', () => {
    const items = [
      find(1, { createdAt: daysAgo(0.5) }),
      find(2, { createdAt: daysAgo(6.9) }),
      find(3, { createdAt: daysAgo(7) }),
      find(4, { createdAt: daysAgo(13.9) }),
      find(5, { createdAt: daysAgo(20) }),
    ]
    expect(weekCounts(items, NOW)).toEqual({ thisWeek: 2, lastWeek: 2 })
  })

  it('ignores a find dated in the future (a wrong clock)', () => {
    expect(weekCounts([find(1, { createdAt: hoursAgo(-2) })], NOW)).toEqual({
      thisWeek: 0,
      lastWeek: 0,
    })
  })
})

describe('weekLine', () => {
  it('compares this week with the week before', () => {
    expect(weekLine({ thisWeek: 12, lastWeek: 9 })).toBe(
      '12 finds handed in over the last 7 days, 9 the week before',
    )
  })

  it('says "1 find" for one', () => {
    expect(weekLine({ thisWeek: 1, lastWeek: 0 })).toBe(
      '1 find handed in over the last 7 days, 0 the week before',
    )
  })
})

describe('handedInAgo', () => {
  it('counts minutes, then hours, within a day', () => {
    expect(handedInAgo(hoursAgo(0.001), NOW)).toBe('Just now')
    expect(handedInAgo(hoursAgo(0.25), NOW)).toBe('15 min ago')
    expect(handedInAgo(hoursAgo(3.5), NOW)).toBe('3 h ago')
  })

  it('gives the day in Singapore after a day', () => {
    // 26 Oct, 11 pm UTC is already Tue 27 Oct in Singapore
    expect(handedInAgo('2026-10-26T23:00:00Z', NOW)).toBe('Tue 27 Oct')
  })
})

describe('placeLine', () => {
  it('gives the short building name and the level', () => {
    const spot = { building: 'Li Ka Shing Library', floor: 'Level 2', area: 'quiet study areas' }
    expect(placeLine(spot)).toBe('LKS Library · Level 2')
  })

  it('leaves out a missing level, and gives nothing for no spot', () => {
    expect(placeLine({ building: 'SCIS 1' })).toBe('SCIS 1')
    expect(placeLine(undefined)).toBe('')
  })
})
