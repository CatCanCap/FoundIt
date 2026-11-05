// Turns the seed JSON files into the same objects the database will hold.
// Member 3 can call loadSeed() in unit tests with no database.
const categories = require('./categories.json');
const colours = require('./colours.json');
const campusSpots = require('./campus-spots.json');
const demoUsers = require('./demo-users.json');
const seedPairs = require('./seed-pairs.json');
const { HOUR, DAY, SINGAPORE_OFFSET_HOURS } = require('../lib/time');

// The moment `daysAgo` Singapore days before `now`, at `time` ('HH:MM') Singapore time.
function resolveTime(now, daysAgo, time) {
  const [hours, minutes] = time.split(':').map(Number);
  const singaporeNow = new Date(now.getTime() + SINGAPORE_OFFSET_HOURS * HOUR);
  return new Date(Date.UTC(
    singaporeNow.getUTCFullYear(),
    singaporeNow.getUTCMonth(),
    singaporeNow.getUTCDate() - daysAgo,
    hours - SINGAPORE_OFFSET_HOURS,
    minutes,
  ));
}

function loadSeed(now = new Date()) {
  // The bookable rooms from SMU's booking system, each in one spot. Ids and
  // positions follow file order.
  const rooms = campusSpots.spots.flatMap((spot, index) => (spot.rooms || []).map((name) => ({
    spotId: index + 1,
    name,
  }))).map((room, index) => ({ id: index + 1, ...room, position: index + 1 }));

  const spots = campusSpots.spots.map((spot, index) => ({
    id: index + 1,
    building: spot.building,
    floor: spot.floor,
    area: spot.area,
    coordinates: { lat: spot.lat, lng: spot.lng },
    linkedBuildings: campusSpots.buildings[spot.building] || [],
    isCollectionPoint: spot.isCollectionPoint === true,
    // The order the API lists places in (file order)
    position: index + 1,
    // As GET /api/spots shows them: [{ id, name }], in room-number order
    rooms: rooms.filter((room) => room.spotId === index + 1).map(({ id, name }) => ({ id, name })),
  }));
  const spotIdByKey = new Map(campusSpots.spots.map((spot, index) => [spot.key, index + 1]));

  // Every row lists every key (a missing one would be saved as NULL), so
  // users without a role in the JSON get the normal 'user' role here
  // Demo accounts count as verified, so they can post and claim straight away.
  const users = demoUsers.map((user, index) => ({
    id: index + 1, role: 'user', ...user, emailVerifiedAt: now.toISOString(),
  }));

  const items = [];

  // Lost items belong to user 1, found items to user 2, decoys to user 3
  function addItem(raw, type, postedBy) {
    const trail = raw.trail.map((point) => {
      if (!spotIdByKey.has(point.spot)) throw new Error(`Unknown spot key: ${point.spot}`);
      return {
        spotId: spotIdByKey.get(point.spot),
        // The seed's reports name an area, not a room
        roomId: null,
        from: resolveTime(now, raw.daysAgo, point.from).toISOString(),
        to: resolveTime(now, raw.daysAgo, point.to).toISOString(),
      };
    });
    const lastSeen = new Date(trail[trail.length - 1].to);
    const item = {
      id: items.length + 1,
      type,
      title: raw.title,
      description: raw.description,
      category: raw.category,
      // Up to 3 colours, main colour first; colour is the main one, as stored in items.colour
      colours: raw.colours || (raw.colour ? [raw.colour] : []),
      colour: (raw.colours && raw.colours[0]) || raw.colour || null,
      brand: raw.brand || null,
      photoUrl: null,
      status: 'open',
      // Set when 3 reports hide a post (feature 5)
      hiddenAt: null,
      postedBy,
      // Reported half an hour after the last time in the trail, but never in the future
      createdAt: new Date(Math.min(lastSeen.getTime() + 30 * 60 * 1000, now.getTime() - 60 * 1000)).toISOString(),
      trail,
    };
    items.push(item);
    return item;
  }

  const pairs = seedPairs.pairs.map((pair) => {
    const lost = addItem(pair.lost, 'lost', users[0].id);
    const found = addItem(pair.found, 'found', users[1].id);
    return { pairId: pair.pairId, lostItemId: lost.id, foundItemId: found.id, note: pair.note };
  });

  const decoyItemIds = seedPairs.decoys.map((decoy) => addItem(decoy, decoy.type, users[2].id).id);

  return { categories, colours, spots, rooms, users, items, pairs, decoyItemIds };
}

module.exports = { loadSeed, resolveTime, DAY };
