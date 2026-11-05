import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const request = require('supertest')
const app = require('../../app')
const verificationEmail = require('../../lib/verification-email')
const supabase = require('../../lib/db')
const { truncateAll, registerUser, makeAdmin } = require('./helpers')

// Catch the verification emails instead of sending them
const originalSend = verificationEmail.send
const sentEmails = []

beforeAll(async () => {
  await truncateAll()
  verificationEmail.send = async (email) => { sentEmails.push(verificationEmail.verificationParams(email)); return true }
})

afterAll(() => {
  verificationEmail.send = originalSend
})

function lastCodeFor(email) {
  return sentEmails.filter((entry) => entry.to_email === email).at(-1).otp_code
}

// The code routes limit each device, so each test acts from its own address
let deviceCount = 0
function fromNewDevice() {
  deviceCount += 1
  const address = `10.0.0.${deviceCount}`
  return (req) => req.set('X-Forwarded-For', address)
}

describe('register', () => {
  it('creates an account and emails a code, but does not log in', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice Tan', email: 'Alice.Tan@scis.smu.edu.sg', password: 'password123',
    })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ email: 'alice.tan@scis.smu.edu.sg', verificationSent: true })
    expect(res.body).not.toHaveProperty('token')
    expect(lastCodeFor('alice.tan@scis.smu.edu.sg')).toMatch(/^\d{6}$/)
  })

  it('rejects the same email with different capitalisation', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice Again', email: 'ALICE.TAN@SCIS.SMU.EDU.SG', password: 'password123',
    })
    expect(res.status).toBe(409)
  })

  it.each([
    ['a non-SMU email', { email: 'bob@gmail.com' }],
    ['a look-alike domain', { email: 'bob@notsmu.edu.sg' }],
    ['a +tag, which would let one inbox make many accounts', { email: 'bob+2@smu.edu.sg' }],
    ['a domain part no inbox can have', { email: 'bob@-.smu.edu.sg' }],
    ['characters no SMU address has', { email: '<script>@smu.edu.sg' }],
    ['a short password', { password: 'short' }],
    ['a password over 72 bytes (30 emoji)', { password: '😀'.repeat(30) }],
    ['a missing name', { name: '' }],
    ['a password that is not text', { password: 12345678 }],
  ])('rejects %s with 400', async (label, change) => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Bob', email: 'bob@smu.edu.sg', password: 'password123', ...change,
    })
    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
  })

  it('says a name is too long, rather than missing', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'n'.repeat(101), email: 'longname@smu.edu.sg', password: 'password123',
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Name must be 100 characters or fewer')
  })
})

describe('login', () => {
  it('refuses an account whose email is not verified yet, without logging in', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'alice.tan@scis.smu.edu.sg', password: 'password123' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Enter the code we emailed you to finish signing up.' })
  })

  it('still gives the same 401 for a wrong password on an unverified account', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'alice.tan@scis.smu.edu.sg', password: 'nope-nope-nope' })
    expect(res.status).toBe(401)
  })

  it('returns a token for the right password once verified', async () => {
    await supabase.from('users').update({ email_verified_at: new Date().toISOString() }).eq('email', 'alice.tan@scis.smu.edu.sg')
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'alice.tan@scis.smu.edu.sg', password: 'password123' })
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user.passwordHash).toBeUndefined()
  })

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const wrong = await request(app).post('/api/auth/login')
      .send({ email: 'alice.tan@scis.smu.edu.sg', password: 'nope-nope-nope' })
    const unknown = await request(app).post('/api/auth/login')
      .send({ email: 'nobody@smu.edu.sg', password: 'password123' })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
  })

  it('rejects a body with no fields', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })

  it('answers bad JSON with a fixed message that does not repeat the body', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'The request body is not valid JSON' })
  })

  it('lets students and admins log in through the same form', async () => {
    const admin = await registerUser(app, { email: 'admin.one@smu.edu.sg' })
    await makeAdmin(admin.user.id)
    const login = (body) => request(app).post('/api/auth/login').send(body)

    const asStudent = await login({ email: 'alice.tan@scis.smu.edu.sg', password: 'password123' })
    expect(asStudent.status).toBe(200)
    expect(asStudent.body.user.role).toBe('user')
    const asAdmin = await login({ email: 'admin.one@smu.edu.sg', password: 'password123' })
    expect(asAdmin.status).toBe(200)
    expect(asAdmin.body.user.role).toBe('admin')
  })
})

describe('me', () => {
  it('requires a token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401)
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer junk')).status).toBe(401)
  })

  it('returns the logged-in user and lets them switch alerts off', async () => {
    const { token, user } = await registerUser(app)
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(me.status).toBe(200)
    expect(me.body.id).toBe(user.id)

    const patched = await request(app).patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`).send({ alertsOn: false })
    expect(patched.status).toBe(200)
    expect(patched.body.alertsOn).toBe(false)
    expect(patched.body.passwordHash).toBeUndefined()

    const long = await request(app).patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`).send({ name: 'n'.repeat(101) })
    expect(long.body.error).toBe('Name must be 100 characters or fewer')
  })
})

describe('verifying the SMU email', () => {
  let email
  const device = fromNewDevice()
  const verify = (code, address = email, password = 'password123') => device(request(app).post('/api/auth/verify-email'))
    .send({ email: address, code, password })
  const resend = (address = email) => device(request(app).post('/api/auth/resend-code')).send({ email: address })

  beforeAll(async () => {
    email = (await registerUser(app, { verified: false })).user.email
  })

  it('emails a 6-digit code to the SMU address', () => {
    const sent = sentEmails.filter((entry) => entry.to_email === email)
    expect(sent).toHaveLength(1)
    expect(sent[0].otp_code).toMatch(/^\d{6}$/)
    expect(sent[0].subject).toBe(`Your FoundIt code is ${sent[0].otp_code}`)
    expect(sent[0]).toMatchObject({ minutes: '15', heading: 'Confirm your SMU email' })
  })

  it('lets an older unverified login read, but not post', async () => {
    const { token } = await registerUser(app, { verified: false })
    const auth = (req) => req.set('Authorization', `Bearer ${token}`)
    expect((await auth(request(app).get('/api/auth/me'))).status).toBe(200)
    const post = await auth(request(app).post('/api/reports')).send({ itemId: 1, reason: 'x' })
    expect(post.status).toBe(403)
    expect(post.body.error).toMatch(/Verify your SMU email/)
  })

  it('answers resend the same way whether or not the account exists', async () => {
    const unknown = await resend('nobody.here@smu.edu.sg')
    const tooSoon = await resend()
    expect(unknown.status).toBe(200)
    expect(tooSoon.status).toBe(200)
    expect(unknown.body).toEqual(tooSoon.body)
    // Within the minute, so no second email went out
    expect(sentEmails.filter((entry) => entry.to_email === email)).toHaveLength(1)
  })

  it('gives one answer for a wrong code, an unknown email and a bad shape', async () => {
    const right = lastCodeFor(email)
    const wrong = right === '000000' ? '111111' : '000000'
    const wrongCode = await verify(wrong)
    const unknown = await verify(wrong, 'nobody.here@smu.edu.sg')
    expect(wrongCode.status).toBe(400)
    expect(wrongCode.body).toEqual({ error: 'That code or password is wrong, or the code has expired.' })
    expect(unknown.body).toEqual(wrongCode.body)
    expect((await verify('abc')).status).toBe(400)
  })

  it('refuses the right code with the wrong password, so nobody can take over an account made with their email', async () => {
    // Someone registers a classmate's email with a password of their own...
    await request(app).post('/api/auth/register').send({ name: 'Not Dana', email: 'dana.lee@smu.edu.sg', password: 'attacker-pass' })
    // ...and Dana types in the code that turned up in her inbox
    const res = await fromNewDevice()(request(app).post('/api/auth/verify-email'))
      .send({ email: 'dana.lee@smu.edu.sg', code: lastCodeFor('dana.lee@smu.edu.sg'), password: 'danas-own-pass' })
    expect(res.status).toBe(400)
    expect(res.body).not.toHaveProperty('token')
    const { data } = await supabase.from('users').select('email_verified_at').eq('email', 'dana.lee@smu.edu.sg').single()
    expect(data.email_verified_at).toBeNull()
  })

  it('asks for the password with the code', async () => {
    const res = await device(request(app).post('/api/auth/verify-email')).send({ email, code: '123456' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Enter your password')
  })

  it('locks the code after five wrong tries', async () => {
    const other = await registerUser(app, { verified: false })
    const right = lastCodeFor(other.user.email)
    const wrong = right === '000000' ? '111111' : '000000'
    // A fresh device for each pair of tries, so only the account's own limit counts
    for (let i = 0; i < 5; i += 1) {
      await fromNewDevice()(request(app).post('/api/auth/verify-email')).send({ email: other.user.email, code: wrong, password: 'password123' })
    }
    const locked = await fromNewDevice()(request(app).post('/api/auth/verify-email')).send({ email: other.user.email, code: right, password: 'password123' })
    expect(locked.status).toBe(400)
  })

  it('accepts the right code and logs the person in', async () => {
    const res = await verify(` ${lastCodeFor(email)} `)
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user.emailVerifiedAt).toBeTruthy()
    expect(res.body.user).not.toHaveProperty('verifyCodeHash')

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`)
    expect(me.body.email).toBe(email)
    // The code is used up
    expect((await verify(lastCodeFor(email))).status).toBe(400)
  })

  it('lets a verified user log in and change things', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password: 'password123' })
    expect(login.status).toBe(200)
    const res = await request(app).patch('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`).send({ alertsOn: false })
    expect(res.status).toBe(200)
  })

  it('sends a fresh code once the minute is up, and wrong tries carry over', async () => {
    const other = await registerUser(app, { verified: false })
    const try_ = fromNewDevice()
    const wrong = lastCodeFor(other.user.email) === '000000' ? '111111' : '000000'
    await try_(request(app).post('/api/auth/verify-email')).send({ email: other.user.email, code: wrong, password: 'password123' })
    await try_(request(app).post('/api/auth/verify-email')).send({ email: other.user.email, code: wrong, password: 'password123' })

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    await supabase.from('users').update({ verify_code_sent_at: twoMinutesAgo }).eq('id', other.user.id)
    expect((await try_(request(app).post('/api/auth/resend-code')).send({ email: other.user.email })).status).toBe(200)
    expect(sentEmails.filter((entry) => entry.to_email === other.user.email)).toHaveLength(2)

    const { data } = await supabase.from('users').select('verify_attempts').eq('id', other.user.id).single()
    expect(data.verify_attempts).toBe(2)
  })

  it('emails a new code when an unverified account logs in after its code expired', async () => {
    const other = await registerUser(app, { verified: false })
    const longAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    await supabase.from('users')
      .update({ verify_code_expires_at: longAgo, verify_code_sent_at: longAgo }).eq('id', other.user.id)
    const res = await request(app).post('/api/auth/login').send({ email: other.user.email, password: 'password123' })
    expect(res.status).toBe(403)
    expect(sentEmails.filter((entry) => entry.to_email === other.user.email)).toHaveLength(2)
  })

  it('counts tries sent at the same time, so they cannot get past the limit', async () => {
    const other = await registerUser(app, { verified: false })
    const right = lastCodeFor(other.user.email)
    const wrong = right === '000000' ? '111111' : '000000'
    const tries = await Promise.all(Array.from({ length: 12 }, (_, i) => request(app)
      .post('/api/auth/verify-email').set('X-Forwarded-For', `10.1.0.${i}`).send({ email: other.user.email, code: wrong, password: 'password123' })))
    expect(tries.every((res) => [400, 429].includes(res.status))).toBe(true)
    const { data } = await supabase.from('users').select('verify_attempts').eq('id', other.user.id).single()
    expect(data.verify_attempts).toBeLessThanOrEqual(5)
  })

  it('limits how many codes one device may try for one email', async () => {
    const other = await registerUser(app, { verified: false })
    const try_ = fromNewDevice()
    const answers = []
    for (let i = 0; i < 6; i += 1) {
      answers.push((await try_(request(app).post('/api/auth/verify-email')).send({ email: other.user.email, code: '999999', password: 'password123' })).status)
    }
    expect(answers.at(-1)).toBe(429)
  })

  it('refuses an expired code', async () => {
    const other = await registerUser(app, { verified: false })
    const past = new Date(Date.now() - 60 * 1000).toISOString()
    await supabase.from('users').update({ verify_code_expires_at: past }).eq('id', other.user.id)
    const res = await fromNewDevice()(request(app).post('/api/auth/verify-email'))
      .send({ email: other.user.email, code: lastCodeFor(other.user.email), password: 'password123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/expired/)
  })
})
