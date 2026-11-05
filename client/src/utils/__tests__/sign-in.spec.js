import { describe, it, expect } from 'vitest'
import {
  confirmProblem,
  emailProblem,
  emailSuggestions,
  isSmuEmail,
  passwordProblem,
  redirectQuery,
  redirectReason,
} from '../sign-in'

describe('sign-in words and checks', () => {
  it('says why a page sent you to sign in', () => {
    expect(redirectReason('/matches')).toBe('Sign in to see your matches.')
    expect(redirectReason('/matches/finds/12')).toBe('Sign in to see your matches.')
    expect(redirectReason('/matches/7/claim')).toBe('Sign in to claim this find.')
    expect(redirectReason('/matches/7/handoff')).toBe('Sign in to see your handoffs.')
    expect(redirectReason('/report/lost')).toBe('Sign in to report an item.')
    expect(redirectReason('/somewhere')).toBe('Sign in to carry on where you were.')
  })

  it('says nothing for home, no redirect or another site', () => {
    expect(redirectReason(undefined)).toBe('')
    expect(redirectReason('/')).toBe('')
    expect(redirectReason('//evil.example.com')).toBe('')
  })

  it('passes on only pages inside the app', () => {
    expect(redirectQuery('/report')).toEqual({ redirect: '/report' })
    expect(redirectQuery('https://evil.example.com')).toEqual({})
    expect(redirectQuery('/')).toEqual({})
  })

  it('checks for an SMU address, subdomains included', () => {
    expect(emailProblem('alice.tan.2025@smu.edu.sg')).toBe('')
    expect(emailProblem('alice@scis.smu.edu.sg')).toBe('')
    expect(emailProblem('alice@gmail.com')).toBe('Use your SMU email, ending in smu.edu.sg.')
    expect(emailProblem('   ')).toBe('')
  })

  it('wants 8 to 72 characters in a password', () => {
    expect(passwordProblem('abc')).toBe('Use at least 8 characters.')
    expect(passwordProblem('secret-123')).toBe('')
    expect(passwordProblem('x'.repeat(73))).toBe('Keep it to 72 characters or fewer.')
    expect(passwordProblem('')).toBe('')
  })

  it('wants the second password box to match the first', () => {
    expect(confirmProblem('secret-123', 'secret-123')).toBe('')
    expect(confirmProblem('secret-123', 'secret-124')).toBe('The two passwords don’t match.')
    expect(confirmProblem('secret-123', '')).toBe('')
  })
})

describe('finishing an SMU address', () => {
  it('offers nothing before the "@", and every SMU address right after it', () => {
    expect(emailSuggestions('')).toEqual([])
    expect(emailSuggestions('alice')).toEqual([])
    expect(emailSuggestions('@smu')).toEqual([])
    expect(emailSuggestions('alice@')).toEqual([
      'alice@smu.edu.sg',
      'alice@scis.smu.edu.sg',
      'alice@business.smu.edu.sg',
      'alice@economics.smu.edu.sg',
    ])
    expect(emailSuggestions('alice@', 2)).toHaveLength(2)
  })

  it('narrows to the domains that start with what was typed, in any case', () => {
    expect(emailSuggestions('alice@SC')).toEqual(['alice@scis.smu.edu.sg'])
    expect(emailSuggestions('alice@smu')).toEqual(['alice@smu.edu.sg'])
    expect(emailSuggestions('alice@gmail')).toEqual([])
  })

  it('stops offering once the address is a whole SMU one', () => {
    expect(emailSuggestions('alice@smu.edu.sg')).toEqual([])
    expect(emailSuggestions('alice@scis.smu.edu.sg')).toEqual([])
    expect(emailSuggestions('alice@a@b')).toEqual([])
  })

  it('knows a whole SMU address, as the server does', () => {
    expect(isSmuEmail(' alice@scis.smu.edu.sg ')).toBe(true)
    expect(isSmuEmail('alice@smu.edu.sg')).toBe(true)
    expect(isSmuEmail('alice@smu.edu')).toBe(false)
    expect(isSmuEmail('alice@gmail.com')).toBe(false)
  })
})
