// Feature 5 rules that need no database: the admin role check, the
// suspension check, and that a disputed item never completes by itself.
// The models are replaced with stand-ins for each test.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { requireAdmin, checkCanChangeThings } = require('../../middleware/auth')
const { optionalHttpsUrl: validateUrl } = require('../../lib/validate')
const Match = require('../../models/match-model')
const Item = require('../../models/item-model')
const Handoff = require('../../models/handoff-model')
const Dispute = require('../../models/dispute-model')
const { completeHandoff } = require('../../lib/handoff-steps')
const cron = require('../../controllers/cron-controller')

function statusOf(run) {
  try {
    run()
    return 'passed'
  } catch (error) {
    return error.status
  }
}

describe('requireAdmin', () => {
  const next = () => {}

  it('lets an admin through', () => {
    expect(statusOf(() => requireAdmin({ user: { id: 1, role: 'admin' } }, {}, next))).toBe('passed')
  })

  it('refuses a normal user with 403', () => {
    expect(statusOf(() => requireAdmin({ user: { id: 1, role: 'user' } }, {}, next))).toBe(403)
  })

  it('refuses a request with no user, or no role, with 403', () => {
    expect(statusOf(() => requireAdmin({}, {}, next))).toBe(403)
    expect(statusOf(() => requireAdmin({ user: { id: 1 } }, {}, next))).toBe(403)
  })
})

describe('checkCanChangeThings', () => {
  const verified = '2026-10-01T00:00:00.000Z'
  const suspended = { id: 1, emailVerifiedAt: verified, suspendedAt: '2026-10-15T00:00:00.000Z' }
  const unverified = { id: 2, emailVerifiedAt: null, suspendedAt: null }

  it('lets suspended and unverified users read', () => {
    expect(statusOf(() => checkCanChangeThings({ method: 'GET', user: suspended }))).toBe('passed')
    expect(statusOf(() => checkCanChangeThings({ method: 'GET', user: unverified }))).toBe('passed')
  })

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('stops a suspended or unverified user from %s', (method) => {
    expect(statusOf(() => checkCanChangeThings({ method, user: suspended }))).toBe(403)
    expect(statusOf(() => checkCanChangeThings({ method, user: unverified }))).toBe(403)
  })

  it('lets a verified user who is not suspended change things', () => {
    const user = { id: 1, emailVerifiedAt: verified, suspendedAt: null }
    expect(statusOf(() => checkCanChangeThings({ method: 'POST', user }))).toBe('passed')
  })
})

describe('optionalHttpsUrl', () => {
  it('accepts an https link and treats empty as none', () => {
    expect(validateUrl(' https://res.cloudinary.com/x.jpg ')).toBe('https://res.cloudinary.com/x.jpg')
    expect(validateUrl('')).toBeNull()
    expect(validateUrl(undefined)).toBeNull()
  })

  it.each(['http://example.com/a.jpg', 'javascript:alert(1)', 'not a link', 42])('rejects %s', (value) => {
    expect(statusOf(() => validateUrl(value))).toBe(400)
  })
})

describe('a disputed item never completes by itself', () => {
  const replaced = [[Match, 'findById'], [Match, 'updateStatus'], [Item, 'findByIds'], [Item, 'updateStatus'],
    [Item, 'archiveStale'], [Handoff, 'update'], [Handoff, 'findHandedOverBefore'], [Dispute, 'hasOpenForItem']]
  let originals
  const calls = []
  let disputeOpen
  let matchStatus
  let foundItemStatus

  beforeEach(() => {
    calls.length = 0
    disputeOpen = false
    matchStatus = 'claimed'
    foundItemStatus = 'claimed'
    originals = replaced.map(([model, name]) => model[name])
    Match.findById = async (id) => ({ id, status: matchStatus, lostItemId: 1, foundItemId: 2 })
    Match.updateStatus = async (id, status) => { calls.push(['match', status]); return { id, lostItemId: 1, foundItemId: 2 } }
    Item.findByIds = async () => [{ id: 1, status: 'claimed' }, { id: 2, status: foundItemStatus }]
    Item.updateStatus = async (id, status) => { calls.push(['item', id, status]) }
    Item.archiveStale = async () => 0
    Handoff.update = async (id, fields) => { calls.push(['handoff', fields.status]); return { id, ...fields } }
    Handoff.findHandedOverBefore = async () => [{ id: 7, matchId: 3, status: 'handed_over' }]
    Dispute.hasOpenForItem = async (itemId) => { calls.push(['dispute check', itemId]); return disputeOpen }
  })

  afterEach(() => {
    replaced.forEach(([model, name], index) => { model[name] = originals[index] })
  })

  it('completes a handoff and resolves both items when there is no dispute', async () => {
    await completeHandoff({ id: 7, matchId: 3 })
    expect(calls).toContainEqual(['dispute check', 2])
    expect(calls).toContainEqual(['handoff', 'completed'])
    expect(calls).toContainEqual(['item', 1, 'resolved'])
    expect(calls).toContainEqual(['item', 2, 'resolved'])
  })

  it('refuses with 409 and changes nothing while a dispute is open', async () => {
    disputeOpen = true
    await expect(completeHandoff({ id: 7, matchId: 3 })).rejects.toMatchObject({ status: 409 })
    expect(calls.filter(([kind]) => kind !== 'dispute check')).toEqual([])
  })

  it('refuses with 409 and changes nothing once the claim no longer stands', async () => {
    matchStatus = 'rejected'
    await expect(completeHandoff({ id: 7, matchId: 3 })).rejects.toMatchObject({ status: 409 })
    expect(calls.filter(([kind]) => kind !== 'dispute check')).toEqual([])
  })

  it('refuses with 409 and changes nothing once an admin removed one of the posts', async () => {
    foundItemStatus = 'removed'
    await expect(completeHandoff({ id: 7, matchId: 3 })).rejects.toMatchObject({ status: 409 })
    expect(calls.filter(([kind]) => kind !== 'dispute check')).toEqual([])
  })

  it('the daily job skips the old handoff after an admin gave the item to the disputer', async () => {
    process.env.CRON_SECRET = 'unit-test-cron'
    const req = { headers: { authorization: 'Bearer unit-test-cron' } }
    let body
    const res = { json: (value) => { body = value } }

    matchStatus = 'rejected'
    await cron.runDaily(req, res)
    expect(body.handoffsCompleted).toBe(0)
    expect(calls.some(([kind]) => kind === 'match' || kind === 'item')).toBe(false)
  })

  it('the daily job skips a handoff on a disputed item, and completes it otherwise', async () => {
    process.env.CRON_SECRET = 'unit-test-cron'
    const req = { headers: { authorization: 'Bearer unit-test-cron' } }
    let body
    const res = { json: (value) => { body = value } }

    disputeOpen = true
    await cron.runDaily(req, res)
    expect(body.handoffsCompleted).toBe(0)
    expect(calls.some(([kind]) => kind === 'handoff')).toBe(false)

    disputeOpen = false
    await cron.runDaily(req, res)
    expect(body.handoffsCompleted).toBe(1)
    expect(calls).toContainEqual(['handoff', 'completed'])
  })
})
