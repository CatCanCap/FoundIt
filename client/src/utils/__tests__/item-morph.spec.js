import { describe, it, expect, afterEach, vi } from 'vitest'
import { noteCardTap, takeCardSeed, tappedPicture } from '../item-morph'

const PATH = '/items/7/record'
const SEED = { title: 'Navy flask', category: 'Water Bottle', photoUrl: '', tone: '#123' }
const click = (extra = {}) => ({ button: 0, ...extra })

function picture() {
  const element = document.createElement('span')
  document.body.append(element)
  return element
}

function allowMotion(allowed = true) {
  document.startViewTransition = vi.fn()
  window.matchMedia = vi.fn(() => ({ matches: allowed }))
}

afterEach(() => {
  takeCardSeed(PATH)
  delete document.startViewTransition
  delete window.matchMedia
  document.body.innerHTML = ''
})

describe('item-morph', () => {
  it('hands the tapped card’s details to the item page, once', () => {
    noteCardTap(click(), PATH, picture(), SEED)
    expect(takeCardSeed('/items/8/record')).toBeNull()

    noteCardTap(click(), PATH, picture(), SEED)
    expect(takeCardSeed(PATH)).toEqual(SEED)
    expect(takeCardSeed(PATH)).toBeNull()
  })

  it('ignores a click that opens a new tab or is not the main button', () => {
    for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      noteCardTap(click(extra), PATH, picture(), SEED)
      expect(takeCardSeed(PATH)).toBeNull()
    }
  })

  it('grows the picture only for the page the card opens', () => {
    allowMotion()
    const element = picture()
    noteCardTap(click(), PATH, element, SEED)
    expect(tappedPicture(PATH)).toBe(element)
    expect(tappedPicture('/items/8/record')).toBeNull()
  })

  it('falls back to the fade in a browser without View Transitions', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }))
    noteCardTap(click(), PATH, picture(), SEED)
    expect(tappedPicture(PATH)).toBeNull()
    // The item page still gets the picture straight away
    expect(takeCardSeed(PATH)).toEqual(SEED)
  })

  it('falls back to the fade for people who ask for less motion', () => {
    allowMotion(false)
    noteCardTap(click(), PATH, picture(), SEED)
    expect(tappedPicture(PATH)).toBeNull()
  })

  it('has nothing to grow once the card has left the page', () => {
    allowMotion()
    const element = picture()
    noteCardTap(click(), PATH, element, SEED)
    element.remove()
    expect(tappedPicture(PATH)).toBeNull()
  })
})
