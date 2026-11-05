// The forgot-password routes and the token fingerprint, run through the real
// app with supertest, but with the user model swapped for a small in-memory
// copy. The database client is made to throw, so this file can never read or
// change the shared test database. tests/api/password-reset.test.js runs the
// same routes against the real test database.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret'
const supabase = require('../../lib/db')
const request = require('supertest')
const app = require('../../app')
const { sign } = require('../../lib/token')
const { hash } = require('../../lib/hash')
const User = require('../../models/user-model')
const verificationEmail = require('../../lib/verification-email')

const NOW = new Date().toISOString()
let db
let sentCodes
let oldHash

function freshDb() {
  return {
    users: [
      { id: 1, name: 'Alice Tan', email: 'alice@smu.edu.sg', role: 'user', passwordHash: oldHash, emailVerifiedAt: NOW, suspendedAt: null, verifyCodeHash: null, verifyCodeExpiresAt: null, verifyCodeSentAt: null, verifyAttempts: 0, resetCodeHash: null, resetCodeExpiresAt: null, resetCodeSentAt: null, resetAttempts: 0 },
      // Has not confirmed the email yet, and holds a confirmation code
      { id: 2, name: 'New Person', email: 'new@smu.edu.sg', role: 'user', passwordHash: oldHash, emailVerifiedAt: null, suspendedAt: null, verifyCodeHash: 'their-email-code', verifyCodeExpiresAt: new Date(Date.now() + 600000).toISOString(), verifyCodeSentAt: NOW, verifyAttempts: 1, resetCodeHash: null, resetCodeExpiresAt: null, resetCodeSentAt: null, resetAttempts: 0 },
    ],
  }
}

const find = (id) => db.users.find((user) => user.id === Number(id)) || null
const copy = (row) => (row ? structuredClone(row) : null)

// The model's "only if nothing changed" checks, on the in-memory rows
const fakes = {
  findByEmail: async (email) => copy(db.users.find((user) => user.email === email.trim().toLowerCase())),
  findById: async (id) => copy(find(id)),
  update: async (id, fields) => copy(Object.assign(find(id), fields)),
  countVerifyAttempt: async (id, seen) => {
    const user = find(id)
    if (user.verifyAttempts !== seen) return null
    user.verifyAttempts = seen + 1
    return copy(user)
  },
  countResetAttempt: async (id, seen) => {
    const user = find(id)
    if (user.resetAttempts !== seen) return null
    user.resetAttempts = seen + 1
    return copy(user)
  },
  replaceVerifyCode: async (id, fields) => copy(Object.assign(find(id), fields)),
  replaceResetCode: async (id, fields, { previousSentAt, previousAttempts }) => {
    const user = find(id)
    if ((user.resetCodeSentAt || null) !== previousSentAt || user.resetAttempts !== previousAttempts) return null
    return copy(Object.assign(user, fields))
  },
}

const originals = []
const originalFrom = supabase.from
const originalRpc = supabase.rpc
const originalSend = verificationEmail.send

beforeAll(async () => {
  oldHash = await hash('old-password-1')
  // Anything that slips past the fakes fails loudly instead of reaching the database
  supabase.from = () => { throw new Error('The database must not be used in unit tests') }
  supabase.rpc = supabase.from
  for (const [name, fake] of Object.entries(fakes)) {
    originals.push([name, User[name]])
    User[name] = fake
  }
  // Catch the email instead of sending it
  verificationEmail.send = async ({ user, code, purpose }) => {
    sentCodes.push({ email: user.email, code, purpose })
    return true
  }
})

afterAll(() => {
  supabase.from = originalFrom
  supabase.rpc = originalRpc
  verificationEmail.send = originalSend
  for (const [name, original] of originals) User[name] = original
})

beforeEach(() => {
  db = freshDb()
  sentCodes = []
})

// Each test is its own "device", so the per-device limits of one test do not
// spill into the next
let device = 0
function fromNewDevice() {
  device += 1
  const address = `10.0.0.${device}`
  const send = (url, body) =>
    request(app).post(url).set('X-Forwarded-For', address).send(body)
  return {
    forgot: (email) => send('/api/auth/forgot-password', { email }),
    reset: (email, code, password = 'new-password-1') =>
      send('/api/auth/reset-password', { email, code, password }),
  }
}

const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)

describe('forgot password', () => {
  it('emails a reset code without touching the code that confirms the email', async () => {
    const phone = fromNewDevice()
    const res = await phone.forgot('new@smu.edu.sg')
    expect(res.status).toBe(200)
    expect(sentCodes).toEqual([{ email: 'new@smu.edu.sg', code: expect.any(String), purpose: 'reset' }])
    const user = find(2)
    expect(user.resetCodeHash).toBeTruthy()
    expect(user.verifyCodeHash).toBe('their-email-code')
    expect(user.verifyAttempts).toBe(1)
  })

  it('answers the same for an email with no account, and sends nothing', async () => {
    const res = await fromNewDevice().forgot('nobody@smu.edu.sg')
    expect(res.status).toBe(200)
    expect(sentCodes).toEqual([])
  })

  it('lets one device ask for 5 codes, then makes it wait', async () => {
    const phone = fromNewDevice()
    for (let i = 0; i < 5; i += 1) expect((await phone.forgot('nobody@smu.edu.sg')).status).toBe(200)
    expect((await phone.forgot('nobody@smu.edu.sg')).status).toBe(429)
  })
})

describe('reset password', () => {
  it('saves the new password, logs in, and signs out every older session', async () => {
    const oldToken = sign(1, oldHash)
    expect((await me(oldToken)).status).toBe(200)

    const phone = fromNewDevice()
    await phone.forgot('alice@smu.edu.sg')
    const res = await phone.reset('alice@smu.edu.sg', sentCodes[0].code)
    expect(res.status).toBe(200)
    expect(res.body.user).not.toHaveProperty('resetCodeHash')
    expect(res.body.user).not.toHaveProperty('passwordHash')

    expect((await me(res.body.token)).status).toBe(200)
    expect((await me(oldToken)).status).toBe(401)
    expect(find(1).resetCodeHash).toBe(null)
  })

  it('counts tries sent at the same moment, so they cannot slip past the device limit', async () => {
    const attacker = fromNewDevice()
    const owner = fromNewDevice()
    await owner.forgot('alice@smu.edu.sg')
    const answers = await Promise.all(
      Array.from({ length: 8 }, () => attacker.reset('alice@smu.edu.sg', '000000')),
    )
    expect(answers.filter((res) => res.status === 400)).toHaveLength(3)
    expect(answers.filter((res) => res.status === 429)).toHaveLength(5)
    expect(find(1).resetAttempts).toBe(3)
  })

  it('confirms the email of an account that had not confirmed it yet', async () => {
    const phone = fromNewDevice()
    await phone.forgot('new@smu.edu.sg')
    await phone.reset('new@smu.edu.sg', sentCodes[0].code)
    expect(find(2).emailVerifiedAt).toBeTruthy()
    expect(find(2).verifyCodeHash).toBe(null)
  })

  it('counts wrong codes against the reset code only', async () => {
    const phone = fromNewDevice()
    await phone.forgot('new@smu.edu.sg')
    const res = await phone.reset('new@smu.edu.sg', '000000')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('That code is wrong or has expired.')
    expect(find(2).resetAttempts).toBe(1)
    expect(find(2).verifyAttempts).toBe(1)
  })

  it('stops one device after 3 wrong codes for an email, before the account locks', async () => {
    const attacker = fromNewDevice()
    const owner = fromNewDevice()
    await owner.forgot('alice@smu.edu.sg')
    for (let i = 0; i < 3; i += 1) {
      expect((await attacker.reset('alice@smu.edu.sg', '000000')).status).toBe(400)
    }
    expect((await attacker.reset('alice@smu.edu.sg', '000000')).status).toBe(429)
    expect(find(1).resetAttempts).toBe(3)
    // The owner's code still works
    expect((await owner.reset('alice@smu.edu.sg', sentCodes[0].code)).status).toBe(200)
  })
})

describe('token fingerprint', () => {
  it('refuses a token made before tokens carried the fingerprint', async () => {
    const jwt = require('jsonwebtoken')
    const legacy = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '7d' })
    expect((await me(legacy)).status).toBe(401)
  })
})

describe('change password (Profile page)', () => {
  const change = (token, body) =>
    request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send(body)

  it('saves the new password, gives a new token and signs out older sessions', async () => {
    const oldToken = sign(1, oldHash)
    const res = await change(oldToken, { currentPassword: 'old-password-1', newPassword: 'new-password-1' })
    expect(res.status).toBe(200)
    expect(res.body.user.passwordHash).toBeUndefined()
    expect((await me(res.body.token)).status).toBe(200)
    expect((await me(oldToken)).status).toBe(401)
  })

  it('refuses a wrong current password with 400, so the browser stays logged in', async () => {
    const res = await change(sign(1, oldHash), { currentPassword: 'wrong-one', newPassword: 'new-password-1' })
    expect(res.status).toBe(400)
    expect(find(1).passwordHash).toBe(oldHash)
  })

  it('refuses a short new password, and the same password again', async () => {
    const token = sign(1, oldHash)
    expect((await change(token, { currentPassword: 'old-password-1', newPassword: 'short' })).status).toBe(400)
    const same = await change(token, { currentPassword: 'old-password-1', newPassword: 'old-password-1' })
    expect(same.status).toBe(400)
  })

  it('needs a login', async () => {
    const res = await request(app).post('/api/auth/change-password').send({})
    expect(res.status).toBe(401)
  })
})
