// Campus map layout. `area` places each building on the drawn map's grid;
// names must match the spots' `building`. Unlisted buildings go in extra rows.

const CAMPUS_LAYOUT = [
  { building: 'SCIS 1', label: 'SCIS 1', area: '1 / 1 / 2 / 2' },
  { building: 'SOA', label: 'SOA', area: '2 / 1 / 3 / 2' },
  { building: 'SOSS/CIS', label: 'SOSS / CIS', area: '3 / 1 / 4 / 2' },
  { building: 'SOE/SCIS 2', label: 'SOE / SCIS 2', area: '1 / 2 / 2 / 3' },
  { building: 'Li Ka Shing Library', label: 'LKS Library', area: '2 / 2 / 3 / 3' },
  { building: 'SMU Connexion', label: 'Connexion', area: '3 / 2 / 4 / 3' },
  { building: 'Campus Green', label: 'Campus Green', area: '1 / 3 / 2 / 4', green: true },
  { building: 'YPHSL', label: 'YPHSL', area: '2 / 3 / 4 / 4' },
  { building: 'LKCSB', label: 'LKCSB', area: '1 / 4 / 2 / 5' },
  { building: 'Administration Building', label: 'Admin Bldg', area: '2 / 4 / 3 / 5' },
  { building: 'Concourse', label: 'Concourse B1', area: '3 / 4 / 4 / 5' },
]

const ROWS = 3
const COLUMNS = 4

// Short name for a building, e.g. 'LKS Library'
export function buildingLabel(building) {
  const known = CAMPUS_LAYOUT.find((entry) => entry.building === building)
  return known ? known.label : building
}

// Tiles for the drawn map; unknown buildings fill extra rows
export function mapTiles(buildings) {
  const present = new Set(buildings)
  const tiles = CAMPUS_LAYOUT.filter((entry) => present.has(entry.building))

  const extras = [...present]
    .filter((building) => !CAMPUS_LAYOUT.some((entry) => entry.building === building))
    .sort((a, b) => a.localeCompare(b))
  extras.forEach((building, index) => {
    const row = ROWS + 1 + Math.floor(index / COLUMNS)
    const column = (index % COLUMNS) + 1
    tiles.push({
      building,
      label: building,
      area: `${row} / ${column} / ${row + 1} / ${column + 1}`,
    })
  })

  return tiles
}

// Unique building names from GET /api/spots
export function buildingsFromSpots(spots) {
  return [...new Set(spots.map((spot) => spot.building))]
}

// What a screen reader says for a building on either map:
// 'SCIS 1, 3 items, stop 1 and 2'. On the lost map items are 'lost reports'.
export function describeBuilding(label, count, stopNumbers, tone) {
  const parts = [label]
  if (count) {
    const noun = tone === 'lost' ? 'lost report' : 'item'
    parts.push(`${count} ${noun}${count === 1 ? '' : 's'}`)
  }
  if (stopNumbers && stopNumbers.length) parts.push(`stop ${stopNumbers.join(' and ')}`)
  return parts.join(', ')
}

// Hotspot size 0 to 1 (square root, so area tracks the count)
export function heatScale(count, maxCount) {
  if (!count || !maxCount) return 0
  return Math.sqrt(count / maxCount)
}

// ---- Mapbox helpers ----

// Where SMU is, for the map's first view: [lng, lat], the order Mapbox uses
export const SMU_CENTRE = [103.8501, 1.2963]

// One point per building at the average of its spots
export function buildingCentres(spots) {
  const sums = new Map()
  for (const spot of spots) {
    if (!spot.coordinates) continue
    const sum = sums.get(spot.building) || { lat: 0, lng: 0, n: 0 }
    sum.lat += spot.coordinates.lat
    sum.lng += spot.coordinates.lng
    sum.n += 1
    sums.set(spot.building, sum)
  }
  return [...sums.entries()].map(([building, sum]) => ({
    building,
    label: buildingLabel(building),
    lng: sum.lng / sum.n,
    lat: sum.lat / sum.n,
  }))
}

// Building centres from OpenStreetMap (checked 2026-10-21). Buildings not
// listed fall back to the average of their spots.
export const LABEL_POSITIONS = {
  'SOE/SCIS 2': { lat: 1.297879, lng: 103.848908 },
  'SCIS 1': { lat: 1.297426, lng: 103.849597 },
  'Li Ka Shing Library': { lat: 1.296262, lng: 103.850148 },
  SOA: { lat: 1.295719, lng: 103.849769 },
  LKCSB: { lat: 1.295197, lng: 103.850554 },
  'SMU Connexion': { lat: 1.2956, lng: 103.849211 },
  YPHSL: { lat: 1.295053, lng: 103.849058 },
  'SOSS/CIS': { lat: 1.294587, lng: 103.848611 },
}

// Marker positions: known building centres, else the spots' average
export function labelCentres(spots) {
  return buildingCentres(spots).map((centre) => {
    const known = LABEL_POSITIONS[centre.building]
    return known ? { ...centre, lat: known.lat, lng: known.lng } : centre
  })
}

// Spots moved to their building's marker, so the heatmap lines up
export function spotsAtMarkers(spots) {
  const centres = new Map(labelCentres(spots).map((centre) => [centre.building, centre]))
  return spots.map((spot) => {
    const centre = centres.get(spot.building)
    return centre ? { ...spot, coordinates: { lat: centre.lat, lng: centre.lng } } : spot
  })
}

// Heatmap points as GeoJSON, one per spot. Each point's weight is its count
// against the busiest spot, from 0 to 1. Spots without coordinates are skipped.
export function heatGeoJson(spotCounts, spots) {
  const spotById = new Map(spots.map((spot) => [Number(spot.id), spot]))
  const placed = spotCounts.filter(({ spotId }) => spotById.get(Number(spotId))?.coordinates)
  const max = Math.max(1, ...placed.map(({ count }) => count))
  return {
    type: 'FeatureCollection',
    features: placed.map(({ spotId, count }) => {
      const { lat, lng } = spotById.get(Number(spotId)).coordinates
      return {
        type: 'Feature',
        properties: { weight: count / max },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      }
    }),
  }
}
