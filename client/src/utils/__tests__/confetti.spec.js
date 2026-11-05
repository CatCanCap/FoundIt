import { describe, it, expect, vi } from 'vitest'
import { blastConfetti, pieceFlight } from '../confetti'
import { firstSight } from '../first-sight'

describe('pieceFlight', () => {
  it('starts at the middle, stays solid, then fades out completely', () => {
    const { frames, duration } = pieceFlight(() => 0.5)
    expect(frames[0].transform).toBe('translate(0px, 0px) rotate(0deg)')
    expect(frames[0].opacity).toBe(1)
    expect(frames[6].opacity).toBe(1)
    expect(frames.at(-1).opacity).toBe(0)
    expect(duration).toBeGreaterThanOrEqual(1100)
    expect(duration).toBeLessThanOrEqual(1700)
  })

  it('pulls a piece down as it flies', () => {
    // Straight sideways: any height it ends at comes from falling
    const { frames } = pieceFlight(() => 0)
    const y = Number(frames.at(-1).transform.match(/, ([\d.]+)px\)/)[1])
    expect(y).toBeGreaterThan(0)
  })
})

describe('blastConfetti', () => {
  it('removes every piece once it has landed', async () => {
    const host = document.createElement('div')
    let land
    const landed = new Promise((resolve) => (land = resolve))
    window.Element.prototype.animate = vi.fn(() => ({ finished: landed }))

    blastConfetti(host)
    expect(host.querySelectorAll('i').length).toBeGreaterThan(30)

    land()
    await vi.waitFor(() => expect(host.children).toHaveLength(0))
    delete window.Element.prototype.animate
  })

  it('does nothing without a place to start from', () => {
    expect(() => blastConfetti(null)).not.toThrow()
  })
})

describe('firstSight', () => {
  it('is true the first time for each key', () => {
    expect(firstSight('spec-a')).toBe(true)
    expect(firstSight('spec-a')).toBe(false)
    expect(firstSight('spec-b')).toBe(true)
  })
})
