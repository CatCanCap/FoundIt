// Helpers for the lost report and its trail

import { MAX_COLOURS, checkItemStep, itemName, singaporeDate } from './report'

// A lost item holds 1 to 10 trail points (see the README)
export const MAX_STOPS = 10

// The server refuses trail times more than a year (365 days) old. The form
// stops a little sooner, so the extra time added to each stop before posting
// (up to an hour) can never push a time past that limit.
export const OLDEST_DAYS = 363
const DAY_MS = 24 * 60 * 60 * 1000

// The earliest day the trail can be on, as <input type="date"> writes it: '2025-10-16'
export function earliestDay(now = new Date()) {
  return singaporeDate(new Date(now.getTime() - OLDEST_DAYS * DAY_MS))
}

const pad = (number) => String(number).padStart(2, '0')

// Date and time inputs -> ISO string with timezone (the API requires one).
// The owner means Singapore time (+08:00), whatever timezone the device is set to.
export function toIso(date, time) {
  return new Date(`${date}T${time}:00+08:00`).toISOString()
}

// Step 1 checks: an error message, or ''
export function checkDetails(details) {
  const itemError = checkItemStep(details)
  if (itemError) return itemError
  if (details.colours.length > MAX_COLOURS) {
    return `Pick at most ${MAX_COLOURS} colours.`
  }
  if (details.description.trim().length > 2000) {
    return 'Keep the description to 2000 characters or fewer.'
  }
  return ''
}

// { 'LKCSB': [1], 'SCIS 1': [2, 4] } for the map's stop numbers
export function stopNumbersByBuilding(stops) {
  const numbers = {}
  stops.forEach((stop, index) => {
    if (!numbers[stop.building]) numbers[stop.building] = []
    numbers[stop.building].push(index + 1)
  })
  return numbers
}

// Trail step checks: each stop needs a place and a start before its end, none
// in the future, in the order visited. Returns an error message, or ''.
export function checkTrail(date, stops, now = new Date()) {
  if (!date) return 'Say which day you had it.'
  // Days written as '2025-10-16' sort the same way as the dates they stand for
  if (date < earliestDay(now)) return 'Pick a day within the last year.'
  if (stops.length === 0) return 'Tap at least one building on the map.'
  if (stops.length > MAX_STOPS) return `Add at most ${MAX_STOPS} places.`
  for (const [index, stop] of stops.entries()) {
    const label = `Stop ${index + 1}`
    if (!stop.spotId) return `${label}: pick where in the building.`
    if (!stop.start || !stop.end) return `${label}: add a start and end time.`
    if (stop.start >= stop.end) return `${label}: the end time must be after the start.`
    if (new Date(toIso(date, stop.start)) > now) {
      return `${label}: the start time cannot be in the future.`
    }
    if (new Date(toIso(date, stop.end)) > now) {
      return `${label}: the end time cannot be in the future.`
    }
    const previous = stops[index - 1]
    if (previous && stop.start < previous.start) {
      return `${label}: it starts before stop ${index}. Put the stops in the order you went.`
    }
  }
  return ''
}

// Which field a trail-step message is about, so the form can mark it:
//   'Stop 2: the end time must be after the start.' -> { stop: 2, field: 'end' }
//   'Say which day you had it.' -> { stop: 0, field: 'date' }
// field is 'date', 'spot', 'start', 'end' or 'times' (whichever time is empty).
// null for a message about no one field.
const TRAIL_FIELDS = [
  ['pick where in the building', 'spot'],
  ['add a start and end time', 'times'],
  ['the end time must be after', 'end'],
  ['the start time cannot be', 'start'],
  ['the end time cannot be', 'end'],
  ['it starts before stop', 'start'],
]

export function trailErrorTarget(message) {
  if (!message) return null
  if (message.startsWith('Say which day') || message.startsWith('Pick a day')) {
    return { stop: 0, field: 'date' }
  }
  const match = /^Stop (\d+): (.*)$/.exec(message)
  if (!match) return null
  const field = TRAIL_FIELDS.find(([words]) => match[2].startsWith(words))?.[1]
  return field ? { stop: Number(match[1]), field } : null
}

// Minutes added to both ends of each stop's window before posting
export const TIME_SLACK_OPTIONS = [15, 30, 60]
export const DEFAULT_TIME_SLACK = 30

// 15 -> '±15 min', 60 -> '±1 hour'
export function formatSlack(minutes) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `±${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `±${minutes} min`
}

// '15:20' + 30 -> '15:50'
function laterBy(time, minutes) {
  const [hours, mins] = time.split(':').map(Number)
  const total = (hours * 60 + mins + minutes) % (24 * 60)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

// 'Something found at 15:50 near Connexion still counts.' (from the last stop)
export function slackExample(lastStop, place, minutes) {
  if (!lastStop?.end || !place) return 'Finds a little outside your times still count.'
  return `Something found at ${laterBy(lastStop.end, minutes)} near ${place} still counts.`
}

// Checks every step and builds the POST /api/items body.
// Returns { body } or { error }.
export function buildLostItem(details, date, stops, now = new Date(), slackMinutes = 0) {
  const detailsError = checkDetails(details)
  if (detailsError) return { error: detailsError }
  const trailError = checkTrail(date, stops, now)
  if (trailError) return { error: trailError }

  const slack = slackMinutes * 60 * 1000
  const trail = stops.map((stop) => {
    const end = new Date(toIso(date, stop.end)).getTime() + slack
    return {
      spotId: Number(stop.spotId),
      from: new Date(new Date(toIso(date, stop.start)).getTime() - slack).toISOString(),
      // The slack never pushes the end past now, so a stop ending at 23:45 is
      // not saved as tomorrow
      to: new Date(Math.min(end, now.getTime())).toISOString(),
    }
  })

  return {
    body: {
      type: 'lost',
      // The typed name, else one built from the details ("Black Muji umbrella")
      title: itemName(details),
      description: details.description.trim(),
      category: details.category,
      // Up to 3, main colour first; the API keeps the first as the main colour
      colours: details.colours,
      brand: details.brand.trim(),
      // Only sent once a photo has finished uploading to Cloudinary
      ...(details.photoUrl ? { photoUrl: details.photoUrl } : {}),
      trail,
    },
  }
}
