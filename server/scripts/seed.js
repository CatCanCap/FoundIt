// Empties the database and loads the seed data.
//   npm run seed                 -> the database in config.env (test)
//   npm run seed:live -- --yes   -> the database in config.live.env (live)
// From the command line it also saves the matches the engine finds between
// the seeded items (matching/seed-matches.js), so the Matches page has finds.
// API tests call seedDatabase() without them, so they start with no matches.
if (process.argv.includes('--live')) {
  process.env.ENV_FILE = 'config.live.env';
}

const supabase = require('../lib/db');
const { unwrap } = require('../lib/errors');
const { toSnake } = require('../lib/case');
const { hash } = require('../lib/hash');
const { loadSeed } = require('../data/load');
const { checkSeedTarget } = require('../lib/seed-guard');
const { seedMatches } = require('../matching/seed-matches');
const Colour = require('../models/colour-model');

async function seedDatabase({ now = new Date(), withMatches = false } = {}) {
  const seed = loadSeed(now);

  unwrap(await supabase.rpc('reset_all_tables'));

  unwrap(await supabase.from('categories').insert(seed.categories));
  // The colour list is not emptied by reset_all_tables (items keep using it),
  // so bring it up to date with data/colours.json instead
  await Colour.saveAll(seed.colours);

  unwrap(await supabase.from('campus_spots').insert(seed.spots.map((spot) => {
    const { coordinates, rooms, ...rest } = spot;
    return toSnake({ ...rest, lat: coordinates.lat, lng: coordinates.lng });
  })));
  unwrap(await supabase.from('campus_rooms').insert(seed.rooms.map(toSnake)));

  const userRows = [];
  for (const user of seed.users) {
    const { password, ...rest } = user;
    userRows.push(toSnake({ ...rest, passwordHash: await hash(password) }));
  }
  unwrap(await supabase.from('users').insert(userRows));

  unwrap(await supabase.from('items').insert(seed.items.map((item) => {
    const { trail, colours, ...rest } = item;
    return toSnake(rest);
  })));

  const trailRows = [];
  for (const item of seed.items) {
    item.trail.forEach((point, index) => {
      trailRows.push({
        item_id: item.id, spot_id: point.spotId, room_id: point.roomId,
        from_time: point.from, to_time: point.to, position: index,
      });
    });
  }
  unwrap(await supabase.from('item_trail_points').insert(trailRows));

  const colourRows = seed.items.flatMap((item) => item.colours.map((colour, index) => ({
    item_id: item.id, colour, position: index + 1,
  })));
  if (colourRows.length) unwrap(await supabase.from('item_colours').insert(colourRows));

  const matchRows = withMatches ? seedMatches(seed) : [];
  if (matchRows.length > 0) {
    unwrap(await supabase.from('matches').insert(matchRows.map(toSnake)));
  }

  // Explicit ids were used above, so move the id counters past them
  unwrap(await supabase.rpc('sync_id_sequences'));

  return {
    categories: seed.categories.length,
    spots: seed.spots.length,
    rooms: seed.rooms.length,
    users: seed.users.length,
    items: seed.items.length,
    matches: matchRows.length,
  };
}

module.exports = { seedDatabase };

// Run only when called from the command line, not when required by a test
if (require.main === module) {
  const target = process.env.DB_TARGET;
  const problem = checkSeedTarget({
    target,
    wantsLive: process.argv.includes('--live'),
    confirmed: process.argv.includes('--yes'),
  });
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  seedDatabase({ withMatches: true })
    .then((counts) => {
      console.log(`Seeded the ${target} database:`, counts);
    })
    .catch((error) => {
      console.error('Seeding failed:', error.message);
      process.exit(1);
    });
}
