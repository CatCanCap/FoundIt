import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret'
const { chatChannel } = require('../../lib/chat-channel')

describe('chatChannel', () => {
  it('gives the same name for the same match every time', () => {
    expect(chatChannel(7)).toBe(chatChannel(7))
  })

  it('gives each match a different name that cannot be guessed from the id', () => {
    expect(chatChannel(7)).not.toBe(chatChannel(8))
    expect(chatChannel(7)).toMatch(/^chat-7-[0-9a-f]{32}$/)
  })
})
