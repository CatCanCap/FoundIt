import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')
const verificationEmail = require('../../lib/verification-email')
const supabase = require('../../lib/db')
const { truncateAll, registerUser } = require('./helpers')

// Catch the code emails instead of sending them
const originalSend = verificationEmail.send
const sentEmails = []

beforeAll(async () => {
  await truncateAll()
  verificationEmail.send = async (email) => { sentEmails.push(verificationEmail.verificationParams(email)); return true }
})

afterAll(() => {
  verificationEmail.send = originalSend
})

const resetEmailsTo = (email) => sentEmails.filter((entry) => entry.to_email === email && entry.heading === 'Reset your password')
const lastCodeFor = (email) => sentEmails.filter((entry) => entry.to_email === email).at(-1).otp_code
const wrongCodeFor = (email) => (lastCodeFor(email) === '000000' ? '111111' : '000000')
// Each request comes from its own address, so these tests check each
// account's limits and not the per-device ones (tests/unit/password-reset-routes.test.js)
let device = 0
const fromNewDevice = (req) => req.set('X-Forwarded-For', `10.1.${Math.floor(device / 250)}.${(device += 1) % 250}`)
const forgot = (email) => fromNewDevice(request(app).post('/api/auth/forgot-password')).send({ email })
const reset = (body) => fromNewDevice(request(app).post('/api/auth/reset-password')).send(body)
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password })

// Lets the next code go out straight away, as if the last one was sent long ago
async function ageLastCode(userId, minutes = 31) {
  const longAgo = new Date(Date.now() - minutes * 60 * 1000).toISOString()
  await supabase.from('users').update({ reset_code_sent_at: longAgo }).eq('id', userId)
}

describe('forgot password', () => {
  it('answers the same for an account and an unknown email, and only emails the account', async () => {
    const { user } = await registerUser(app)
    await ageLastCode(user.id)

    const known = await forgot(user.email)
    const unknown = await forgot('nobody.here@smu.edu.sg')
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(known.body).toEqual(unknown.body)
    expect(known.body.message).toMatch(/If an account exists/)

    const sent = resetEmailsTo(user.email)
    expect(sent).toHaveLength(1)
    expect(sent[0].otp_code).toMatch(/^\d{6}$/)
    expect(sent[0]).toMatchObject({
      subject: `Your FoundIt password reset code is ${sent[0].otp_code}`,
      intro: 'Enter this code in FoundIt to reset your password.',
      minutes: '15',
    })
    expect(sentEmails.some((entry) => entry.to_email === 'nobody.here@smu.edu.sg')).toBe(false)
  })

  it('rejects an email that is not an SMU address, whether or not it exists', async () => {
    for (const email of ['bob@gmail.com', '', undefined]) {
      const res = await forgot(email)
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Use your SMU email address')
    }
  })

  it('still answers 200 within the resend minute, but sends nothing new', async () => {
    const { user } = await registerUser(app)
    await ageLastCode(user.id)
    expect((await forgot(user.email)).status).toBe(200)
    const again = await forgot(user.email)
    expect(again.status).toBe(200)
    expect(resetEmailsTo(user.email)).toHaveLength(1)
  })
})

describe('reset password', () => {
  it('gives one answer for an unknown email, a wrong code and no code at all', async () => {
    const withCode = await registerUser(app)
    await ageLastCode(withCode.user.id)
    await forgot(withCode.user.email)
    const noCode = await registerUser(app)
    await supabase.from('users').update({ reset_code_hash: null }).eq('id', noCode.user.id)

    const unknown = await reset({ email: 'nobody.here@smu.edu.sg', code: '123456', password: 'new-password-1' })
    const wrong = await reset({ email: withCode.user.email, code: wrongCodeFor(withCode.user.email), password: 'new-password-1' })
    const none = await reset({ email: noCode.user.email, code: '123456', password: 'new-password-1' })
    for (const res of [unknown, wrong, none]) {
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'That code is wrong or has expired.' })
    }
  })

  it.each([
    ['a non-SMU email', { email: 'bob@gmail.com' }, 'Use your SMU email address'],
    ['a code that is not 6 digits', { code: '12ab' }, 'Enter the 6-digit code from the email'],
    ['a short password', { password: 'short' }, 'Password must be 8 to 72 characters (fewer if it has emoji)'],
    ['a password that is too long', { password: 'x'.repeat(73) }, 'Password must be 8 to 72 characters (fewer if it has emoji)'],
  ])('rejects %s with 400', async (label, change, message) => {
    const res = await reset({ email: 'someone@smu.edu.sg', code: '123456', password: 'new-password-1', ...change })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe(message)
  })

  it('replaces the password, clears the code and logs the person in', async () => {
    const { user } = await registerUser(app)
    await ageLastCode(user.id)
    await forgot(user.email)
    const code = lastCodeFor(user.email)

    const res = await reset({ email: user.email.toUpperCase(), code: ` ${code} `, password: 'brand-new-pass' })
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user.id).toBe(user.id)
    expect(res.body.user).not.toHaveProperty('passwordHash')
    expect(res.body.user).not.toHaveProperty('verifyCodeHash')
    expect(res.body.user).not.toHaveProperty('resetCodeHash')

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`)
    expect(me.status).toBe(200)
    expect((await login(user.email, 'password123')).status).toBe(401)
    expect((await login(user.email, 'brand-new-pass')).status).toBe(200)

    // The code works once only
    const again = await reset({ email: user.email, code, password: 'another-pass-1' })
    expect(again.status).toBe(400)
    const { data } = await supabase.from('users').select('reset_code_hash, reset_attempts').eq('id', user.id).single()
    expect(data).toEqual({ reset_code_hash: null, reset_attempts: 0 })
  })

  it('verifies the email of an account that had not entered its code yet', async () => {
    const { user } = await registerUser(app, { verified: false })
    expect(user.emailVerifiedAt).toBeNull()
    // The sign-up code is kept apart from reset codes, so it cannot reset
    const signUpCode = lastCodeFor(user.email)
    const refused = await reset({ email: user.email, code: signUpCode, password: 'brand-new-pass' })
    expect(refused.status).toBe(400)
    // A reset code proves the inbox, so it also confirms the email
    await forgot(user.email)
    const res = await reset({ email: user.email, code: lastCodeFor(user.email), password: 'brand-new-pass' })
    expect(res.status).toBe(200)
    expect(res.body.user.emailVerifiedAt).toBeTruthy()
  })

  it('counts wrong codes and refuses even the right code after five', async () => {
    const { user } = await registerUser(app)
    await ageLastCode(user.id)
    await forgot(user.email)
    const right = lastCodeFor(user.email)
    const wrong = wrongCodeFor(user.email)
    for (let i = 0; i < 5; i += 1) {
      expect((await reset({ email: user.email, code: wrong, password: 'brand-new-pass' })).status).toBe(400)
    }
    const locked = await reset({ email: user.email, code: right, password: 'brand-new-pass' })
    expect(locked.status).toBe(400)
    expect(locked.body.error).toBe('That code is wrong or has expired.')
    expect((await login(user.email, 'password123')).status).toBe(200)

    // A locked code also holds back a new one for half an hour
    await ageLastCode(user.id, 2)
    await forgot(user.email)
    expect(lastCodeFor(user.email)).toBe(right)
  })

  it('counts tries sent at the same time, so they cannot get past the limit', async () => {
    const { user } = await registerUser(app)
    await ageLastCode(user.id)
    await forgot(user.email)
    const wrong = wrongCodeFor(user.email)
    const tries = await Promise.all(Array.from({ length: 12 }, () =>
      reset({ email: user.email, code: wrong, password: 'brand-new-pass' })))
    expect(tries.every((res) => res.status === 400)).toBe(true)
    const { data } = await supabase.from('users').select('reset_attempts').eq('id', user.id).single()
    expect(data.reset_attempts).toBeLessThanOrEqual(5)
  })

  it('refuses an expired code', async () => {
    const { user } = await registerUser(app)
    await ageLastCode(user.id)
    await forgot(user.email)
    const past = new Date(Date.now() - 60 * 1000).toISOString()
    await supabase.from('users').update({ reset_code_expires_at: past }).eq('id', user.id)
    const res = await reset({ email: user.email, code: lastCodeFor(user.email), password: 'brand-new-pass' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('That code is wrong or has expired.')
  })

  it('lets a suspended account reset, but it stays suspended', async () => {
    const { user } = await registerUser(app)
    await supabase.from('users').update({ suspended_at: new Date().toISOString() }).eq('id', user.id)
    await ageLastCode(user.id)
    await forgot(user.email)
    const res = await reset({ email: user.email, code: lastCodeFor(user.email), password: 'brand-new-pass' })
    expect(res.status).toBe(200)
    expect(res.body.user.suspendedAt).toBeTruthy()
    const post = await request(app).post('/api/reports')
      .set('Authorization', `Bearer ${res.body.token}`).send({ itemId: 1, reason: 'x' })
    expect(post.status).toBe(403)
  })
})
