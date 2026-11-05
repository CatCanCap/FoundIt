// Helpers for campus spots (a building, level and area)
import { placeName } from './design'

// "LKS Library, Level 2 · Service Desk": the full place, as every page shows it
export function spotName(spot) {
  return placeName(spot, { full: true })
}
