// Several colours per item: reading them from a request, from a stored item,
// and scoring them in matching. No database.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret'
const { parseColours } = require('../../lib/colours')
const { coloursOf: storedColours } = require('../../models/item-model')
const { colourListScore, itemColours } = require('../../matching/colours')
const { attributeScore } = require('../../matching/attributes')
const list = require('../../data/colours.json')

describe('parseColours', () => {
  it('reads up to 3 colours, spelt the way the list spells them', () => {
    expect(parseColours({ colours: ['navy', ' White '] }, list)).toEqual(['Navy', 'White'])
    expect(parseColours({ colours: ['Black', 'Red', 'Gold'] }, list)).toHaveLength(3)
  })

  it('still takes the older single colour, and lets either clear the colours', () => {
    expect(parseColours({ colour: 'grey' }, list)).toEqual(['Grey'])
    expect(parseColours({ colour: '' }, list)).toEqual([])
    expect(parseColours({ colours: [] }, list)).toEqual([])
    expect(parseColours({ colours: null }, list)).toEqual([])
    expect(parseColours({}, list)).toBe(undefined)
  })

  it('prefers the list when both are sent', () => {
    expect(parseColours({ colours: ['Blue'], colour: 'Red' }, list)).toEqual(['Blue'])
  })

  it('refuses more than 3, repeats, names not on the list and non-lists', () => {
    expect(() => parseColours({ colours: ['Black', 'Red', 'Gold', 'Blue'] }, list)).toThrow('up to 3')
    expect(() => parseColours({ colours: ['Black', 'black'] }, list)).toThrow('only once')
    expect(() => parseColours({ colours: ['Turquoise'] }, list)).toThrow('from the list')
    expect(() => parseColours({ colours: 'Black' }, list)).toThrow('list of colour names')
    expect(() => parseColours({ colour: 7 }, list)).toThrow('from the list')
  })
})

describe('an item as stored', () => {
  it('lists its colours main colour first, or falls back to items.colour', () => {
    const rows = [{ colour: 'White', position: 2 }, { colour: 'Navy', position: 1 }]
    expect(storedColours(rows, 'Navy')).toEqual(['Navy', 'White'])
    expect(storedColours([], 'Black')).toEqual(['Black'])
    expect(storedColours(undefined, null)).toEqual([])
  })
})

describe('matching several colours', () => {
  it('scores two colour lists with colourListScore: each colour finds its best partner', () => {
    // Every colour has a partner both ways
    expect(colourListScore(['Navy', 'White'], ['White', 'Navy'], list)).toEqual({ score: 100, reasons: [{ lead: 'same colours', detail: '' }] })
    // One shared colour each side: half the colours have a partner either way
    expect(colourListScore(['Navy', 'White'], ['Red', 'White'], list).score).toBe(50)
    // Only a related pair: Navy and Blue
    expect(colourListScore(['Navy'], ['Pink', 'Blue'], list).score).toBe(43.75)
    expect(colourListScore(['Green'], ['Red'], list)).toEqual({ score: 0, reasons: [] })
    expect(colourListScore([], ['Red'], list)).toEqual({ score: null, reasons: [] })
  })

  it('reads colours, or the older single colour', () => {
    expect(itemColours({ colours: ['Navy', 'White'], colour: 'Navy' })).toEqual(['Navy', 'White'])
    expect(itemColours({ colour: 'Black' })).toEqual(['Black'])
    expect(itemColours({})).toEqual([])
  })

  it('gives a finder who saw only one of the colours most of the colour marks', () => {
    const bag = { title: 'Tote bag', description: '', category: 'Bag', colours: ['Navy', 'White'] }
    const found = { title: 'Bag', description: '', category: 'Bag', colours: ['White'] }
    const result = attributeScore(bag, found, list)
    expect(result.parts.colour).toBe(87.5)
    expect(result.reasons).toContainEqual({ lead: 'both have', detail: 'White' })
  })

  it('names the related pair it used', () => {
    const lost = { title: 'Bottle', description: '', colours: ['Green', 'Navy'] }
    const found = { title: 'Bottle', description: '', colours: ['Blue'] }
    expect(attributeScore(lost, found, list).reasons).toContainEqual({ lead: 'similar colour', detail: 'Navy and Blue' })
  })
})
