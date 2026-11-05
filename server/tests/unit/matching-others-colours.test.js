import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { scorePair, weightsFor, WEIGHTS } = require('../../matching')
const { categoryScore, isOther } = require('../../matching/category')
const { attributeScore } = require('../../matching/attributes')
const { itemColours, colourListScore } = require('../../matching/colours')
const { loadSeed } = require('../../data/load')

const seed = loadSeed()
const context = { spots: seed.spots, categories: seed.categories, colours: seed.colours }
const spotsById = new Map(seed.spots.map((spot) => [spot.id, spot]))

// A lost and a found report at the same spot within the hour, so only
// category and attributes differ between the tests below
function report(type, fields) {
  return {
    id: type === 'lost' ? 1 : 2,
    type,
    title: 'Pouch',
    description: '',
    colour: null,
    brand: null,
    postedBy: type === 'lost' ? 1 : 2,
    trail: [{ spotId: 5, from: '2026-10-20T02:00:00Z', to: '2026-10-20T03:00:00Z' }],
    ...fields,
  }
}

describe('itemColours', () => {
  it('reads a list of colours, or the single colour items store today', () => {
    expect(itemColours({ colours: ['Black', 'Red'] })).toEqual(['Black', 'Red'])
    expect(itemColours({ colour: 'Navy' })).toEqual(['Navy'])
    expect(itemColours({ colours: [], colour: 'Navy' })).toEqual(['Navy'])
    expect(itemColours({ colour: null })).toEqual([])
  })

  it('drops blanks and repeats and keeps at most three', () => {
    expect(itemColours({ colours: ['Black', '', 'Black', 'Red', 'White', 'Blue'] })).toEqual([
      'Black',
      'Red',
      'White',
    ])
  })
})

describe('colourListScore', () => {
  it('scores one same colour 100', () => {
    expect(colourListScore(['Black'], ['Black'], seed.colours)).toEqual({
      score: 100,
      reasons: [{ lead: 'same colour', detail: '' }],
    })
  })

  it('scores the same colours in any order 100', () => {
    expect(colourListScore(['Black', 'Red'], ['Red', 'Black'], seed.colours)).toEqual({
      score: 100,
      reasons: [{ lead: 'same colours', detail: '' }],
    })
  })

  it('gives most of the credit when one side names only some of the colours, either way round', () => {
    const ownerMore = colourListScore(['Black', 'Red'], ['Black'], seed.colours)
    const finderMore = colourListScore(['Black'], ['Black', 'Red'], seed.colours)
    expect(ownerMore).toEqual({ score: 87.5, reasons: [{ lead: 'both have', detail: 'Black' }] })
    expect(finderMore.score).toBe(87.5)
  })

  it('gives partial credit for related colours', () => {
    expect(colourListScore(['Navy'], ['Blue'], seed.colours)).toEqual({
      score: 50,
      reasons: [{ lead: 'similar colour', detail: 'Navy and Blue' }],
    })
  })

  it('scores colours with nothing in common 0, with no reason', () => {
    expect(colourListScore(['Green'], ['Red', 'White'], seed.colours)).toEqual({
      score: 0,
      reasons: [],
    })
  })

  it('leaves colour out when either side has none', () => {
    expect(colourListScore([], ['Black'], seed.colours).score).toBeNull()
  })
})

describe('attributeScore with several colours', () => {
  it('uses every colour on each report', () => {
    const lost = { title: 'Tote', description: '', colours: ['Beige', 'Navy'], brand: null }
    const found = { title: 'Tote', description: '', colour: 'Navy', brand: null }
    const result = attributeScore(lost, found, seed.colours)
    expect(result.parts.colour).toBe(87.5)
    expect(result.reasons).toContainEqual({ lead: 'both have', detail: 'Navy' })
  })
})

describe("the 'Other' category", () => {
  it('is in the category list', () => {
    expect(seed.categories.map((category) => category.name)).toContain('Other')
    expect(isOther('Other')).toBe(true)
    expect(isOther('Bag')).toBe(false)
  })

  it('still scores two Other reports 100, but gives no "same category" reason', () => {
    expect(categoryScore('Other', 'Other', seed.categories)).toEqual({ score: 100, reasons: [] })
  })

  it('keeps a third of the category weight and moves the rest to attributes', () => {
    const others = weightsFor({ category: 'Other' }, { category: 'Bag' }, WEIGHTS)
    expect(others.C).toBeCloseTo(WEIGHTS.C / 3)
    expect(others.A).toBeCloseTo(WEIGHTS.A + (WEIGHTS.C * 2) / 3)
    expect(others.L).toBe(WEIGHTS.L)
    expect(others.D).toBe(WEIGHTS.D)
    expect(others.C + others.A + others.L + others.D).toBeCloseTo(1)
  })

  it('leaves the weights alone when neither report is Other', () => {
    expect(weightsFor({ category: 'Bag' }, { category: 'Bag' }, WEIGHTS)).toBe(WEIGHTS)
  })

  it('never matches two unlike Other reports that only share a colour', () => {
    const fields = (category, title) => ({ category, title, colour: 'Black' })
    const others = scorePair(
      report('lost', fields('Other', 'Black pouch')),
      report('found', fields('Other', 'Black yoga mat')),
      context,
      spotsById,
    )
    const bags = scorePair(
      report('lost', fields('Bag', 'Black pouch')),
      report('found', fields('Bag', 'Black yoga mat')),
      context,
      spotsById,
    )
    expect(others).toBeNull()
    expect(bags).not.toBeNull()
  })

  it('matches a well described find when the owner picked Other, but not an unrelated category', () => {
    const lost = (category) =>
      report('lost', {
        category,
        title: 'Black Lego pouch',
        description: 'Zip pouch with a Lego keychain and a broken zip pull',
        colour: 'Black',
      })
    const found = report('found', {
      category: 'Bag',
      title: 'Black pouch with Lego keychain',
      description: 'Small zip pouch, broken zip pull',
      colour: 'Black',
    })
    const fromOther = scorePair(lost('Other'), found, context, spotsById)
    const fromKeys = scorePair(lost('Keys'), found, context, spotsById)
    expect(fromOther).not.toBeNull()
    expect(fromKeys).toBeNull()
  })
})
