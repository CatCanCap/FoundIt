// Helpers for picking a building, level and facility on the found report

// A number for sorting levels: Basement 2 is -2, Level 3 is 3
function floorRank(floor) {
  const basement = floor.match(/^Basement (\d+)/)
  if (basement) return -Number(basement[1])
  const level = floor.match(/^Level (\d+)/)
  return level ? Number(level[1]) : 0
}

// The spots in one building, lowest level first
export function spotsInBuilding(spots, building) {
  return spots
    .filter((spot) => spot.building === building)
    .sort((a, b) => floorRank(a.floor) - floorRank(b.floor))
}

// The levels of one building, lowest first, without repeats
export function floorsInBuilding(spots, building) {
  const floors = spotsInBuilding(spots, building).map((spot) => spot.floor)
  return [...new Set(floors)]
}

// The spots on one level of one building
export function spotsOnFloor(spots, building, floor) {
  return spotsInBuilding(spots, building).filter((spot) => spot.floor === floor)
}

// Words that stay lower case inside a name, like "by" in "TripletS by Bakery Cuisine"
const SMALL_WORDS = ['a', 'and', 'by', 'of', 'the']

// "project rooms" becomes "Project Rooms". Words that already start with a
// capital, like "MRT" or "Koufu", stay as they are.
export function areaLabel(area) {
  const words = area.split(' ').map((word, index) => {
    if (index > 0 && SMALL_WORDS.includes(word)) return word
    return word.charAt(0).toUpperCase() + word.slice(1)
  })
  return words.join(' ')
}
