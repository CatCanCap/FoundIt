import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { isSameReport } = require('../../lib/same-report')

// The lost tablet a student posted four times on 2026-11-04
function tablet(changes = {}) {
  return {
    type: 'lost',
    title: 'Purple Apple tablet',
    description: 'iPad mini, purple case, scratch on one corner',
    category: 'Tablet',
    brand: 'Apple',
    colours: ['Purple'],
    photoUrl: null,
    trail: [
      { spotId: 6, roomId: null, from: '2026-11-04T07:30:00.000Z', to: '2026-11-04T10:00:00.000Z' },
      { spotId: 80, roomId: null, from: '2026-11-04T09:00:00.000Z', to: '2026-11-04T11:30:00.000Z' },
    ],
    ...changes,
  }
}

describe('isSameReport', () => {
  it('counts the same report sent again as the same', () => {
    expect(isSameReport(tablet(), tablet())).toBe(true)
  })

  it('still counts it when only the times or the photo changed', () => {
    const nudged = tablet({
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/other.jpg',
      trail: [
        { spotId: 6, roomId: null, from: '2026-11-04T07:45:00.000Z', to: '2026-11-04T09:45:00.000Z' },
        { spotId: 80, roomId: null, from: '2026-11-04T09:15:00.000Z', to: '2026-11-04T11:15:00.000Z' },
      ],
    })
    expect(isSameReport(tablet(), nudged)).toBe(true)
  })

  it('ignores case and extra spaces in the text, and a missing brand or description', () => {
    expect(isSameReport(tablet({ brand: null, description: '' }), tablet({ brand: '', description: undefined })))
      .toBe(true)
    expect(isSameReport(tablet(), tablet({ title: '  purple apple   TABLET ' }))).toBe(true)
  })

  it('treats a different report as new', () => {
    expect(isSameReport(tablet(), tablet({ type: 'found' }))).toBe(false)
    expect(isSameReport(tablet(), tablet({ title: 'Purple Apple tablet (2)' }))).toBe(false)
    expect(isSameReport(tablet(), tablet({ description: 'iPad mini, blue case' }))).toBe(false)
    expect(isSameReport(tablet(), tablet({ category: 'Laptop' }))).toBe(false)
    expect(isSameReport(tablet(), tablet({ colours: ['Purple', 'White'] }))).toBe(false)
    expect(isSameReport(tablet(), tablet({ trail: [tablet().trail[0]] }))).toBe(false)
    const otherRoom = tablet().trail.map((point, index) => (index === 0 ? { ...point, roomId: 12 } : point))
    expect(isSameReport(tablet(), tablet({ trail: otherRoom }))).toBe(false)
  })
})
