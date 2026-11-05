// Helpers for the found item report
import { SINGAPORE } from './time'

const pad = (number) => String(number).padStart(2, '0')

// How many colours an item can have, main colour first
export const MAX_COLOURS = 3

// The category for anything that fits no other. The finder types a name for it.
export const OTHER = 'Other'

// The categories for the dropdown: A to Z, with Other last
export function sortCategories(categories) {
  return [...categories].sort((a, b) => {
    if (a.name === OTHER) return 1
    if (b.name === OTHER) return -1
    return a.name.localeCompare(b.name)
  })
}

// A date as a date input expects it: 2026-10-14
export function toLocalDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// A time as a time input expects it: 14:05
export function toLocalTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Today's date and the time now in Singapore, for the found report's date and
// time inputs, whatever timezone the device is set to. 'en-CA' writes dates
// as 2026-10-14, and 'en-GB' writes times as 14:05.
export function singaporeDate(date) {
  return date.toLocaleDateString('en-CA', { timeZone: SINGAPORE })
}

export function singaporeTime(date) {
  return date.toLocaleTimeString('en-GB', {
    timeZone: SINGAPORE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

// A suggested item name made from the details, like "Navy Hydro Flask water
// bottle". There is none for Other, since the finder names it.
export function itemTitle({ category, colours = [], brand }) {
  if (!category || category === OTHER) return ''
  const words = [colours[0], brand && brand.trim(), category.toLowerCase()].filter(Boolean)
  const title = words.join(' ')
  return (title.charAt(0).toUpperCase() + title.slice(1)).slice(0, 100)
}

// The item name to post: the finder's own, or the suggested one
export function itemName(form) {
  return (form.title || '').trim() || itemTitle(form)
}

// Checks the details step. Returns a message to show, or null if it's fine.
export function checkItemStep(form) {
  if (!form.category) return 'Pick a category.'
  if (form.category === OTHER && !(form.title || '').trim())
    return 'Say what it is, for example a silver ring.'
  if ((form.title || '').trim().length > 100)
    return 'Keep the item name to 100 characters or fewer.'
  if (form.brand.trim().length > 50) return 'Keep the brand to 50 characters or fewer.'
  return null
}

// Which field a message is about, so the form can show it under that field.
// '' means the message is about the whole form.
const ERROR_FIELDS = [
  ['Pick a category.', 'category'],
  ['Say what it is', 'title'],
  ['Keep the item name', 'title'],
  ['Keep the brand', 'brand'],
  ['Pick where you found it', 'building'],
  ['Say when you found it', 'date'],
]
export function fieldOfError(message) {
  return ERROR_FIELDS.find(([start]) => (message || '').startsWith(start))?.[1] || ''
}

// Checks the whole form and builds what to send to POST /api/items.
// Returns { body } when it's fine, or { error } with a message to show.
export function buildFoundItem(form, now = new Date()) {
  const itemError = checkItemStep(form)
  if (itemError) return { error: itemError }
  if (!form.spotId) return { error: 'Pick where you found it on the map.' }
  if (!form.date || !form.time) return { error: 'Say when you found it.' }

  // The finder means Singapore time (+08:00), whatever timezone the device is
  // set to. The API needs the date with a timezone, so send an ISO string.
  const foundAt = new Date(`${form.date}T${form.time}:00+08:00`)
  if (Number.isNaN(foundAt.getTime())) return { error: 'Say when you found it.' }
  if (foundAt > now) return { error: 'The time you found it cannot be in the future.' }
  const when = foundAt.toISOString()

  const body = {
    type: 'found',
    title: itemName(form),
    description: form.description.trim(),
    category: form.category,
    colours: form.colours,
    brand: form.brand.trim(),
    // A found item has one place: where and when it was found
    trail: [{ spotId: Number(form.spotId), from: when, to: when }],
  }
  if (form.photoUrl) body.photoUrl = form.photoUrl
  return { body }
}
