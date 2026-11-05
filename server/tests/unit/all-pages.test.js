import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { allPages, PAGE_SIZE } = require('../../lib/all-pages')

// A stand-in for a supabase query over `total` rows: range(from, to) answers
// with that slice, the way the database does
function fakeTable(total) {
  const asked = []
  const makeQuery = () => ({
    range: async (from, to) => {
      asked.push([from, to])
      const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ id: from + i + 1 }))
      return { data, error: null }
    },
  })
  return { makeQuery, asked }
}

describe('allPages', () => {
  it('returns every row past the 1000-row cap, in order', async () => {
    const { makeQuery, asked } = fakeTable(2500)
    const rows = await allPages(makeQuery)
    expect(rows).toHaveLength(2500)
    expect(rows.at(-1)).toEqual({ id: 2500 })
    expect(asked).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('asks once more when the last page is exactly full', async () => {
    const { makeQuery, asked } = fakeTable(PAGE_SIZE)
    expect(await allPages(makeQuery)).toHaveLength(PAGE_SIZE)
    expect(asked).toHaveLength(2)
  })

  it('returns an empty list for an empty table', async () => {
    expect(await allPages(fakeTable(0).makeQuery)).toEqual([])
  })

  it('passes a database error on as an http error', async () => {
    const makeQuery = () => ({ range: async () => ({ data: null, error: { code: '22P02' } }) })
    await expect(allPages(makeQuery)).rejects.toMatchObject({ status: 400 })
  })
})
