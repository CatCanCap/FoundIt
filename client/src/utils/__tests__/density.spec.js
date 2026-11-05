import { describe, it, expect, afterEach } from 'vitest'
import { applyDensity, currentDensity, setDensity } from '../density'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.density
})

describe('density', () => {
  it('is comfortable until compact is picked', () => {
    expect(currentDensity()).toBe('comfortable')
  })

  it('marks <html> for compact and remembers the choice', () => {
    setDensity('compact')
    expect(document.documentElement.dataset.density).toBe('compact')
    expect(currentDensity()).toBe('compact')
    setDensity('comfortable')
    expect(document.documentElement.dataset.density).toBeUndefined()
    expect(currentDensity()).toBe('comfortable')
  })

  it('applies a choice without saving it', () => {
    applyDensity('compact')
    expect(document.documentElement.dataset.density).toBe('compact')
    expect(localStorage.getItem('foundit-density')).toBe(null)
  })
})
