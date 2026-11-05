// Hotspot figures for the Map page (no database access). A found item counts
// at its one spot; a lost report counts once in each building on its trail.

const { HOUR, SINGAPORE_OFFSET_HOURS } = require('../lib/time');

function median(numbers) {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function roundTo(number, places) {
  if (number === null) return null;
  const factor = 10 ** places;
  return Math.round(number * factor) / factor;
}

// Whole percent, or null when there is nothing to divide by
function percent(part, whole) {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

// Hour of the day (0 to 23) in Singapore time
function singaporeHour(isoString) {
  return (new Date(isoString).getUTCHours() + SINGAPORE_OFFSET_HOURS) % 24;
}

// The trail points an item counts at
function countedPoints(item, buildingOf) {
  const trail = item.trail || [];
  if (item.type !== 'lost') return trail.slice(0, 1);
  const seen = new Set();
  return trail.filter((point) => {
    const building = buildingOf.get(Number(point.spotId)) || 'Unknown place';
    if (seen.has(building)) return false;
    seen.add(building);
    return true;
  });
}

// Returns { buildings, spots, byHour }. buildings and spots are sorted
// by count; byHour is 24 counts in Singapore time.
exports.summariseHotspots = function ({ items, spots, returns = new Map() }) {
  const buildingOf = new Map(spots.map((spot) => [Number(spot.id), spot.building]));
  const groups = new Map();
  const spotCounts = new Map();
  const byHour = new Array(24).fill(0);

  for (const item of items) {
    const points = countedPoints(item, buildingOf);
    if (points.length === 0) continue;
    const isResolved = item.status === 'resolved';
    const completedAt = isResolved ? returns.get(Number(item.id)) : null;
    const hours = completedAt ? (new Date(completedAt) - new Date(item.createdAt)) / HOUR : -1;

    for (const point of points) {
      const building = buildingOf.get(Number(point.spotId)) || 'Unknown place';
      if (!groups.has(building)) groups.set(building, { count: 0, resolved: 0, returnHours: [] });
      const group = groups.get(building);
      group.count += 1;
      spotCounts.set(Number(point.spotId), (spotCounts.get(Number(point.spotId)) || 0) + 1);
      byHour[singaporeHour(point.from)] += 1;
      if (isResolved) group.resolved += 1;
      if (hours >= 0) group.returnHours.push(hours);
    }
  }

  const buildings = [...groups.entries()]
    .map(([building, group]) => ({
      building,
      count: group.count,
      resolved: group.resolved,
      resolutionRate: percent(group.resolved, group.count),
      medianReturnHours: roundTo(median(group.returnHours), 1),
    }))
    .sort((a, b) => b.count - a.count || a.building.localeCompare(b.building));

  return {
    buildings,
    spots: [...spotCounts.entries()]
      .map(([spotId, count]) => ({ spotId, count }))
      .sort((a, b) => b.count - a.count || a.spotId - b.spotId),
    byHour,
  };
};

// The figures without any building, spot or hour counted fewer than `min`
// times, so none of them points at a single item. hidden is true when
// anything was left out, so the page can say why.
exports.hideSmallCounts = function (summary, min) {
  const buildings = summary.buildings.filter((entry) => entry.count >= min);
  const spots = summary.spots.filter((entry) => entry.count >= min);
  const byHour = summary.byHour.map((count) => (count >= min ? count : 0));
  const hidden = buildings.length < summary.buildings.length
    || spots.length < summary.spots.length
    || byHour.some((count, hour) => count !== summary.byHour[hour]);
  return { ...summary, buildings, spots, byHour, hidden };
};

exports.median = median;
