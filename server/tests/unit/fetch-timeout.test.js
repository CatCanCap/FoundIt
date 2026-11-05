import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { DB_TIMEOUT_MS, fetchWithTimeout } = require('../../lib/fetch-timeout')

// A fake fetch that never answers on its own, like a stalled connection: it
// only settles when its signal aborts
function stalledFetch(input, init) {
  return new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason))
  })
}

describe('fetchWithTimeout', () => {
  it('gives up on a request that stalls', async () => {
    const started = Date.now()
    await expect(fetchWithTimeout(30, stalledFetch)('https://db.example')).rejects.toThrow(
      /timed out|timeout/i,
    )
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('passes an answer that comes in time straight through', async () => {
    const quick = async (input, init) => ({ ok: true, input, method: init.method })
    const answer = await fetchWithTimeout(1000, quick)('https://db.example', { method: 'POST' })
    expect(answer).toEqual({ ok: true, input: 'https://db.example', method: 'POST' })
  })

  it('still stops when the caller cancels first', async () => {
    const caller = new AbortController()
    const request = fetchWithTimeout(5000, stalledFetch)('https://db.example', {
      signal: caller.signal,
    })
    caller.abort(new Error('cancelled by the caller'))
    await expect(request).rejects.toThrow('cancelled by the caller')
  })

  it('allows each attempt 5 seconds', () => {
    expect(DB_TIMEOUT_MS).toBe(5000)
  })
})
