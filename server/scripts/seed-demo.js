// Adds the demo accounts and their stories (data/demo-showcase.json) to a
// database WITHOUT wiping anything else: real accounts and their reports stay.
//   node scripts/seed-demo.js --dry-run          -> builds and checks everything, no database
//   node scripts/seed-demo.js                    -> the database in config.env (test)
//   node scripts/seed-demo.js --live --yes       -> the database in config.live.env (live)
// The demo accounts share one password, given as DEMO_PASSWORD (8 or more
// characters), so it is never written in the repo:
//   DEMO_PASSWORD='...' node scripts/seed-demo.js --live --yes
// Run scripts/upload-demo-photos.js first, so data/demo-photos.json has the photo links.
//
// Running it again first deletes the demo accounts (found by email), which
// deletes everything they posted with them, then adds it all again with fresh
// dates. Do that the day before the presentation so the stories are recent.
if (process.argv.includes('--live')) {
  process.env.ENV_FILE = 'config.live.env';
}

const fs = require('fs');
const path = require('path');
const { loadDemo } = require('../data/load-demo');

const PHOTOS_FILE = path.join(__dirname, '../data/demo-photos.json');
const dryRun = process.argv.includes('--dry-run');

function readPhotoUrls() {
  return fs.existsSync(PHOTOS_FILE) ? JSON.parse(fs.readFileSync(PHOTOS_FILE, 'utf8')) : {};
}

function summarise(data) {
  const count = (rows, status) => rows.filter((row) => row.status === status).length;
  return {
    users: data.users.length,
    items: data.items.length,
    matches: `${data.matches.length} (${count(data.matches, 'suggested')} suggested, ${count(data.matches, 'claimed')} claimed, ${count(data.matches, 'confirmed')} confirmed, ${count(data.matches, 'rejected')} rejected)`,
    claims: data.claims.length,
    messages: data.messages.length,
    handoffs: data.handoffs.length,
    disputes: data.disputes.length,
    reports: data.reports.length,
    adminActions: data.adminActions.length,
    appeals: data.appeals.length,
  };
}

async function seedDemo({ now = new Date(), password }) {
  const supabase = require('../lib/db');
  const { unwrap } = require('../lib/errors');
  const { toSnake } = require('../lib/case');
  const { hash } = require('../lib/hash');
  const Spot = require('../models/spot-model');
  const Category = require('../models/category-model');
  const Colour = require('../models/colour-model');

  // Stop before changing anything if a migration this data needs is missing,
  // so a run never ends half done
  const needs = [
    ['appeals', 'id', '20261103000000_suspension_appeals.sql'],
    ['item_trail_points', 'room_id', '20261026000000_campus_room_list.sql'],
  ];
  for (const [table, column, migration] of needs) {
    const { error } = await supabase.from(table).select(column).limit(1);
    if (error) throw new Error(`${table}.${column} is missing. Apply ${migration} to this database first.`);
  }

  const [spots, categories, colours] = await Promise.all([Spot.findAll(), Category.findAll(), Colour.findAll()]);
  const data = loadDemo({ now, spots, categories, colours, photoUrls: readPhotoUrls() });
  const missing = data.photoKeys.filter((key) => !readPhotoUrls()[key]);
  if (missing.length > 0) {
    throw new Error(`No photo link for ${missing.join(', ')}. Run node scripts/upload-demo-photos.js first.`);
  }

  // 1. Delete the demo accounts from an earlier run. Their reports, matches,
  //    claims, chats, handoffs, disputes, reports and appeals go with them
  //    (on delete cascade). The action log only loses the user, so remove the
  //    log rows about them or by them first.
  const emails = data.users.map((user) => user.email);
  const old = unwrap(await supabase.from('users').select('id').in('email', emails)).map((row) => row.id);
  if (old.length > 0) {
    const list = old.join(',');
    unwrap(await supabase.from('admin_actions').delete().or(`admin_id.in.(${list}),user_id.in.(${list})`));
    unwrap(await supabase.from('users').delete().in('id', old));
  }

  // 2. Insert in order, swapping each key for the id the database gave it.
  //    One row per call keeps every id certain; there are only a few hundred.
  async function insert(table, row) {
    return unwrap(await supabase.from(table).insert(toSnake(row)).select('id').single()).id;
  }
  const passwordHash = await hash(password);
  const userId = new Map();
  for (const { key, ...user } of data.users) {
    userId.set(key, await insert('users', { ...user, passwordHash }));
  }

  const itemId = new Map();
  for (const item of data.items) {
    const { id, key, trail, colours: itemColours, photoKey, postedBy, ...rest } = item;
    const newId = await insert('items', { ...rest, postedBy: userId.get(postedBy) });
    itemId.set(key, newId);
    unwrap(await supabase.from('item_trail_points').insert(trail.map((point, index) => ({
      item_id: newId, spot_id: point.spotId, room_id: point.roomId,
      from_time: point.from, to_time: point.to, position: index,
    }))));
    if (itemColours.length > 0) {
      unwrap(await supabase.from('item_colours').insert(itemColours.map((colour, index) => ({
        item_id: newId, colour, position: index + 1,
      }))));
    }
  }

  const matchId = new Map();
  for (const { lost, found, ...match } of data.matches) {
    matchId.set(`${lost}|${found}`, await insert('matches', {
      ...match, lostItemId: itemId.get(lost), foundItemId: itemId.get(found),
    }));
  }

  const claimId = new Map();
  const claimMatch = new Map();
  for (const { key, lost, found, claimer, ...claim } of data.claims) {
    const id = matchId.get(`${lost}|${found}`);
    claimMatch.set(key, id);
    claimId.set(key, await insert('claims', { ...claim, matchId: id, claimerId: userId.get(claimer) }));
  }

  const messageId = new Map();
  for (const { key, claim, sender, ...message } of data.messages) {
    const id = await insert('messages', { ...message, matchId: claimMatch.get(claim), senderId: userId.get(sender) });
    if (key) messageId.set(key, id);
  }

  for (const { claim, ...handoff } of data.handoffs) {
    await insert('handoffs', { ...handoff, matchId: claimMatch.get(claim) });
  }

  for (const { claim, item, raisedBy, lostItem, proofKey, ...dispute } of data.disputes) {
    await insert('disputes', {
      ...dispute, claimId: claimId.get(claim), itemId: itemId.get(item),
      raisedBy: userId.get(raisedBy), lostItemId: itemId.get(lostItem),
    });
  }

  const reportId = new Map();
  for (const { key, message, item, reportedBy, decidedBy, ...report } of data.reports) {
    reportId.set(key, await insert('reports', {
      ...report,
      messageId: message ? messageId.get(message) : null,
      itemId: item ? itemId.get(item) : null,
      reportedBy: userId.get(reportedBy),
      decidedBy: decidedBy ? userId.get(decidedBy) : null,
    }));
  }

  for (const { admin, report, user, item, message, ...action } of data.adminActions) {
    await insert('admin_actions', {
      ...action,
      adminId: userId.get(admin),
      reportId: report ? reportId.get(report) : null,
      userId: user ? userId.get(user) : null,
      itemId: item ? itemId.get(item) : null,
      messageId: message ? messageId.get(message) : null,
    });
  }

  for (const { user, ...appeal } of data.appeals) {
    await insert('appeals', { ...appeal, userId: userId.get(user) });
  }

  return summarise(data);
}

module.exports = { seedDemo };

if (require.main === module) {
  if (dryRun) {
    // The reference lists from the JSON files stand in for the database's
    const { loadSeed } = require('../data/load');
    const seed = loadSeed(new Date());
    const photoUrls = readPhotoUrls();
    const data = loadDemo({ spots: seed.spots, categories: seed.categories, colours: seed.colours, photoUrls });
    console.log('Dry run, nothing saved:', summarise(data));
    const missing = data.photoKeys.filter((key) => !photoUrls[key]);
    if (missing.length > 0) console.log(`Photos not uploaded yet: ${missing.join(', ')}`);
    for (const match of [...data.matches].sort((a, b) => b.score - a.score)) {
      console.log(`  ${String(match.score).padEnd(5)} ${match.status.padEnd(10)} ${match.lost} <-> ${match.found}`);
    }
    process.exit(0);
  }

  // Loads config.env (or config.live.env with --live), which sets DB_TARGET
  require('../lib/config');
  const target = process.env.DB_TARGET;
  const wantsLive = process.argv.includes('--live');
  const password = process.env.DEMO_PASSWORD;
  let problem = null;
  if (target !== 'test' && target !== 'live') problem = 'DB_TARGET in the settings file must be "test" or "live".';
  else if (wantsLive !== (target === 'live')) problem = `Asked for ${wantsLive ? 'live' : 'test'} but the settings file says DB_TARGET=${target}.`;
  else if (target === 'live' && !process.argv.includes('--yes')) problem = 'This adds the demo accounts to the LIVE database. Run again with --live --yes.';
  else if (!password || password.length < 8) problem = 'Set DEMO_PASSWORD (8 or more characters) for the demo accounts.';
  if (problem) {
    console.error(`Refusing to seed: ${problem}`);
    process.exit(1);
  }

  seedDemo({ password })
    .then((counts) => console.log(`Added the demo data to the ${target} database:`, counts))
    .catch((error) => {
      console.error('Demo seeding failed:', error.message);
      process.exit(1);
    });
}
