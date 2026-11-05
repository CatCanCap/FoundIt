import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loadSeed } = require('../../data/load')
const { loadDemo, demo } = require('../../data/load-demo')

// The demo stories (data/demo-showcase.json) must still fit together whenever
// the JSON, the campus list or the matching engine changes.
const NOW = new Date('2026-11-03T06:00:00Z') // 14:00 Singapore time
const seed = loadSeed(NOW)
const data = loadDemo({ now: NOW, spots: seed.spots, categories: seed.categories, colours: seed.colours })
const categoryNames = new Set(seed.categories.map((category) => category.name))
const colourNames = new Set(seed.colours.map((colour) => colour.name))
const itemByKey = new Map(data.items.map((item) => [item.key, item]))

describe('demo showcase data', () => {
  it('builds without errors, with every spot, room, user and photo found', () => {
    expect(data.items.length).toBe(demo.items.length)
    for (const key of data.photoKeys) expect(demo.photos[key]).toBeDefined()
  })

  it('uses only demo.smu.edu.sg addresses, so no real inbox gets email', () => {
    for (const user of data.users) expect(user.email).toMatch(/^[a-z.]+@demo\.smu\.edu\.sg$/)
    for (const user of data.users) expect(user.alertsOn).toBe(false)
  })

  it('uses real categories and colours, at most 3 colours each', () => {
    for (const item of data.items) {
      expect(categoryNames.has(item.category)).toBe(true)
      expect(item.colours.length).toBeLessThanOrEqual(3)
      for (const colour of item.colours) expect(colourNames.has(colour)).toBe(true)
    }
  })

  it('gives a found report one trail point and a lost report 1 to 10', () => {
    for (const item of data.items) {
      if (item.type === 'found') expect(item.trail).toHaveLength(1)
      else expect(item.trail.length).toBeGreaterThanOrEqual(1)
      expect(item.trail.length).toBeLessThanOrEqual(10)
    }
  })

  it('puts everything in the past except a planned meetup', () => {
    const now = NOW.toISOString()
    for (const item of data.items) expect(item.createdAt < now).toBe(true)
    for (const message of data.messages) expect(message.sentAt < now).toBe(true)
    for (const handoff of data.handoffs) {
      for (const time of [handoff.createdAt, handoff.handedOverAt, handoff.completedAt]) {
        if (time) expect(time < now).toBe(true)
      }
    }
  })

  it('posts each report after the times on its trail', () => {
    for (const item of data.items) {
      for (const point of item.trail) expect(point.to <= item.createdAt).toBe(true)
    }
  })

  it('leaves every claimed pair matched by the engine at 50 or more', () => {
    for (const claim of data.claims) {
      const match = data.matches.find((entry) => entry.lost === claim.lost && entry.found === claim.found)
      expect(match.score).toBeGreaterThanOrEqual(50)
    }
  })

  it('leaves no handoff older than 7 days waiting, so the daily job does not complete it', () => {
    const weekAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    for (const handoff of data.handoffs.filter((entry) => entry.status === 'handed_over')) {
      expect(handoff.handedOverAt > weekAgo).toBe(true)
    }
  })

  it('has 3 or more finds in at least three buildings within 5 days, for the hotspot map', () => {
    const fiveDaysAgo = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const spotById = new Map(seed.spots.map((spot) => [spot.id, spot]))
    const perBuilding = new Map()
    for (const item of data.items) {
      if (item.type !== 'found' || item.status === 'removed' || item.createdAt < fiveDaysAgo) continue
      const building = spotById.get(item.trail[0].spotId).building
      perBuilding.set(building, (perBuilding.get(building) || 0) + 1)
    }
    expect([...perBuilding.values()].filter((count) => count >= 3).length).toBeGreaterThanOrEqual(3)
  })

  it('leaves the stories in the states the demo needs', () => {
    expect(itemByKey.get('bottle-lost').status).toBe('resolved')
    expect(itemByKey.get('charger-found').status).toBe('matched')
    expect(itemByKey.get('backpack-lost').status).toBe('open')
    expect(itemByKey.get('calc-lost').status).toBe('open')
    expect(itemByKey.get('airpods-priya').status).toBe('open')
    expect(itemByKey.get('textbook-ad').status).toBe('removed')
    const ryan = data.users.find((user) => user.key === 'ryan')
    expect(data.appeals[0].suspendedAt).toBe(ryan.suspendedAt)
    expect(data.messages.find((message) => message.key === 'paynow').removedAt).not.toBeNull()
  })
})
