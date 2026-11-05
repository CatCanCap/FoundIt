import { describe, it, expect } from 'vitest'
import {
  categoryLine,
  disputeWindow,
  itemStage,
  decisionWords,
  lastDecision,
  myLink,
  recordTrack,
} from '../item-page'

const found = {
  id: 2,
  type: 'found',
  category: 'Earbuds',
  colour: 'White',
  createdAt: '2026-10-14T03:24:00Z',
}
const reported = { event: 'reported', at: '2026-10-14T03:24:00Z' }
const claimed = { event: 'claimed', at: '2026-10-14T04:02:00Z' }
const handed = { event: 'handed_over', at: '2026-10-14T09:30:00Z' }
const returned = { event: 'returned', at: '2026-10-14T09:40:00Z' }

const record = (state, timeline = [reported], item = found) => ({ item, state, timeline })

describe('itemStage', () => {
  it('follows the record state and the timeline', () => {
    expect(itemStage(record('open'))).toBe('waiting')
    expect(itemStage(record('matched'))).toBe('waiting')
    expect(itemStage(record('claimed', [reported, claimed]))).toBe('matched')
    expect(itemStage(record('claimed', [reported, claimed, handed]))).toBe('handedOver')
    expect(itemStage(record('returned', [reported, claimed, handed, returned]))).toBe('returned')
    expect(itemStage(record('disputed'))).toBe('disputed')
    expect(itemStage(record('archived'))).toBe('closed')
    expect(itemStage(record('open', [reported], { ...found, type: 'lost' }))).toBe('waiting')
    expect(itemStage(record('resolved', [reported], { ...found, type: 'lost' }))).toBe('closed')
  })

  it('treats a handover from an older claim as not handed over yet', () => {
    const newClaim = { event: 'claimed', at: '2026-10-15T01:00:00Z' }
    expect(itemStage(record('claimed', [reported, claimed, handed, newClaim]))).toBe('matched')
  })
})

describe('recordTrack', () => {
  it('fills the four dots with their times (V13, V13c, V13d)', () => {
    const states = (r) => recordTrack(r).map((step) => step.state)
    expect(states(record('open'))).toEqual(['done', 'todo', 'todo', 'todo'])
    expect(states(record('claimed', [reported, claimed]))).toEqual([
      'done',
      'done',
      'current',
      'todo',
    ])
    expect(states(record('claimed', [reported, claimed, handed]))).toEqual([
      'done',
      'done',
      'done',
      'todo',
    ])
    const done = recordTrack(record('returned', [reported, claimed, handed, returned]))
    expect(done.map((step) => step.when)).toEqual([
      '14 Oct, 11:24',
      '14 Oct, 12:02',
      '14 Oct, 17:30',
      '14 Oct, 17:40',
    ])
    expect(recordTrack(record('claimed', [reported, claimed]))[2].when).toBe('In progress')
  })
})

describe('disputeWindow', () => {
  it('counts down the 7 days after it was returned', () => {
    const now = new Date('2026-10-15T09:40:00Z')
    expect(disputeWindow('2026-10-14T09:40:00Z', now)).toMatchObject({
      open: true,
      left: '6d 0h left',
    })
    expect(disputeWindow('2026-10-01T00:00:00Z', now)).toMatchObject({
      open: false,
      left: 'Closed',
    })
    expect(disputeWindow(null)).toMatchObject({ open: false })
  })
})

describe('categoryLine', () => {
  it('writes the category and colour as in the design', () => {
    expect(categoryLine(found)).toBe('Earbuds, white')
    expect(categoryLine({ category: 'Wallet' })).toBe('Wallet')
  })
})

describe('myLink', () => {
  it('links to your chat first, then to your claim, else nothing', () => {
    const claims = [{ matchId: 10, foundItem: { id: 2 } }]
    const reports = [{ matches: [{ id: 11, status: 'suggested', item: { id: 2 } }] }]
    expect(myLink(2, { claims, reports })).toEqual({ kind: 'chat', to: '/matches/10/handoff' })
    expect(myLink(2, { reports })).toEqual({ kind: 'claim', to: '/matches/11/claim' })
    expect(myLink(3, { claims, reports })).toBeNull()
    const rejected = [{ matches: [{ id: 11, status: 'rejected', item: { id: 2 } }] }]
    expect(myLink(2, { reports: rejected })).toBeNull()
  })
})

describe('lastDecision', () => {
  it('finds the newest dispute decision on the timeline, if any', () => {
    const upheld = { event: 'dispute_upheld', at: '2026-10-25T09:25:00Z' }
    expect(lastDecision([reported, claimed, upheld, returned])).toEqual(upheld)
    expect(lastDecision([reported, claimed])).toBeNull()
    expect(lastDecision(undefined)).toBeNull()
  })
})

describe('decisionWords', () => {
  it('says how a dispute was decided, in its own words', () => {
    expect(decisionWords({ event: 'dispute_upheld' })).toBe(
      'An admin gave it to the person who disputed the claim',
    )
    expect(decisionWords({ event: 'dispute_closed' })).toBe('An admin kept the claim')
    expect(decisionWords({ event: 'claim_withdrawn' })).toBe('The claim was withdrawn')
    expect(decisionWords({ event: 'something_new' })).toBe('The dispute was decided')
    expect(decisionWords(null)).toBe('')
  })
})

describe('myLink after a declined claim', () => {
  // As in the review: your claim was declined, then someone else claimed it
  it('does not send you to your closed chat, so "This is my item" still shows', () => {
    const claims = [{ matchId: 10, foundItem: { id: 2 }, claimStatus: 'declined', role: 'owner' }]
    expect(myLink(2, { claims, reports: [] })).toBeNull()
  })

  it('links to the claim that stands when there are several', () => {
    const claims = [
      { matchId: 10, foundItem: { id: 2 }, claimStatus: 'declined', role: 'finder' },
      { matchId: 12, foundItem: { id: 2 }, claimStatus: 'active', role: 'finder' },
    ]
    expect(myLink(2, { claims, reports: [] })).toEqual({ kind: 'chat', to: '/matches/12/handoff' })
  })

  it('ignores claims that were withdrawn or moved by an admin', () => {
    for (const claimStatus of ['withdrawn', 'overturned']) {
      expect(myLink(2, { claims: [{ matchId: 10, foundItem: { id: 2 }, claimStatus }] })).toBeNull()
    }
  })
})
