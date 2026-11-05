// The Admin page's history of each person on a case, the queue facts about a
// dispute, and one row of the People list. Pure functions, no database.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { summariseHistory, disputeQueueFacts, personRow } = require('../../lib/admin-history')

// carl (3) claims things wrongly; alice (1) disputes; ben (2) is a finder
const data = {
  raised: [
    { id: 10, raisedBy: 1, claimId: 100, status: 'upheld' },
    { id: 11, raisedBy: 1, claimId: 101, status: 'closed' },
    { id: 12, raisedBy: 1, claimId: 102, status: 'open' }, // the case being decided
  ],
  claims: [
    { id: 100, claimerId: 3, status: 'overturned' },
    { id: 101, claimerId: 3, status: 'active' },
    { id: 102, claimerId: 3, status: 'active' }, // the claim being disputed
    { id: 103, claimerId: 3, status: 'withdrawn' },
    { id: 104, claimerId: 3, status: 'declined' },
  ],
  onClaims: [
    { id: 10, claimId: 100, status: 'upheld' },
    { id: 11, claimId: 101, status: 'closed' },
    { id: 12, claimId: 102, status: 'open' },
    { id: 13, claimId: 103, status: 'withdrawn' },
  ],
  actions: [
    { userId: 3, action: 'warn_user' },
    { userId: 3, action: 'warn_user' },
    { userId: 3, action: 'suspend_user' },
    { userId: 3, action: 'unsuspend_user' },
    { userId: 2, action: 'warn_user' },
  ],
  reports: [
    { id: 50, authorId: 2, status: 'open' },
    { id: 51, authorId: 2, status: 'actioned' },
    { id: 52, authorId: 3, status: 'open' },
    { id: 53, authorId: 9, status: 'open' }, // someone not on the case
  ],
  users: [
    { id: 1, suspendedAt: null },
    { id: 2, suspendedAt: null },
    { id: 3, suspendedAt: '2026-10-16T00:00:00.000Z' },
  ],
}

describe('summariseHistory', () => {
  const history = summariseHistory([1, 2, 3], data, { disputeId: 12, claimId: 102 })

  it('counts the disputes someone raised, and how many went their way', () => {
    expect(history[1]).toMatchObject({ disputesRaised: 2, disputesRaisedWon: 1, disputesAgainst: 0 })
  })

  it('counts disputes on someone\'s claims, losses, withdrawals and declined claims', () => {
    expect(history[3]).toMatchObject({
      disputesAgainst: 3,
      disputesLost: 1,
      claimsWithdrawn: 1,
      claimsDeclined: 1,
    })
  })

  it('counts warnings and suspensions, and says if the account is suspended now', () => {
    expect(history[3]).toMatchObject({
      warnings: 2,
      suspensions: 1,
      suspendedAt: '2026-10-16T00:00:00.000Z',
    })
    expect(history[2]).toMatchObject({ warnings: 1, suspensions: 0, suspendedAt: null })
  })

  it('counts open and acted-on reports against what someone wrote or posted', () => {
    expect(history[2]).toMatchObject({ openReports: 1, actionedReports: 1 })
    expect(history[3]).toMatchObject({ openReports: 1, actionedReports: 0 })
  })

  it('leaves out the case being decided', () => {
    const withCase = summariseHistory([1, 3], data)
    expect(withCase[1].disputesRaised).toBe(3)
    expect(withCase[3].disputesAgainst).toBe(4)
    const reportCase = summariseHistory([2], data, { reportId: 50 })
    expect(reportCase[2].openReports).toBe(0)
  })

  it('gives a clean record to someone with no history, and ignores everyone else', () => {
    const clean = summariseHistory([7], data)
    expect(Object.keys(clean)).toEqual(['7'])
    expect(Object.values(clean[7]).every((value) => value === 0 || value === null)).toBe(true)
  })
})

describe('disputeQueueFacts', () => {
  const claimsById = new Map([
    [1, { id: 1, matchId: 10 }],
    [2, { id: 2, matchId: 20 }],
  ])

  it('spots an item that was already returned when it was disputed', () => {
    const handoffs = new Map([[10, [{ status: 'completed', completedAt: '2026-10-10T00:00:00Z' }]]])
    const dispute = { claimId: 1, createdAt: '2026-10-12T00:00:00Z' }
    expect(disputeQueueFacts(dispute, claimsById, handoffs)).toEqual({
      itemWasReturned: true,
      returnDone: false,
    })
    const before = { claimId: 1, createdAt: '2026-10-09T00:00:00Z' }
    expect(disputeQueueFacts(before, claimsById, handoffs).itemWasReturned).toBe(false)
  })

  it('says when an upheld dispute\'s item reached the person who disputed it', () => {
    const dispute = { claimId: 1, newClaimId: 2, createdAt: '2026-10-12T00:00:00Z' }
    const pending = new Map([[20, [{ status: 'pending' }]]])
    expect(disputeQueueFacts(dispute, claimsById, pending).returnDone).toBe(false)
    const handedOver = new Map([[20, [{ status: 'handed_over' }]]])
    expect(disputeQueueFacts(dispute, claimsById, handedOver).returnDone).toBe(true)
  })
})

describe('personRow', () => {
  const actions = [
    { userId: 3, action: 'unsuspend_user', reason: 'Returned it', createdAt: '2026-10-18T00:00:00Z' },
    { userId: 3, action: 'suspend_user', reason: 'Fake claim', createdAt: '2026-10-16T00:00:00Z' },
    { userId: 3, action: 'warn_user', reason: 'Rude', createdAt: '2026-10-15T00:00:00Z' },
    { userId: 4, action: 'warn_user', reason: 'x', createdAt: '2026-10-19T00:00:00Z' },
  ]

  it('gives contact details, counts and the latest action, never the password hash', () => {
    const row = personRow(
      { id: 3, name: 'Carl', email: 'carl@smu.edu.sg', passwordHash: 'secret', suspendedAt: null },
      actions,
    )
    expect(row).toEqual({
      id: 3,
      name: 'Carl',
      email: 'carl@smu.edu.sg',
      suspendedAt: null,
      warnings: 1,
      suspensions: 1,
      lastAction: { action: 'unsuspend_user', reason: 'Returned it', createdAt: '2026-10-18T00:00:00Z' },
    })
  })

  it('has no last action for someone never acted on', () => {
    expect(personRow({ id: 9, name: 'N', email: 'n@smu.edu.sg' }, actions).lastAction).toBeNull()
  })
})
