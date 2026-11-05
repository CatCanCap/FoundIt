import { describe, it, expect } from 'vitest'
import {
  changedFields,
  checkDraft,
  claimLink,
  closedReportNote,
  claimedMatch,
  draftOf,
  feedSearchLink,
  reportStatus,
  trailStops,
  declinedLine,
  findsLookLike,
  foundWhereWhen,
  itemNoun,
  lostCode,
  itemTone,
  reasonPartsOf,
  reasonText,
  shortReasons,
  readHiddenDeclined,
  readSeenMatches,
  unseenCount,
  whereFound,
  writeHiddenDeclined,
  writeSeenMatches,
  reportFilterFromQuery,
  reportKind,
  reportTagLabel,
  takenFind,
  markText,
  reasonKind,
  reasonMarks,
  reasonTerms,
  searchReports,
} from '../matches'

describe('Matches page words', () => {
  it('writes the codes and counts the way the design does', () => {
    expect(lostCode(412)).toBe('0412')
    expect(itemNoun('Water Bottle')).toBe('water bottle')
    expect(itemNoun('')).toBe('item')
    expect(findsLookLike(1)).toBe('1 find looks like')
    expect(findsLookLike(3)).toBe('3 finds look like')
  })

  it('says where the item was found', () => {
    const spots = new Map([
      [5, { id: 5, building: 'SCIS 1', area: 'seminar room 2-4' }],
      [6, { id: 6, building: 'Li Ka Shing Library', area: 'service desk' }],
    ])
    const item = {
      trail: [{ spotId: 5, from: '2026-10-22T06:05:00Z', to: '2026-10-22T06:05:00Z' }],
    }
    expect(whereFound(item, spots)).toEqual({ building: 'SCIS 1', area: 'Seminar Room 2-4' })
    // The building's short name, as on the map
    expect(whereFound({ trail: [{ spotId: 6 }] }, spots)).toEqual({
      building: 'LKS Library',
      area: 'Service Desk',
    })
    expect(whereFound({ trail: [{ spotId: 9 }] }, spots).building).toBe('Unknown place')
    // The server left the place out
    expect(whereFound({ placeHidden: true, trail: [{ spotId: null }] }, spots)).toEqual({
      building: 'Place hidden',
      area: '',
    })
  })

  it('writes reasons with a capital letter', () => {
    expect(reasonText('same colour')).toBe('Same colour')
    const match = {
      reasonParts: [
        { lead: 'same category', detail: '' },
        { lead: 'same colour', detail: '' },
        { lead: 'same brand', detail: 'Totes' },
        { lead: 'within a day', detail: '' },
      ],
    }
    // The short line names what matched, without the details
    expect(shortReasons(match)).toBe('Same category, same colour, same brand.')
    expect(shortReasons({ reasonParts: [] })).toBe('')
  })

  it('counts finds still waiting for an answer that have not been seen, like unread', () => {
    const reports = [
      {
        matches: [
          { id: 1, status: 'suggested' },
          { id: 2, status: 'claimed' },
        ],
      },
      { matches: [{ id: 3, status: 'suggested' }] },
    ]
    expect(unseenCount(reports)).toBe(2)
    expect(unseenCount(reports, new Set([1]))).toBe(1)
    expect(unseenCount(reports, new Set([1, 3]))).toBe(0)
  })

  it('sends "This is mine" to the claim page, and a claimed match straight to its handoff', () => {
    const at = (status) => claimLink({ id: 7, status, item: { id: 42 } })
    expect(at('suggested')).toBe('/matches/7/claim')
    expect(at('claimed')).toBe('/matches/7/handoff')
    expect(at('confirmed')).toBe('/matches/7/handoff')
    expect(at('rejected')).toBe('/matches/7/claim')
  })

  it('says when a waiting find was claimed by someone else, with a way to dispute it', () => {
    const find = (status, itemStatus) =>
      takenFind({ id: 7, status, item: { id: 42, status: itemStatus } })
    expect(find('suggested', 'open')).toBeNull()
    // Older data with no status is treated as open
    expect(find('suggested', undefined)).toBeNull()
    // Your own claim is not "taken"
    expect(find('claimed', 'matched')).toBeNull()
    expect(find('suggested', 'matched')).toMatchObject({
      state: 'claimed',
      label: 'Claimed by someone else',
      recordLink: '/items/42/record',
    })
    expect(find('suggested', 'resolved')).toMatchObject({
      state: 'resolved',
      recordLink: '/items/42/record',
    })
    expect(find('suggested', 'archived')).toMatchObject({ recordLink: null })
  })

  it('says why a lost report is closed, as a heading with its serif part', () => {
    expect(closedReportNote({ status: 'resolved', category: 'Wallet' })).toMatchObject({
      lead: 'You got',
      accent: 'your wallet back.',
    })
    expect(closedReportNote({ status: 'archived' }).note).toContain('30 days')
    expect(closedReportNote({ status: 'removed' }).accent).toBe('is closed.')
  })

  it('finds the claimed match of a report being returned, and none while it is open', () => {
    const matches = [
      { id: 1, status: 'suggested' },
      { id: 2, status: 'claimed' },
    ]
    expect(claimedMatch({ item: { status: 'matched' }, matches })).toEqual(matches[1])
    expect(claimedMatch({ item: { status: 'open' }, matches })).toBeNull()
  })
})

describe('searchReports', () => {
  const report = (id, item) => ({
    item: { id, title: '', category: 'Other', ...item },
    matches: [],
  })
  const reports = [
    report(412, { title: 'Black Sony WH-1000XM4 headphones', category: 'Electronics' }),
    report(9, { title: 'Umbrella', category: 'Umbrella', colours: ['Navy', 'White'] }),
    report(31, { title: 'Water bottle', brand: 'Hydro Flask', description: 'SMU sticker' }),
  ]
  const ids = (found) => found.map((entry) => entry.item.id)

  it('keeps every report when nothing is searched for', () => {
    expect(searchReports(reports, '')).toBe(reports)
    expect(searchReports(reports, '   ')).toBe(reports)
  })

  it('needs every word, in any order and any case', () => {
    expect(ids(searchReports(reports, 'sony black'))).toEqual([412])
    expect(ids(searchReports(reports, 'SONY red'))).toEqual([])
  })

  it('looks in the category, brand, colours, description and report number', () => {
    expect(ids(searchReports(reports, 'electronics'))).toEqual([412])
    expect(ids(searchReports(reports, 'hydro'))).toEqual([31])
    expect(ids(searchReports(reports, 'white'))).toEqual([9])
    expect(ids(searchReports(reports, 'sticker'))).toEqual([31])
    expect(ids(searchReports(reports, '0412'))).toEqual([412])
  })
})

describe('Matches page: the list and the edit form', () => {
  const report = {
    id: 9,
    status: 'open',
    title: 'Black umbrella',
    category: 'Umbrella',
    colour: 'Black',
    brand: null,
    description: 'Wooden handle',
    trail: [{ spotId: 1, from: '2026-10-12T02:00:00Z', to: '2026-10-12T04:00:00Z' }],
  }

  it('turns a report into form values and sends back only what changed, trimmed', () => {
    const draft = draftOf(report)
    expect(draft).toEqual({
      title: 'Black umbrella',
      category: 'Umbrella',
      colours: ['Black'],
      brand: '',
      description: 'Wooden handle',
      photoUrl: '',
    })
    expect(changedFields(report, draft)).toEqual({})
    expect(changedFields(report, { ...draft, brand: ' Totes ', colours: [] })).toEqual({
      brand: 'Totes',
      colours: [],
    })
  })

  it('uses the report’s colour list, and sends it whole when the colours or their order change', () => {
    const twoTone = { ...report, colours: ['Black', 'White'] }
    expect(draftOf(twoTone).colours).toEqual(['Black', 'White'])
    expect(changedFields(twoTone, { ...draftOf(twoTone), colours: ['White', 'Black'] })).toEqual({
      colours: ['White', 'Black'],
    })
    // Changing the draft does not change the report
    const draft = draftOf(twoTone)
    draft.colours.push('Red')
    expect(twoTone.colours).toEqual(['Black', 'White'])
  })

  it('sends a new photo link, or an empty one to remove the photo', () => {
    const withPhoto = { ...report, photoUrl: 'https://res.cloudinary.com/demo/old.jpg' }
    const draft = draftOf(withPhoto)
    expect(draft.photoUrl).toBe('https://res.cloudinary.com/demo/old.jpg')
    expect(
      changedFields(withPhoto, { ...draft, photoUrl: 'https://res.cloudinary.com/demo/new.jpg' }),
    ).toEqual({ photoUrl: 'https://res.cloudinary.com/demo/new.jpg' })
    expect(changedFields(withPhoto, { ...draft, photoUrl: '' })).toEqual({ photoUrl: '' })
  })

  it('checks the form with the same limits as the API', () => {
    const draft = draftOf(report)
    expect(checkDraft(draft)).toBe('')
    expect(checkDraft({ ...draft, title: '  ' })).toBe('Give your item a name.')
    expect(checkDraft({ ...draft, category: '' })).toBe('Pick a category.')
    expect(checkDraft({ ...draft, brand: 'x'.repeat(51) })).toBe('Keep the brand to 50 characters.')
    expect(checkDraft({ ...draft, colours: ['Black', 'White', 'Red', 'Blue'] })).toBe(
      'Pick at most 3 colours.',
    )
  })

  it('writes each trail stop with its place and Singapore time', () => {
    const spots = new Map([[1, { building: 'SCIS 1', floor: 'Level 2', area: 'lift lobby' }]])
    expect(trailStops(report, spots)).toEqual([
      { place: 'SCIS 1, Level 2', area: 'Lift Lobby', when: 'Mon 12 Oct, 10:00 to 12:00' },
    ])
    expect(trailStops({ trail: [{ spotId: 7, from: 'x', to: 'y' }] }, spots)).toEqual([
      { place: 'Unknown place', area: '', when: '' },
    ])
  })

  it('writes one "Place hidden" stop, with no 1970 time, for a find the server kept private', () => {
    const hidden = {
      placeHidden: true,
      trail: [{ spotId: null, roomId: null, from: null, to: null }],
    }
    expect(trailStops(hidden, new Map())).toEqual([{ place: 'Place hidden', area: '', when: '' }])
  })

  it('words a lost report’s status for its owner', () => {
    expect(reportStatus({ status: 'open' }).label).toBe('Still looking')
    expect(reportStatus({ status: 'matched' }).label).toBe('Being returned')
  })
})

describe('reasonPartsOf', () => {
  it('uses the parts the server sends, with a capital letter on each lead', () => {
    const match = {
      reasons: ['same brand: Hydro Flask', 'within a day'],
      reasonParts: [
        { lead: 'same brand', detail: 'Hydro Flask' },
        { lead: 'within a day', detail: '' },
      ],
    }
    expect(reasonPartsOf(match)).toEqual([
      { lead: 'Same brand', detail: 'Hydro Flask' },
      { lead: 'Within a day', detail: '' },
    ])
  })

  it('says "Same mention" for one shared word and "Same mentions" for several', () => {
    const match = {
      reasonParts: [
        { lead: 'both mention', detail: 'sticker' },
        { lead: 'both mention', detail: 'sticker, dent' },
      ],
    }
    expect(reasonPartsOf(match)).toEqual([
      { lead: 'Same mention', detail: 'sticker' },
      { lead: 'Same mentions', detail: 'sticker, dent' },
    ])
  })

  it('shows plain reasons whole when a match has no parts', () => {
    expect(reasonPartsOf({ reasons: ['same category'] })).toEqual([
      { lead: 'Same category', detail: '' },
    ])
    expect(reasonPartsOf({})).toEqual([])
  })
})

describe('itemTone', () => {
  it('uses the main colour swatch', () => {
    expect(itemTone({ colour: 'Navy' })).toBe('#1f2a5a')
    expect(itemTone({ colours: ['Navy', 'Clear'] })).toBe('#1f2a5a')
  })

  it('falls back to the page grey with no swatch or no colour', () => {
    expect(itemTone({ colour: 'Clear' })).toBe('currentColor')
    expect(itemTone({ colour: null })).toBe('currentColor')
    expect(itemTone(null)).toBe('currentColor')
  })
})

describe('declined claims', () => {
  it('says when the finder declined, in Singapore time', () => {
    expect(declinedLine('2026-10-21T17:00:00Z')).toBe('The finder declined your claim on 22 Oct.')
    expect(declinedLine(null)).toBe('The finder declined your claim.')
  })

  it('remembers hidden ones per account on this device, and copes without storage', () => {
    localStorage.clear()
    expect(readHiddenDeclined(1).size).toBe(0)
    writeHiddenDeclined(1, new Set([30, 31]))
    expect([...readHiddenDeclined(1)]).toEqual([30, 31])
    // Another student on the same browser starts with nothing hidden
    expect(readHiddenDeclined(2).size).toBe(0)
    // Signed out: nothing is read or written
    writeSeenMatches(null, new Set([5]))
    expect(readSeenMatches(null).size).toBe(0)
    localStorage.setItem('foundit-hidden-declined-1', 'not json')
    expect(readHiddenDeclined(1).size).toBe(0)
    localStorage.clear()
  })
})

describe('searching the feed yourself', () => {
  it('links to found items of the same kind', () => {
    expect(feedSearchLink('Water Bottle')).toEqual({ path: '/feed', query: { family: 'bottles' } })
    expect(feedSearchLink('Other')).toEqual({ path: '/feed', query: { family: 'other' } })
  })
})

describe('foundWhereWhen', () => {
  it('finishes "Found at SCIS 1" as a sentence, with no dots between the parts', () => {
    expect(foundWhereWhen('seminar rooms', { day: 'Today', time: '14:05' })).toBe(
      ', seminar rooms, today at 14:05.',
    )
    expect(foundWhereWhen('lobby', { day: 'Yesterday', time: '' })).toBe(', lobby, yesterday.')
    expect(foundWhereWhen('', { day: 'Thu 22 Oct', time: '' })).toBe(', on Thu 22 Oct.')
    expect(foundWhereWhen('lobby', null)).toBe(', lobby.')
  })
})

describe('reportKind and reportTagLabel', () => {
  const report = (status, count) => ({
    item: { status },
    matches: Array.from({ length: count }, (_, id) => ({ id })),
  })

  it('puts a report being returned, one with finds and one without in their groups', () => {
    expect(reportKind(report('matched', 1))).toBe('back')
    expect(reportKind(report('open', 2))).toBe('finds')
    expect(reportKind(report('open', 0))).toBe('none')
  })

  it('says how many finds, or where the report stands', () => {
    expect(reportTagLabel(report('open', 1))).toBe('1 find')
    expect(reportTagLabel(report('open', 3))).toBe('3 finds')
    expect(reportTagLabel(report('matched', 1))).toBe('Being returned')
    expect(reportTagLabel(report('open', 0))).toBe('No finds yet')
  })
})

describe('reportFilterFromQuery', () => {
  it('reads a known filter and treats anything else as All', () => {
    expect(reportFilterFromQuery({ show: 'finds' })).toBe('finds')
    expect(reportFilterFromQuery({ show: 'back' })).toBe('back')
    expect(reportFilterFromQuery({ show: 'everything' })).toBe('')
    expect(reportFilterFromQuery({ show: ['finds'] })).toBe('')
    expect(reportFilterFromQuery({})).toBe('')
  })
})

describe('why it matched, marked on both reports', () => {
  it("knows which part of the reports each of the engine's reasons is about", () => {
    expect(reasonKind('same category')).toBe('category')
    expect(reasonKind('Similar category')).toBe('category')
    expect(reasonKind('same colour')).toBe('colour')
    expect(reasonKind('same colours')).toBe('colour')
    expect(reasonKind('both have')).toBe('colour')
    expect(reasonKind('similar colour')).toBe('colour')
    expect(reasonKind('same brand')).toBe('brand')
    expect(reasonKind('both mention')).toBe('words')
    expect(reasonKind('Same mention')).toBe('words')
    expect(reasonKind('Same mentions')).toBe('words')
    for (const lead of ['same room', 'same area', 'same place', 'same floor', 'same building']) {
      expect(reasonKind(lead)).toBe('place')
    }
    expect(reasonKind('nearby buildings')).toBe('place')
    expect(reasonKind('trail covers 5 buildings')).toBe('place')
    expect(reasonKind('within a day')).toBe('time')
    expect(reasonKind('1 day apart')).toBe('time')
    expect(reasonKind('6 days apart')).toBe('time')
    expect(reasonKind('something new')).toBe(null)
  })

  it('picks the words to mark for each reason', () => {
    const lost = { colours: ['Black', 'Red'] }
    const found = { colours: ['red', 'White'] }
    expect(reasonTerms({ lead: 'same brand', detail: 'Hydro Flask' }, lost, found)).toEqual([
      'Hydro Flask',
    ])
    expect(
      reasonTerms({ lead: 'both mention', detail: 'bifold, leather, card' }, lost, found),
    ).toEqual(['bifold', 'leather', 'card'])
    expect(reasonTerms({ lead: 'both have', detail: 'Black and White' }, lost, found)).toEqual([
      'Black',
      'White',
    ])
    // Plain "same colour" names none: the colours the two share, in any case
    expect(reasonTerms({ lead: 'same colour', detail: '' }, lost, found)).toEqual(['Red'])
    // A place or a time lights up a whole line instead of words
    expect(reasonTerms({ lead: 'same floor', detail: 'SCIS 1' }, lost, found)).toEqual([])
    expect(reasonTerms({ lead: 'within a day', detail: '' }, lost, found)).toEqual([])
  })

  it('adds the kind and words to every reason of a match', () => {
    const match = {
      reasonParts: [{ lead: 'same brand', detail: 'Sony' }],
      item: { colours: [] },
    }
    expect(reasonMarks(match, { colours: [] })).toEqual([
      { lead: 'Same brand', detail: 'Sony', kind: 'brand', terms: ['Sony'] },
    ])
  })

  it('cuts text up around the marked words, from the start of a word, in any case', () => {
    const marks = [
      { kind: 'words', terms: ['card', 'leather'] },
      { kind: 'brand', terms: ['Coach'] },
    ]
    expect(markText('Coach wallet, LEATHER, two cards. Discard it', marks)).toEqual([
      { text: 'Coach', kinds: ['brand'] },
      { text: ' wallet, ', kinds: [] },
      { text: 'LEATHER', kinds: ['words'] },
      { text: ', two ', kinds: [] },
      { text: 'cards', kinds: ['words'] },
      // "card" inside "Discard" is not the start of a word
      { text: '. Discard it', kinds: [] },
    ])
  })

  it('marks the longest words first and keeps every reason a word belongs to', () => {
    const marks = [
      { kind: 'words', terms: ['hydro'] },
      { kind: 'brand', terms: ['Hydro Flask'] },
    ]
    expect(markText('My Hydro Flask', marks)).toEqual([
      { text: 'My ', kinds: [] },
      { text: 'Hydro Flask', kinds: ['words', 'brand'] },
    ])
  })

  it('leaves text with nothing to mark whole, and empty text empty', () => {
    expect(markText('Black umbrella', [])).toEqual([{ text: 'Black umbrella', kinds: [] }])
    expect(markText('', [{ kind: 'words', terms: ['x'] }])).toEqual([])
    expect(markText(null, [])).toEqual([])
    // Characters that mean something in a pattern are matched as they are
    expect(markText('Size (L) bag', [{ kind: 'words', terms: ['(l)'] }])[1]).toEqual({
      text: '(L)',
      kinds: ['words'],
    })
  })
})
