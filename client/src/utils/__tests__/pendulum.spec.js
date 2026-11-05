import { describe, it, expect } from 'vitest'
import { angleFromPivot, clampAngle, isAtRest, stepPendulum } from '../pendulum'

function run(state, seconds) {
  let current = state
  for (let t = 0; t < seconds; t += 1 / 60) current = stepPendulum(current, 1 / 60)
  return current
}

describe('pendulum', () => {
  it('swings back past the middle, then settles', () => {
    let state = { angle: 20, speed: 0 }
    let crossed = false
    for (let i = 0; i < 60; i += 1) {
      state = stepPendulum(state, 1 / 60)
      if (state.angle < 0) crossed = true
    }
    expect(crossed).toBe(true)
    expect(isAtRest(run({ angle: 20, speed: 0 }, 6))).toBe(true)
  })

  it('starts swinging from a push', () => {
    const state = run({ angle: 0, speed: 80 }, 0.1)
    expect(state.angle).toBeGreaterThan(2)
  })

  it('does not fly off after a long pause between frames', () => {
    const state = stepPendulum({ angle: 10, speed: 0 }, 5)
    expect(Math.abs(state.angle)).toBeLessThan(10)
  })

  it('measures the pointer angle so the bottom follows the pointer', () => {
    const pivot = { x: 100, y: 0 }
    expect(angleFromPivot(pivot, { x: 100, y: 200 })).toBeCloseTo(0)
    expect(angleFromPivot(pivot, { x: 300, y: 200 })).toBeCloseTo(-45)
    expect(angleFromPivot(pivot, { x: -100, y: 200 })).toBeCloseTo(45)
    expect(clampAngle(80)).toBe(35)
    expect(clampAngle(-80)).toBe(-35)
  })
})
