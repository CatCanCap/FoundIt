import { describe, it, expect } from 'vitest'
import {
  MAX_STOPS,
  buildLostItem,
  checkDetails,
  checkTrail,
  earliestDay,
  formatSlack,
  slackExample,
  stopNumbersByBuilding,
  toIso,
  trailErrorTarget,
} from '../trail'

const details = {
  category: 'Umbrella',
  title: '',
  colours: ['Black'],
  brand: ' Muji ',
  description: 'Long black umbrella, wooden hook handle, one bent rib. ',
  photoUrl: '',
}
const now = new Date('2026-10-14T20:00:00+08:00')

describe('toIso', () => {
  it('reads the date and time as Singapore time, whatever the device is set to', () => {
    expect(toIso('2026-10-14', '14:00')).toBe('2026-10-14T06:00:00.000Z')
  })
})

describe('checkDetails', () => {
  it('needs a category', () => {
    expect(checkDetails({ ...details, category: '' })).toBe('Pick a category.')
  })

  it('needs a name for Other, as on the found report', () => {
    expect(checkDetails({ ...details, category: 'Other' })).toMatch(/Say what it is/)
    expect(checkDetails({ ...details, category: 'Other', title: 'Silver ring' })).toBe('')
  })

  it('takes up to 3 colours', () => {
    expect(checkDetails({ ...details, colours: ['Black', 'Red', 'Blue'] })).toBe('')
    expect(checkDetails({ ...details, colours: ['Black', 'Red', 'Blue', 'Green'] })).toMatch(
      /at most 3/,
    )
  })

  it('is happy with the details above', () => {
    expect(checkDetails(details)).toBe('')
  })
})

describe('stopNumbersByBuilding', () => {
  it('numbers stops in order, and a building visited twice gets both numbers', () => {
    const stops = [{ building: 'LKCSB' }, { building: 'SCIS 1' }, { building: 'LKCSB' }]
    expect(stopNumbersByBuilding(stops)).toEqual({ LKCSB: [1, 3], 'SCIS 1': [2] })
  })
})

describe('buildLostItem', () => {
  const stops = [
    { spotId: '17', start: '09:00', end: '12:00' },
    { spotId: 4, start: '12:00', end: '13:30' },
  ]

  it('builds the POST /api/items body with a full trail', () => {
    const { body, error } = buildLostItem(details, '2026-10-14', stops, now)
    expect(error).toBeUndefined()
    expect(body).toEqual({
      type: 'lost',
      title: 'Black Muji umbrella',
      description: 'Long black umbrella, wooden hook handle, one bent rib.',
      category: 'Umbrella',
      colours: ['Black'],
      brand: 'Muji',
      trail: [
        { spotId: 17, from: toIso('2026-10-14', '09:00'), to: toIso('2026-10-14', '12:00') },
        { spotId: 4, from: toIso('2026-10-14', '12:00'), to: toIso('2026-10-14', '13:30') },
      ],
    })
  })

  it('uses the name the owner typed, else one built from the details', () => {
    const typed = { ...details, title: ' My granny’s umbrella ' }
    expect(buildLostItem(typed, '2026-10-14', stops, now).body.title).toBe('My granny’s umbrella')
    const plain = { ...details, colours: [], brand: '', category: 'Wallet' }
    expect(buildLostItem(plain, '2026-10-14', stops, now).body.title).toBe('Wallet')
  })

  it('sends dates with a timezone, as the API requires', () => {
    const { body } = buildLostItem(details, '2026-10-14', stops, now)
    expect(body.trail[0].from).toMatch(/Z$/)
  })

  it('sends the photo link only when there is one', () => {
    const { body } = buildLostItem(
      { ...details, photoUrl: 'https://res.cloudinary.com/x.jpg' },
      '2026-10-14',
      stops,
      now,
    )
    expect(body.photoUrl).toBe('https://res.cloudinary.com/x.jpg')
  })

  it('needs at least one stop and at most the maximum', () => {
    expect(buildLostItem(details, '2026-10-14', [], now).error).toMatch(/at least one/)
    const tooMany = Array.from({ length: MAX_STOPS + 1 }, () => stops[0])
    expect(buildLostItem(details, '2026-10-14', tooMany, now).error).toMatch(/at most/)
  })

  it('says which stop has an end time before its start', () => {
    const backwards = [stops[0], { spotId: 4, start: '14:00', end: '13:00' }]
    expect(buildLostItem(details, '2026-10-14', backwards, now).error).toBe(
      'Stop 2: the end time must be after the start.',
    )
  })

  it('rejects a stop that starts in the future', () => {
    const later = [{ spotId: 4, start: '21:00', end: '22:00' }]
    expect(buildLostItem(details, '2026-10-14', later, now).error).toMatch(/future/)
  })

  it('needs a date', () => {
    expect(buildLostItem(details, '', stops, now).error).toBe('Say which day you had it.')
  })
})

describe('the time allowance', () => {
  const stops = [{ spotId: 4, start: '12:00', end: '13:30' }]

  it('widens every stop by the allowance on both sides', () => {
    const { body } = buildLostItem(details, '2026-10-14', stops, now, 30)
    expect(body.trail[0]).toEqual({
      spotId: 4,
      from: toIso('2026-10-14', '11:30'),
      to: toIso('2026-10-14', '14:00'),
    })
  })

  it('never pushes the end past now, so a late stop is not saved as tomorrow', () => {
    const late = [{ spotId: 4, start: '19:00', end: '19:45' }]
    const { body } = buildLostItem(details, '2026-10-14', late, now, 30)
    expect(body.trail[0].from).toBe(toIso('2026-10-14', '18:30'))
    expect(body.trail[0].to).toBe(now.toISOString())
  })

  it('leaves the times alone without an allowance', () => {
    const { body } = buildLostItem(details, '2026-10-14', stops, now)
    expect(body.trail[0].from).toBe(toIso('2026-10-14', '12:00'))
  })

  it('names the choices', () => {
    expect(formatSlack(15)).toBe('±15 min')
    expect(formatSlack(60)).toBe('±1 hour')
  })

  it('gives an example from the last stop', () => {
    const last = { start: '15:00', end: '15:20' }
    expect(slackExample(last, 'Connexion', 30)).toBe(
      'Something found at 15:50 near Connexion still counts.',
    )
    expect(slackExample(last, 'SCIS 1', 60)).toBe(
      'Something found at 16:20 near SCIS 1 still counts.',
    )
  })

  it('speaks generally until there is a stop with an end time', () => {
    expect(slackExample(undefined, '', 30)).toBe('Finds a little outside your times still count.')
  })
})

describe('trailErrorTarget', () => {
  it('finds the stop and field a trail message is about', () => {
    expect(trailErrorTarget('Stop 2: pick where in the building.')).toEqual({
      stop: 2,
      field: 'spot',
    })
    expect(trailErrorTarget('Stop 1: add a start and end time.')).toEqual({
      stop: 1,
      field: 'times',
    })
    expect(trailErrorTarget('Stop 3: the end time must be after the start.')).toEqual({
      stop: 3,
      field: 'end',
    })
    expect(trailErrorTarget('Stop 1: the start time cannot be in the future.')).toEqual({
      stop: 1,
      field: 'start',
    })
    expect(
      trailErrorTarget('Stop 2: it starts before stop 1. Put the stops in the order you went.'),
    ).toEqual({ stop: 2, field: 'start' })
    expect(trailErrorTarget('Pick a day within the last year.')).toEqual({ stop: 0, field: 'date' })
  })

  it('points at no field for other messages', () => {
    expect(trailErrorTarget('')).toBe(null)
    expect(trailErrorTarget('Tap at least one building on the map.')).toBe(null)
    expect(trailErrorTarget('Could not post the report. Try again.')).toBe(null)
  })
})

describe('checkTrail', () => {
  it('needs a day and at least one stop', () => {
    expect(checkTrail('', [], now)).toBe('Say which day you had it.')
    expect(checkTrail('2026-10-14', [], now)).toBe('Tap at least one building on the map.')
  })

  it('is happy with a sensible stop', () => {
    expect(checkTrail('2026-10-14', [{ spotId: 1, start: '09:00', end: '10:00' }], now)).toBe('')
  })

  it('stops at a day within the last year, which the server still accepts', () => {
    // 363 days before 14 Oct 2026
    expect(earliestDay(now)).toBe('2025-10-16')
    const sensible = [{ spotId: 1, start: '09:00', end: '10:00' }]
    expect(checkTrail('2025-10-16', sensible, now)).toBe('')
    expect(checkTrail('2025-10-15', sensible, now)).toBe('Pick a day within the last year.')
    expect(checkTrail('2024-01-01', sensible, now)).toBe('Pick a day within the last year.')
  })

  it("leaves the earliest stop, extra hour and all, inside the server's year", () => {
    const { body } = buildLostItem(
      details,
      earliestDay(now),
      [{ spotId: 1, start: '00:00', end: '01:00' }],
      now,
      60,
    )
    const oldestAllowed = now.getTime() - 365 * 24 * 60 * 60 * 1000
    expect(new Date(body.trail[0].from).getTime()).toBeGreaterThan(oldestAllowed)
  })

  // `now` is 14 Oct 2026, 8pm
  const stop = (start, end) => ({ spotId: 1, start, end })

  it('needs both times, since a new stop starts with none', () => {
    expect(checkTrail('2026-10-14', [stop('', '')], now)).toBe('Stop 1: add a start and end time.')
    expect(checkTrail('2026-10-14', [stop('09:00', '')], now)).toBe(
      'Stop 1: add a start and end time.',
    )
    expect(checkTrail('2026-10-14', [stop('', '10:00')], now)).toBe(
      'Stop 1: add a start and end time.',
    )
  })

  it('needs the end after the start', () => {
    expect(checkTrail('2026-10-14', [stop('10:00', '10:00')], now)).toBe(
      'Stop 1: the end time must be after the start.',
    )
    expect(checkTrail('2026-10-14', [stop('11:00', '10:00')], now)).toBe(
      'Stop 1: the end time must be after the start.',
    )
  })

  it('refuses times later than now', () => {
    expect(checkTrail('2026-10-14', [stop('21:00', '22:00')], now)).toBe(
      'Stop 1: the start time cannot be in the future.',
    )
    expect(checkTrail('2026-10-14', [stop('19:00', '21:00')], now)).toBe(
      'Stop 1: the end time cannot be in the future.',
    )
    expect(checkTrail('2026-10-15', [stop('09:00', '10:00')], now)).toBe(
      'Stop 1: the start time cannot be in the future.',
    )
    // Any time on an earlier day is fine
    expect(checkTrail('2026-10-13', [stop('21:00', '22:00')], now)).toBe('')
  })

  it('needs the stops in the order the owner went', () => {
    const trail = [stop('12:00', '13:00'), stop('09:00', '10:00')]
    expect(checkTrail('2026-10-14', trail, now)).toBe(
      'Stop 2: it starts before stop 1. Put the stops in the order you went.',
    )
    // Overlapping or back-to-back stops in order are fine
    expect(checkTrail('2026-10-14', [stop('09:00', '11:00'), stop('10:30', '12:00')], now)).toBe('')
  })

  it('names the first stop with a problem', () => {
    const trail = [stop('09:00', '10:00'), { spotId: '', start: '', end: '' }]
    expect(checkTrail('2026-10-14', trail, now)).toBe('Stop 2: pick where in the building.')
  })
})
