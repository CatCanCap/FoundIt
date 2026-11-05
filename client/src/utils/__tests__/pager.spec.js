import { describe, it, expect } from 'vitest'
import { pageNumbers } from '../pager'

describe('pageNumbers', () => {
  it('shows every page number when there are 7 or fewer', () => {
    expect(pageNumbers(1, 1)).toEqual([1])
    expect(pageNumbers(2, 6)).toEqual([1, 2, 3, 4, 5, 6])
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('shortens a long row with gaps, keeping the first, last and nearby pages', () => {
    expect(pageNumbers(1, 10)).toEqual([1, 2, 3, 4, 5, '…', 10])
    expect(pageNumbers(4, 10)).toEqual([1, 2, 3, 4, 5, '…', 10])
    expect(pageNumbers(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10])
    expect(pageNumbers(7, 10)).toEqual([1, '…', 6, 7, 8, 9, 10])
    expect(pageNumbers(10, 10)).toEqual([1, '…', 6, 7, 8, 9, 10])
  })

  it('shows a single missing page instead of a gap', () => {
    // 1 … 3 would hide only page 2
    expect(pageNumbers(4, 12)).toEqual([1, 2, 3, 4, 5, '…', 12])
    expect(pageNumbers(9, 12)).toEqual([1, '…', 8, 9, 10, 11, 12])
    expect(pageNumbers(6, 12)).toEqual([1, '…', 5, 6, 7, '…', 12])
  })

  it('never shows more than 7 buttons', () => {
    for (let page = 1; page <= 40; page += 1) {
      expect(pageNumbers(page, 40).length).toBeLessThanOrEqual(7)
      expect(pageNumbers(page, 40)).toContain(page)
    }
  })
})
