import { describe, it, expect } from 'vitest'
import serverColours from '../../../../server/data/colours.json'
import {
  COLOUR_HEX,
  categoryColour,
  categoryFamily,
  categoryIcon,
  initials,
  itemIconColour,
  ledgerNumber,
  itemDigits,
  itemNumber,
  placeName,
  mainColour,
  statusPill,
} from '../design'

describe('design lookups', () => {
  it('puts every category in the Figma colour family', () => {
    expect(categoryFamily('Laptop')).toBe('electronics')
    expect(categoryFamily('Water Bottle')).toBe('bottles')
    expect(categoryFamily('Student Card')).toBe('cards')
    expect(categoryFamily('Clothing')).toBe('other')
    expect(categoryFamily(undefined)).toBe('other')
    expect(categoryColour('Umbrella')).toBe('var(--fi-cat-umbrellas)')
  })

  it('draws an item in its main colour, or a neutral slate', () => {
    expect(itemIconColour('Black')).toBe('#1a1a1a')
    expect(itemIconColour('Clear')).toBe('var(--fi-cat-other)')
    expect(itemIconColour(undefined)).toBe('var(--fi-cat-other)')
  })

  it('keeps the same swatches as the server colour list', () => {
    const withHex = serverColours.filter((colour) => colour.hex)
    expect(COLOUR_HEX).toEqual(Object.fromEntries(withHex.map((c) => [c.name, c.hex])))
  })

  it('finds an item main colour, old single colour included', () => {
    expect(mainColour({ colours: ['Navy', 'White'], colour: 'Navy' })).toBe('Navy')
    expect(mainColour({ colours: [], colour: 'Black' })).toBe('Black')
    expect(mainColour({})).toBe('')
    expect(mainColour(undefined)).toBe('')
  })

  it('picks a drawing, falling back to a plain tag', () => {
    expect(categoryIcon('Headphones')).toBe('earbuds')
    expect(categoryIcon('Stationery')).toBe('tag')
  })

  it('names each item state on its pill', () => {
    expect(statusPill('open')).toEqual({ label: 'Waiting for its owner', tone: 'brass' })
    expect(statusPill('returned').tone).toBe('green')
    expect(statusPill('mystery')).toEqual({ label: 'mystery', tone: 'grey' })
  })

  it('makes initials and ledger numbers', () => {
    expect(initials('Wei Ling Tan')).toBe('WL')
    expect(initials('  alex ')).toBe('A')
    expect(initials(null)).toBe('')
    expect(ledgerNumber(7)).toBe('0007')
    expect(ledgerNumber(3307)).toBe('3307')
  })

  it('numbers every item as four digits, found or lost, the same on every page', () => {
    expect(itemDigits(42)).toBe('0042')
    expect(itemNumber({ id: 42, type: 'lost' })).toBe('0042')
    expect(itemNumber({ id: 42, type: 'found' })).toBe('0042')
    expect(itemNumber({ id: 3307 })).toBe('3307')
  })

  it("names a place by its building's short name, with the level and facility when full", () => {
    const spot = { building: 'Li Ka Shing Library', floor: 'Level 2', area: 'service desk' }
    expect(placeName(spot)).toBe('LKS Library')
    expect(placeName(spot, { full: true })).toBe('LKS Library, Level 2 · Service Desk')
    expect(placeName({ building: 'SCIS 1', floor: 'Level 1', area: 'lobby' })).toBe('SCIS 1')
    expect(placeName(null)).toBe('Unknown place')
    expect(placeName(undefined, { full: true })).toBe('Unknown place')
  })
})
