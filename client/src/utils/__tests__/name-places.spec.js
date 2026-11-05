import { describe, it, expect } from 'vitest'
import { NAME_GAP, chooseNameSides, nameBox, offMap, overlap } from '../name-places'

// A 20 x 30 picture standing at (x, bottom)
const art = (x, bottom) => ({ left: x - 10, right: x + 10, top: bottom - 30, bottom })
const marker = (x, bottom, picked = false) => ({
  art: art(x, bottom),
  width: 60,
  height: 20,
  picked,
})

describe('nameBox', () => {
  it('puts the name centred under the picture, a small gap below', () => {
    expect(nameBox(art(100, 100), 'below', 60, 20)).toEqual({
      left: 70,
      top: 100 + NAME_GAP,
      width: 60,
      height: 20,
    })
  })

  it('can put it to the right, the left or above', () => {
    expect(nameBox(art(100, 100), 'right', 60, 20).left).toBe(110 + NAME_GAP)
    expect(nameBox(art(100, 100), 'left', 60, 20).left).toBe(90 - NAME_GAP - 60)
    expect(nameBox(art(100, 100), 'above', 60, 20).top).toBe(70 - NAME_GAP - 20)
  })
})

describe('overlap and offMap', () => {
  it('measures the area two boxes share', () => {
    const a = { left: 0, top: 0, width: 10, height: 10 }
    expect(overlap(a, { left: 5, top: 5, width: 10, height: 10 })).toBe(25)
    expect(overlap(a, { left: 20, top: 0, width: 10, height: 10 })).toBe(0)
  })

  it('measures how much of a box is off the map', () => {
    expect(offMap({ left: -5, top: 0, width: 10, height: 10 }, 100, 100)).toBe(50)
    expect(offMap({ left: 10, top: 10, width: 10, height: 10 }, 100, 100)).toBe(0)
  })
})

describe('chooseNameSides', () => {
  it('puts a name below its picture when there is room', () => {
    expect(chooseNameSides([marker(200, 100)], 400, 400)).toEqual(['below'])
  })

  it('moves a name that would hang off the bottom of the map', () => {
    expect(chooseNameSides([marker(200, 395)], 400, 400)).not.toEqual(['below'])
  })

  it('moves the second of two names that would cover each other', () => {
    // Two buildings side by side: both names below would overlap
    const sides = chooseNameSides([marker(200, 100), marker(230, 100)], 400, 400)
    expect(sides[0]).toBe('below')
    expect(sides[1]).not.toBe('below')
  })

  it('lets the picked building choose first', () => {
    const sides = chooseNameSides([marker(200, 100), marker(230, 100, true)], 400, 400)
    expect(sides[1]).toBe('below')
    expect(sides[0]).not.toBe('below')
  })

  it('answers in the same order as the markers it was given', () => {
    const items = [marker(300, 300), marker(100, 100)]
    expect(chooseNameSides(items, 400, 400)).toHaveLength(2)
    expect(chooseNameSides([], 400, 400)).toEqual([])
  })
})
