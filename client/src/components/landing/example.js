// The one example the landing page follows, from the seeded demo data
// (server/data/seed-pairs.json): Alice's White AirPods Pro case, its
// three-stop trail, the find it matches best and the handoff. The hero's match
// card and How it works both show it.
//
// The score and its parts are what the matching engine gives this pair
// (server/matching/index.js, weights C 0.15, A 0.55, L 0.25, D 0.05): change
// SCORE and PARTS here if the weights change.

export const LOST = { title: 'White AirPods Pro case', category: 'Earbuds', colour: 'White' }
export const FOUND = { title: 'AirPods case with sticker', category: 'Earbuds', colour: 'White' }

export const TRAIL = [
  { place: 'SOE/SCIS 2', detail: 'Level 2 · seminar rooms', time: '8:15–11:30 am' },
  { place: 'LKS Library', detail: 'Level 3 · quiet study areas', time: '12–3 pm', hit: true },
  { place: 'Concourse', detail: 'Basement 1 · Koufu food court', time: '3–3:45 pm' },
]

export const SCORE = 93
export const BIGGEST_PART = 55
export const PARTS = [
  { label: 'Category', reason: 'Both earbuds', earned: 15, max: 15 },
  { label: 'Details', reason: 'White, Apple, a cat sticker', earned: 48, max: 55 },
  { label: 'Place', reason: 'Stop 2 on the trail', earned: 25, max: 25 },
  { label: 'Time', reason: 'An hour after', earned: 5, max: 5 },
]

export const HANDOFF = [
  { who: 'Finder', did: 'Marked it handed over' },
  { who: 'Owner', did: 'Confirmed it’s back' },
]
