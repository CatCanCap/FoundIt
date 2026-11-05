import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { checkSeedTarget } = require('../../lib/seed-guard')

describe('checkSeedTarget', () => {
  it('allows the test database without extra flags', () => {
    expect(checkSeedTarget({ target: 'test', wantsLive: false, confirmed: false })).toBe(null)
  })

  it('allows the live database only with --live and --yes', () => {
    expect(checkSeedTarget({ target: 'live', wantsLive: true, confirmed: true })).toBe(null)
    expect(checkSeedTarget({ target: 'live', wantsLive: true, confirmed: false })).toMatch(/--yes/)
  })

  it('refuses when the settings file and the command disagree', () => {
    expect(checkSeedTarget({ target: 'live', wantsLive: false, confirmed: true })).toMatch(/Refusing/)
    expect(checkSeedTarget({ target: 'test', wantsLive: true, confirmed: true })).toMatch(/Refusing/)
  })

  it.each([undefined, '', 'prod', 'TEST'])('refuses when DB_TARGET is %s', (target) => {
    expect(checkSeedTarget({ target, wantsLive: false, confirmed: false })).toMatch(/DB_TARGET/)
    expect(checkSeedTarget({ target, wantsLive: true, confirmed: true })).toMatch(/DB_TARGET/)
  })
})
