// A big moment (a match arriving, an item coming home) plays once. Coming back
// to the same page shows it finished, because people visit these pages often.
// Remembered until the page is reloaded.
const seen = new Set()

// True the first time it is asked about this key
export function firstSight(key) {
  if (seen.has(key)) return false
  seen.add(key)
  return true
}
