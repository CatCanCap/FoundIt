import { describe, it, expect } from 'vitest'
import {
  toLocalDate,
  toLocalTime,
  singaporeDate,
  singaporeTime,
  itemTitle,
  itemName,
  checkItemStep,
  buildFoundItem,
  fieldOfError,
  sortCategories,
  OTHER,
} from '../report'

function form(overrides = {}) {
  return {
    category: 'Water Bottle',
    colours: ['Navy'],
    brand: ' Hydro Flask ',
    description: ' Small sticker of a cat near the base ',
    spotId: '5',
    date: '2026-10-08',
    time: '10:00',
    ...overrides,
  }
}

const now = new Date('2026-10-09T12:00:00+08:00')

describe('toLocalDate and toLocalTime', () => {
  it('format a date for the date and time inputs', () => {
    const date = new Date(2026, 9, 9, 8, 5)
    expect(toLocalDate(date)).toBe('2026-10-09')
    expect(toLocalTime(date)).toBe('08:05')
  })
})

describe('singaporeDate and singaporeTime', () => {
  it("give the date and time in Singapore, whatever the device's timezone", () => {
    // 20:30 on the 8th in London is 04:30 on the 9th in Singapore
    const date = new Date('2026-10-08T20:30:00Z')
    expect(singaporeDate(date)).toBe('2026-10-09')
    expect(singaporeTime(date)).toBe('04:30')
  })

  it('writes midnight as 00:00', () => {
    expect(singaporeTime(new Date('2026-10-08T16:05:00Z'))).toBe('00:05')
  })
})

describe('itemTitle', () => {
  it('makes a title from colour, brand and category', () => {
    expect(itemTitle(form())).toBe('Navy Hydro Flask water bottle')
  })

  it('leaves out what is missing', () => {
    expect(itemTitle({ category: 'Umbrella', colours: [], brand: '' })).toBe('Umbrella')
    expect(itemTitle({ category: 'Wallet', colours: ['Brown'], brand: '  ' })).toBe('Brown wallet')
  })

  it('uses only the main colour', () => {
    expect(itemTitle(form({ colours: ['Navy', 'White'] }))).toBe('Navy Hydro Flask water bottle')
  })

  it('makes no name for Other, since "Other" would tell the owner nothing', () => {
    expect(itemTitle(form({ category: OTHER }))).toBe('')
    expect(itemTitle({ category: '', colours: ['Navy'], brand: '' })).toBe('')
  })
})

describe('sortCategories', () => {
  it('sorts A to Z with Other last', () => {
    const names = sortCategories([
      { name: 'Wallet' },
      { name: 'Other' },
      { name: 'Bag' },
      { name: 'Laptop' },
    ]).map((category) => category.name)
    expect(names).toEqual(['Bag', 'Laptop', 'Wallet', 'Other'])
  })
})

describe('itemName', () => {
  it('uses the name the finder typed, or the one made from the details', () => {
    expect(itemName(form({ title: '  Navy Hydro Flask, 750 ml ' }))).toBe(
      'Navy Hydro Flask, 750 ml',
    )
    expect(itemName(form({ title: '   ' }))).toBe('Navy Hydro Flask water bottle')
    expect(itemName(form())).toBe('Navy Hydro Flask water bottle')
  })
})

describe('checkItemStep', () => {
  it('needs a category before step 2', () => {
    expect(checkItemStep(form({ category: '' }))).toBe('Pick a category.')
    expect(checkItemStep(form())).toBeNull()
  })

  it('needs a name the finder typed when the category is Other', () => {
    expect(checkItemStep(form({ category: OTHER, title: '  ' }))).toBe(
      'Say what it is, for example a silver ring.',
    )
    expect(checkItemStep(form({ category: OTHER, title: 'Silver ring' }))).toBeNull()
  })

  it('limits the item name to 100 characters', () => {
    expect(checkItemStep(form({ title: 'x'.repeat(101) }))).toBe(
      'Keep the item name to 100 characters or fewer.',
    )
  })

  it('limits the brand to 50 characters', () => {
    expect(checkItemStep(form({ brand: 'x'.repeat(51) }))).toBe(
      'Keep the brand to 50 characters or fewer.',
    )
  })
})

describe('buildFoundItem', () => {
  it('builds a found item with one trail point at the time it was found', () => {
    const { body, error } = buildFoundItem(form(), now)
    expect(error).toBeUndefined()
    // 10:00 in Singapore is 02:00 UTC
    const when = '2026-10-08T02:00:00.000Z'
    expect(body).toEqual({
      type: 'found',
      title: 'Navy Hydro Flask water bottle',
      description: 'Small sticker of a cat near the base',
      category: 'Water Bottle',
      colours: ['Navy'],
      brand: 'Hydro Flask',
      trail: [{ spotId: 5, from: when, to: when }],
    })
    // The API needs a timezone on every date
    expect(body.trail[0].from).toMatch(/Z$/)
  })

  it('sends up to 3 colours, main colour first, or none', () => {
    expect(buildFoundItem(form({ colours: ['Navy', 'White'] }), now).body.colours).toEqual([
      'Navy',
      'White',
    ])
    expect(buildFoundItem(form({ colours: [] }), now).body.colours).toEqual([])
    expect(buildFoundItem(form(), now).body).not.toHaveProperty('colour')
  })

  it('posts the name the finder typed', () => {
    expect(buildFoundItem(form({ title: 'My flask' }), now).body.title).toBe('My flask')
  })

  it('never sends a hidden question (the final proposal dropped it)', () => {
    const { body } = buildFoundItem(form(), now)
    expect(body).not.toHaveProperty('claimQuestion')
    expect(body).not.toHaveProperty('claimAnswer')
  })

  it('sends the photo link only when there is one', () => {
    expect(buildFoundItem(form(), now).body).not.toHaveProperty('photoUrl')
    const url = 'https://res.cloudinary.com/demo/image/upload/a.jpg'
    expect(buildFoundItem(form({ photoUrl: url }), now).body.photoUrl).toBe(url)
  })

  it.each([
    [{ category: '' }, 'Pick a category.'],
    [{ spotId: '' }, 'Pick where you found it on the map.'],
    [{ date: '' }, 'Say when you found it.'],
    [{ time: '' }, 'Say when you found it.'],
    [{ date: '2026-10-10' }, 'The time you found it cannot be in the future.'],
  ])('refuses %o', (overrides, message) => {
    expect(buildFoundItem(form(overrides), now)).toEqual({ error: message })
  })
})

describe('fieldOfError', () => {
  it('names the field each problem is about, so it shows under that field', () => {
    expect(fieldOfError('Pick a category.')).toBe('category')
    expect(fieldOfError('Say what it is, for example a silver ring.')).toBe('title')
    expect(fieldOfError('Keep the brand to 50 characters or fewer.')).toBe('brand')
    expect(fieldOfError('Pick where you found it on the map.')).toBe('building')
    expect(fieldOfError('Say when you found it.')).toBe('date')
    // A problem about the whole form stays by the buttons
    expect(fieldOfError('Could not reach the server. Please try again.')).toBe('')
    expect(fieldOfError(null)).toBe('')
  })
})
