import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { colourScore } = require('../../matching/colours')
const { loadSeed } = require('../../data/load')

const { colours } = loadSeed()

describe('colourScore', () => {
  it('scores the same colour 100', () => {
    expect(colourScore('Black', 'Black', colours)).toBe(100)
  })

  it('scores a related colour 50 from either side', () => {
    expect(colourScore('Navy', 'Blue', colours)).toBe(50)
    expect(colourScore('Blue', 'Navy', colours)).toBe(50)
  })

  it('scores an unrelated colour 0', () => {
    expect(colourScore('Green', 'Black', colours)).toBe(0)
  })

  it('returns null when either side has no colour', () => {
    expect(colourScore(null, 'Black', colours)).toBeNull()
    expect(colourScore('Black', undefined, colours)).toBeNull()
  })
})
