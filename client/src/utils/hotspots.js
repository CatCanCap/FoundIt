import { buildingLabel } from './campus-layout'

// Display helpers for the Map page

// 5.2 -> '5.2 h', 43 -> '1.8 d', null -> '–'
export function formatReturnTime(hours) {
  if (hours === null || hours === undefined) return '–'
  if (hours < 24) return `${Math.round(hours * 10) / 10} h`
  return `${Math.round((hours / 24) * 10) / 10} d`
}

// 71 -> '71%', null -> '–'
export function formatPercent(value) {
  return value === null || value === undefined ? '–' : `${value}%`
}

// buildings from GET /api/stats/hotspots -> { building: count }
export function countsByBuilding(buildings) {
  return Object.fromEntries(buildings.map((entry) => [entry.building, entry.count]))
}

// 0 -> '12am', 13 -> '1pm'
export function hourLabel(hour) {
  const h = ((hour % 24) + 24) % 24
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}${h < 12 ? 'am' : 'pm'}`
}

// Busiest hour (earliest on a tie), or null
export function busiestHour(byHour) {
  let best = null
  byHour.forEach((count, hour) => {
    if (count > 0 && (best === null || count > byHour[best])) best = hour
  })
  return best
}

// How many days back each view counts: finds this week, lost reports 30 days
export const MAP_DAYS = { found: 7, lost: 30 }

// The category chips that cover at least one category: [{ family, label, categories }]
export function categoryFamilies(categories, familyOf, labels) {
  return Object.keys(labels)
    .map((family) => ({
      family,
      label: labels[family],
      categories: categories.map((entry) => entry.name).filter((name) => familyOf(name) === family),
    }))
    .filter((entry) => entry.categories.length > 0)
}

// Ranking with bar widths relative to the top building (share 0 to 100)
export function rankBuildings(buildings, limit = 5) {
  const top = buildings[0]?.count || 0
  return buildings.slice(0, limit).map((entry) => ({
    ...entry,
    share: top ? Math.round((entry.count / top) * 100) : 0,
  }))
}

// Newest items in a building (a lost report counts if any stop is there)
export function itemsInBuilding(items, spotsById, building) {
  return items
    .filter((item) =>
      item.trail.some((point) => spotsById.get(point.spotId)?.building === building),
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

// The tip under the map
export function mapTip(mode, stats) {
  const top = stats?.buildings?.[0]
  if (!top) {
    return mode === 'lost'
      ? 'Nothing reported lost in the last 30 days.'
      : 'Nothing handed in yet this week.'
  }
  if (mode === 'lost') {
    const things = top.count === 1 ? 'thing went' : 'things went'
    return `Check ${buildingLabel(top.building)} first. ${top.count} ${things} missing there.`
  }
  const hour = busiestHour(stats.byHour || [])
  const when = hour === null ? '' : ` around ${hourLabel(hour)}`
  return `Things turn up most at ${buildingLabel(top.building)}${when}.`
}
