import { describe, it, expect } from 'vitest'
import { applySuggestions, suggestionBadge } from '../vision'

const suggestions = {
  category: { value: 'Water Bottle', confidence: 96 },
  colour: { value: 'Navy', confidence: 88 },
  brand: { value: 'Hydro Flask', confidence: 61 },
}

describe('applySuggestions', () => {
  it('fills every empty field and makes a tag for each, in form order', () => {
    const { values, tags } = applySuggestions({ category: '', colour: '', brand: '' }, suggestions)
    expect(values).toEqual({ category: 'Water Bottle', colour: 'Navy', brand: 'Hydro Flask' })
    expect(tags.map((tag) => tag.field)).toEqual(['category', 'colour', 'brand'])
    expect(tags[0]).toEqual({
      field: 'category',
      label: 'Category',
      value: 'Water Bottle',
      confidence: 96,
    })
  })

  it('never overwrites what the finder already filled in', () => {
    const { values, tags } = applySuggestions(
      { category: 'Umbrella', colour: '', brand: '  ' },
      suggestions,
    )
    expect(values).toEqual({ colour: 'Navy', brand: 'Hydro Flask' })
    expect(tags).toHaveLength(2)
  })

  it('skips fields Vision could not suggest', () => {
    const { tags } = applySuggestions(
      { category: '', colour: '', brand: '' },
      { category: null, colour: { value: 'Red', confidence: 70 }, brand: null },
    )
    expect(tags.map((tag) => tag.field)).toEqual(['colour'])
    expect(applySuggestions({}, null)).toEqual({ values: {}, tags: [] })
  })
})

describe('suggestionBadge', () => {
  it('says "From photo" when Vision was fairly sure, "Unsure" when guessing', () => {
    expect(suggestionBadge(96)).toBe('From photo')
    expect(suggestionBadge(70)).toBe('From photo')
    expect(suggestionBadge(61)).toBe('Unsure')
  })
})
