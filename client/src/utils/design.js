// Shared design lookups: category colours and drawings, item colours, status labels
import { buildingLabel } from './campus-layout'
import { areaLabel } from './campus-map'

// Category -> colour family
const FAMILY_OF_CATEGORY = {
  Laptop: 'electronics',
  Tablet: 'electronics',
  Phone: 'electronics',
  Charger: 'electronics',
  Earbuds: 'electronics',
  Headphones: 'electronics',
  'Water Bottle': 'bottles',
  Keys: 'keys',
  'Student Card': 'cards',
  Cardholder: 'cards',
  Wallet: 'cards',
  Umbrella: 'umbrellas',
  Bag: 'bags',
}

export const FAMILY_LABELS = {
  electronics: 'Electronics',
  bottles: 'Bottles',
  keys: 'Keys',
  cards: 'Cards & IDs',
  umbrellas: 'Umbrellas',
  bags: 'Bags',
  other: 'Other',
}

export function categoryFamily(category) {
  return FAMILY_OF_CATEGORY[category] || 'other'
}

// Page fade-out length, shared by PageTransition and the router's scroll
export const PAGE_FADE_OUT_MS = 160

// The CSS variable holding a category's colour (defined in assets/tokens.css)
export function categoryColour(category) {
  return `var(--fi-cat-${categoryFamily(category)})`
}

// Same values as server/data/colours.json (checked by a test)
export const COLOUR_HEX = {
  Black: '#1a1a1a',
  White: '#f5f5f5',
  Grey: '#808080',
  Silver: '#c0c0c0',
  Gold: '#c9a43b',
  Blue: '#2f6fd6',
  Navy: '#1f2a5a',
  Red: '#c62828',
  Pink: '#f48fb1',
  Purple: '#7b4fa0',
  Green: '#2e7d32',
  Yellow: '#f2c94c',
  Orange: '#ef7d22',
  Brown: '#7b4a2a',
  Beige: '#d8c3a0',
}

// First colour, else the older single `colour`, else ''
export function mainColour(item) {
  if (Array.isArray(item?.colours) && item.colours.length) return item.colours[0]
  return item?.colour || ''
}

// ItemIcon colour: the item's colour, else neutral grey
export function itemIconColour(colourName) {
  return COLOUR_HEX[colourName] || 'var(--fi-cat-other)'
}

// Which drawing ItemIcon shows. Several categories share one.
const ICON_OF_CATEGORY = {
  'Water Bottle': 'bottle',
  'Student Card': 'card',
  Cardholder: 'card',
  Wallet: 'wallet',
  Umbrella: 'umbrella',
  Earbuds: 'earbuds',
  Headphones: 'earbuds',
  Keys: 'keys',
  Laptop: 'laptop',
  Tablet: 'phone',
  Phone: 'phone',
  Charger: 'charger',
  Bag: 'bag',
}

export function categoryIcon(category) {
  return ICON_OF_CATEGORY[category] || 'tag'
}

// Label and tone for each item state (see itemState in utils/feed.js)
export const STATUS_PILLS = {
  open: { label: 'Waiting for its owner', tone: 'brass' },
  matched: { label: 'Possible match', tone: 'navy' },
  claimed: { label: 'Claimed', tone: 'navy' },
  returned: { label: 'Back with its owner', tone: 'green' },
  resolved: { label: 'Back with its owner', tone: 'green' },
  disputed: { label: 'Disputed', tone: 'red' },
  archived: { label: 'Archived', tone: 'grey' },
}

export function statusPill(state) {
  return STATUS_PILLS[state] || { label: state || 'Unknown', tone: 'grey' }
}

// Two initials for the avatar: "Wei Ling Tan" -> "WL", "alex" -> "A"
export function initials(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

// Item numbers are shown the same way on every page, as four digits: 7 -> "0007"
export function itemDigits(id) {
  return String(id).padStart(4, '0')
}

// The same, for pages that have an item's id
export function ledgerNumber(id) {
  return itemDigits(id)
}

// The same, for pages that have the whole item
export function itemNumber(item) {
  return itemDigits(item?.id ?? '')
}

// A place, the same way on every page. The building uses its short name, as
// on the map ("LKS Library"). With full: true, the level and facility follow:
// "LKS Library, Level 2 · Service Desk"
export function placeName(spot, { full = false } = {}) {
  if (!spot) return 'Unknown place'
  const building = buildingLabel(spot.building)
  if (!full) return building
  return `${building}, ${spot.floor} · ${areaLabel(spot.area)}`
}
