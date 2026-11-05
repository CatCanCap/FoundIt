import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret'
const { hash, compare } = require('../../lib/hash')
const { sign, read, passwordStamp } = require('../../lib/token')

describe('hash', () => {
  it('produces a hash that matches only the original text', async () => {
    const hashed = await hash('correct horse')
    expect(hashed).not.toBe('correct horse')
    expect(await compare('correct horse', hashed)).toBe(true)
    expect(await compare('wrong horse', hashed)).toBe(false)
  })
})

describe('token', () => {
  it('round-trips a user id', () => {
    expect(read(sign(42)).id).toBe(42)
  })

  it('returns null for a tampered or missing token', () => {
    expect(read(sign(42) + 'x')).toBe(null)
    expect(read(undefined)).toBe(null)
    expect(read('not-a-token')).toBe(null)
  })
})

describe('token fingerprint', () => {
  it('carries a fingerprint of the password hash', () => {
    expect(read(sign(42, 'hash-a'))).toEqual({ id: 42, pw: passwordStamp('hash-a') })
  })

  it('changes the fingerprint when the password changes', () => {
    expect(passwordStamp('hash-a')).not.toBe(passwordStamp('hash-b'))
    expect(passwordStamp('hash-a')).toBe(passwordStamp('hash-a'))
  })

  it('never contains the password hash itself', () => {
    const stamp = passwordStamp('$2b$10$abcdefghijklmnopqrstuv')
    expect(stamp).toHaveLength(16)
    expect('$2b$10$abcdefghijklmnopqrstuv').not.toContain(stamp)
  })
})
