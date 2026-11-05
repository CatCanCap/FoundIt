import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const {
  generateCode, isCodeShape, expiresAt, codeProblem, asResetCode, isCodeUsable, secondsUntilResend,
  attemptsForNewCode,
  MAX_ATTEMPTS,
} = require('../../lib/verify-code')

const now = new Date('2026-10-15T06:00:00.000Z')
const waiting = {
  emailVerifiedAt: null,
  verifyCodeHash: 'hashed',
  verifyCodeExpiresAt: '2026-10-15T06:10:00.000Z',
  verifyAttempts: 0,
}

describe('generateCode', () => {
  it('makes six digits, keeping leading zeros', () => {
    for (let i = 0; i < 200; i += 1) expect(generateCode()).toMatch(/^\d{6}$/)
  })

  it('does not repeat the same code', () => {
    expect(new Set(Array.from({ length: 50 }, generateCode)).size).toBeGreaterThan(45)
  })
})

describe('isCodeShape', () => {
  it.each(['123456', ' 004213 '])('accepts %j', (value) => expect(isCodeShape(value)).toBe(true))
  it.each(['12345', '1234567', 'abcdef', 123456, undefined])('rejects %j', (value) => expect(isCodeShape(value)).toBe(false))
})

describe('codeProblem', () => {
  it('has none for a fresh code', () => {
    expect(codeProblem(waiting, now)).toBeNull()
  })

  it('refuses an account that is already verified', () => {
    expect(codeProblem({ ...waiting, emailVerifiedAt: '2026-10-01T00:00:00Z' }, now).status).toBe(400)
  })

  it('refuses an expired or missing code', () => {
    expect(codeProblem({ ...waiting, verifyCodeExpiresAt: '2026-10-15T05:59:59Z' }, now).message).toMatch(/expired/)
    expect(codeProblem({ ...waiting, verifyCodeHash: null }, now).message).toMatch(/expired/)
  })

  it('locks the code after too many wrong tries', () => {
    expect(codeProblem({ ...waiting, verifyAttempts: MAX_ATTEMPTS - 1 }, now)).toBeNull()
    expect(codeProblem({ ...waiting, verifyAttempts: MAX_ATTEMPTS }, now).status).toBe(429)
  })
})

describe('timing', () => {
  it('expires a code 15 minutes after it is sent', () => {
    expect(expiresAt(now).toISOString()).toBe('2026-10-15T06:15:00.000Z')
  })

  it('makes people wait half an hour for a new code after one is locked', () => {
    const locked = { verifyCodeSentAt: '2026-10-15T05:50:00Z', verifyAttempts: MAX_ATTEMPTS }
    expect(secondsUntilResend(locked, now)).toBe(20 * 60)
    expect(secondsUntilResend({ ...locked, verifyCodeSentAt: '2026-10-15T05:29:00Z' }, now)).toBe(0)
  })

  it('carries wrong tries over to a new code until the last code is half an hour old', () => {
    const user = { verifyCodeSentAt: '2026-10-15T05:58:00Z', verifyAttempts: 4 }
    expect(attemptsForNewCode(user, now)).toBe(4)
    expect(attemptsForNewCode({ ...user, verifyCodeSentAt: '2026-10-15T05:29:00Z' }, now)).toBe(0)
    expect(attemptsForNewCode({ verifyCodeSentAt: null, verifyAttempts: 0 }, now)).toBe(0)
  })

  it('makes people wait a minute between emails', () => {
    expect(secondsUntilResend({ verifyCodeSentAt: null }, now)).toBe(0)
    expect(secondsUntilResend({ verifyCodeSentAt: '2026-10-15T05:59:30Z' }, now)).toBe(30)
    expect(secondsUntilResend({ verifyCodeSentAt: '2026-10-15T05:58:00Z' }, now)).toBe(0)
  })
})

describe('asResetCode', () => {
  it('reads the reset columns under the email code names', () => {
    const user = { verifyCodeHash: 'email', resetCodeHash: 'reset', resetCodeExpiresAt: 'later', resetCodeSentAt: 'now', resetAttempts: 2 }
    expect(asResetCode(user)).toEqual({ verifyCodeHash: 'reset', verifyCodeExpiresAt: 'later', verifyCodeSentAt: 'now', verifyAttempts: 2 })
    expect(asResetCode(null)).toBe(null)
  })
})

describe('isCodeUsable (password reset)', () => {
  it('accepts a fresh code, whether or not the email is verified', () => {
    expect(isCodeUsable(waiting, now)).toBe(true)
    expect(isCodeUsable({ ...waiting, emailVerifiedAt: '2026-10-01T00:00:00Z' }, now)).toBe(true)
  })

  it('refuses no account, no code, an expired code and a locked code', () => {
    expect(isCodeUsable(null, now)).toBe(false)
    expect(isCodeUsable({ ...waiting, verifyCodeHash: null }, now)).toBe(false)
    expect(isCodeUsable({ ...waiting, verifyCodeExpiresAt: '2026-10-15T06:00:00.000Z' }, now)).toBe(false)
    expect(isCodeUsable({ ...waiting, verifyAttempts: MAX_ATTEMPTS - 1 }, now)).toBe(true)
    expect(isCodeUsable({ ...waiting, verifyAttempts: MAX_ATTEMPTS }, now)).toBe(false)
  })
})

describe('verification email', () => {
  const { verificationParams } = require('../../lib/verification-email')
  const fs = require('node:fs')
  const path = require('node:path')

  it('fills every placeholder the template uses', () => {
    const params = verificationParams({
      user: { name: 'Alice Tan', email: 'alice@smu.edu.sg' }, code: '048213', minutes: 15,
    })
    expect(params).toMatchObject({
      to_email: 'alice@smu.edu.sg', to_name: 'Alice Tan', otp_code: '048213', minutes: '15',
      subject: 'Your FoundIt code is 048213',
    })
    expect(params.heading).toBe('Confirm your SMU email')
    expect(params.intro).toMatch(/confirm your SMU email/)
    const html = fs.readFileSync(path.join(__dirname, '../../email-templates/verify-email.html'), 'utf8')
    const used = new Set([...html.matchAll(/\{\{(\w+)\}\}/g)].map((found) => found[1]))
    for (const name of used) expect(params).toHaveProperty(name)
  })

  it('words the same template for a password reset', () => {
    const user = { name: 'Alice Tan', email: 'alice@smu.edu.sg' }
    const verify = verificationParams({ user, code: '048213', minutes: 15 })
    const reset = verificationParams({ user, code: '048213', minutes: 15, purpose: 'reset' })
    expect(reset).toMatchObject({
      to_email: 'alice@smu.edu.sg', otp_code: '048213', minutes: '15',
      subject: 'Your FoundIt password reset code is 048213',
      heading: 'Reset your password',
      intro: 'Enter this code in FoundIt to reset your password.',
    })
    expect(reset.ignore_note).toMatch(/your password stays the same/)
    expect(reset.sent_because).toMatch(/reset/)
    // Every purpose-specific sentence differs, and both send the same fields
    for (const name of ['subject', 'heading', 'intro', 'ignore_note', 'sent_because']) {
      expect(reset[name]).not.toBe(verify[name])
    }
    expect(Object.keys(reset).sort()).toEqual(Object.keys(verify).sort())
  })

  it('has no purpose-specific wording left in the template', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../email-templates/verify-email.html'), 'utf8')
    const body = html.replace(/<!--[\s\S]*?-->/, '')
    expect(body).not.toMatch(/signed up|sign up|confirm your SMU email|reset/i)
  })

  it('refuses an unknown purpose', () => {
    expect(() => verificationParams({ user: {}, code: '1', minutes: 1, purpose: 'other' })).toThrow()
  })
})

describe('alert email template', () => {
  const fs = require('node:fs')
  const path = require('node:path')

  it('only uses the fields alerts/emailjs.js sends', () => {
    const sent = ['to_email', 'to_name', 'subject', 'message', 'link']
    const html = fs.readFileSync(path.join(__dirname, '../../email-templates/alert.html'), 'utf8')
    const used = new Set([...html.matchAll(/\{\{(\w+)\}\}/g)].map((found) => found[1]))
    for (const name of used) expect(sent).toContain(name)
  })
})
