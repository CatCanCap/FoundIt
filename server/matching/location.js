// OWNER: Member 3. The L (campus location) signal.
//
// locationScore(placeA, placeB)
//   placeA, placeB  { spot, room }: a campus spot ({ id, building, floor, area,
//                   linkedBuildings, rooms }) and, when the report named one,
//                   the room in it ({ id, name }), else null
// Returns { score, reasons }:
//   same room                                    100
//   same spot, one report didn't name a room      90
//   same spot, different rooms                    85
//   same spot with no rooms in it (a lobby)      100
//   same floor of one building                    80
//   same building                                 60
//   linked building                               30  (e.g. the Library and Campus Green)
//   anywhere else                                  0
//
// A spot is a building, a level and a kind of room ("SOA, Level 2, seminar
// rooms"), and some spots list their bookable rooms (SOA Seminar Room 2-4). Two
// reports in different seminar rooms on one level are close, but not the same
// room. Buildings count as linked if either one lists the other.
//
// placeOf(point, spotsById) turns a trail point ({ spotId, roomId }) into a place.
const { reason } = require('./reasons');

function placeName(spot) {
  return `${spot.building} ${spot.floor}`;
}

function isLinked(spotA, spotB) {
  const linksA = spotA.linkedBuildings || [];
  const linksB = spotB.linkedBuildings || [];
  return linksA.includes(spotB.building) || linksB.includes(spotA.building);
}

function placeOf(point, spotsById) {
  const spot = spotsById.get(point.spotId) || null;
  const room = spot && point.roomId
    ? (spot.rooms || []).find((entry) => entry.id === point.roomId) || null
    : null;
  return { spot, room };
}

function sameSpotScore(spot, roomA, roomB) {
  const hasRooms = (spot.rooms || []).length > 0;
  if (roomA && roomB && roomA.id === roomB.id) {
    return { score: 100, reasons: [reason('same room', roomA.name)] };
  }
  if (roomA && roomB) {
    return { score: 85, reasons: [reason('same area', `${placeName(spot)}, ${spot.area}`)] };
  }
  const score = hasRooms ? 90 : 100;
  return { score, reasons: [reason('same place', `${placeName(spot)}, ${spot.area}`)] };
}

function locationScore(placeA, placeB) {
  const spotA = placeA && placeA.spot;
  const spotB = placeB && placeB.spot;
  if (!spotA || !spotB) return { score: 0, reasons: [] };
  if (spotA.id === spotB.id) return sameSpotScore(spotA, placeA.room, placeB.room);
  if (spotA.building === spotB.building && spotA.floor === spotB.floor) {
    return { score: 80, reasons: [reason('same floor', placeName(spotA))] };
  }
  if (spotA.building === spotB.building) {
    return { score: 60, reasons: [reason('same building', spotA.building)] };
  }
  if (isLinked(spotA, spotB)) {
    return { score: 30, reasons: [reason('nearby buildings', `${spotA.building} and ${spotB.building}`)] };
  }
  return { score: 0, reasons: [] };
}

module.exports = { locationScore, placeOf, isLinked };
