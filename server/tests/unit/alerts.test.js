import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { newMatchEmails, newClaimEmail } = require('../../alerts/emails')
const { sendEmail } = require('../../alerts/emailjs')

const owner = { name: 'Alice Tan', email: 'alice@smu.edu.sg', alertsOn: true }
const finder = { name: 'Ben Lim', email: 'ben@smu.edu.sg', alertsOn: true }
const lostItem = { title: 'Black Totes umbrella' }
const foundItem = { title: 'Black umbrella by the lifts' }
// The lost report named the same floor around the same time (L and D), so
// the owner may read the place reasons too (lib/item-privacy.js)
const match = { id: 12, score: 87.5, breakdown: { C: 100, A: 80, L: 80, D: 90 }, reasons: ['same category', 'same floor'] }
const appUrl = 'https://foundit.example'

describe('newMatchEmails', () => {
  it('writes to both people with the score, the reasons and a link', () => {
    const emails = newMatchEmails({ match, lostItem, foundItem, owner, finder, appUrl })
    expect(emails.map((e) => e.toEmail)).toEqual(['alice@smu.edu.sg', 'ben@smu.edu.sg'])
    expect(emails[0].subject).toBe('Possible match for your Black Totes umbrella')
    expect(emails[0].message).toContain('88% match (same category · same floor)')
    expect(emails[1].link).toBe('https://foundit.example/matches/12')
  })

  it('leaves the place and time out of the owner’s email unless their report said them', () => {
    const guessed = {
      ...match,
      breakdown: { C: 100, A: 80, L: 30, D: 100 },
      reasons: ['same category', 'nearby buildings: SOE and SCIS 1', 'within a day'],
    }
    const [toOwner, toFinder] = newMatchEmails({ match: guessed, lostItem, foundItem, owner, finder, appUrl })
    expect(toOwner.message).toContain('88% match (same category).')
    expect(toOwner.message).not.toMatch(/SCIS|within a day/)
    // The finder's email may name the lost report's places, which are public
    expect(toFinder.message).toContain('nearby buildings: SOE and SCIS 1')
  })

  it('no longer asks the finder to set a hidden question (removed in the final proposal)', () => {
    const emails = newMatchEmails({ match, lostItem, foundItem, owner, finder, appUrl })
    expect(emails[1].message).not.toContain('Set a question')
    // The chat only opens once the owner claims, so the finder is not told to ask there now
    expect(emails[1].message).toContain('If the owner claims it')
  })

  it('skips anyone who turned alerts off', () => {
    const emails = newMatchEmails({
      match, lostItem, foundItem, owner: { ...owner, alertsOn: false }, finder, appUrl,
    })
    expect(emails.map((e) => e.toEmail)).toEqual(['ben@smu.edu.sg'])
  })
})

describe('newClaimEmail', () => {
  it('tells the finder, with a link to the chat and nothing about who claimed it', () => {
    const email = newClaimEmail({ match, foundItem, finder, appUrl })
    expect(email.toEmail).toBe('ben@smu.edu.sg')
    expect(email.subject).toBe('Someone claimed the Black umbrella by the lifts you found')
    expect(email.link).toBe('https://foundit.example/matches/12/handoff')
    expect(email.message).not.toContain('Alice')
  })

  it('sends nothing to a finder who turned alerts off', () => {
    expect(newClaimEmail({ match, foundItem, finder: { ...finder, alertsOn: false }, appUrl }))
      .toBeNull()
  })
})

describe('sendEmail', () => {
  const email = { toEmail: 'alice@smu.edu.sg', toName: 'Alice', subject: 'S', message: 'M', link: 'L' }
  const settings = {
    EMAILJS_SERVICE_ID: 'service_1', EMAILJS_TEMPLATE_ID: 'template_1',
    EMAILJS_PUBLIC_KEY: 'public_1', EMAILJS_PRIVATE_KEY: 'private_1',
  }
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('never sends while the tests are running', async () => {
    for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value)
    expect(await sendEmail(email)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends nothing without the settings', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('EMAILJS_PRIVATE_KEY', '')
    expect(await sendEmail(email)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the template values to EmailJS', async () => {
    vi.stubEnv('VITEST', '')
    for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value)
    fetchMock.mockResolvedValue({ ok: true })

    expect(await sendEmail(email)).toBe(true)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.emailjs.com/api/v1.0/email/send')
    expect(JSON.parse(options.body)).toEqual({
      service_id: 'service_1', template_id: 'template_1', user_id: 'public_1', accessToken: 'private_1',
      template_params: { to_email: 'alice@smu.edu.sg', to_name: 'Alice', subject: 'S', message: 'M', link: 'L' },
    })
  })

  it('throws when EmailJS refuses, so the caller can log it', async () => {
    vi.stubEnv('VITEST', '')
    for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value)
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => 'API calls are disabled' })
    await expect(sendEmail(email)).rejects.toThrow('EmailJS refused the email: 403')
  })
})
