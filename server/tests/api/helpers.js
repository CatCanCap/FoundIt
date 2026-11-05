// Shared helpers for API tests (CommonJS so tests can require it).
const request = require('supertest');
const supabase = require('../../lib/db');
const { unwrap } = require('../../lib/errors');

// The tests' photo links use Cloudinary's demo account, so the check for our own
// account (CLOUDINARY_CLOUD_NAME in config.env) is switched off here, as it is
// for anyone who has not filled that setting in.
delete process.env.CLOUDINARY_CLOUD_NAME;
const { sign } = require('../../lib/token');
const User = require('../../models/user-model');

// Never wipe the live database from a test run
function assertTestDatabase() {
  if (process.env.DB_TARGET !== 'test') {
    throw new Error('API tests must run against the test database (DB_TARGET=test)');
  }
}

async function truncateAll() {
  assertTestDatabase();
  unwrap(await supabase.rpc('reset_all_tables'));
}

let counter = 0;

async function registerUser(app, overrides = {}) {
  counter += 1;
  const { verified, ...fields } = overrides;
  const body = {
    name: 'Test User',
    email: `tester${counter}@scis.smu.edu.sg`,
    password: 'password123',
    ...fields,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  // Most tests need a user who can post, so skip the emailed code. Pass
  // { verified: false } to keep the account unverified.
  if (verified !== false) {
    unwrap(await supabase.from('users').update({ email_verified_at: new Date().toISOString() }).eq('email', res.body.email));
  }
  // Register no longer logs in (the emailed code does), so make the login
  // token here. An unverified one stands for an older login made before that
  // change, which may still read but not change anything.
  const user = await User.findByEmail(res.body.email);
  return { token: sign(user.id, user.passwordHash), user: User.toPublic(user), verificationSent: res.body.verificationSent };
}

// A tiny fixed data set for tests that do not need the full seed
async function insertBasics() {
  assertTestDatabase();
  unwrap(await supabase.from('categories').insert([
    { name: 'Umbrella', related: [] },
    { name: 'Wallet', related: ['Cardholder'] },
  ]));
  // Every row lists every column: a bulk insert fills missing ones with NULL
  const spots = unwrap(await supabase.from('campus_spots').insert([
    { building: 'SCIS 1', floor: 'Level 2', area: 'lift lobby', lat: 1.2973, lng: 103.8494, linked_buildings: ['Concourse'], is_collection_point: false },
    { building: 'Li Ka Shing Library', floor: 'Level 2', area: 'service desk', lat: 1.2966, lng: 103.8499, linked_buildings: [], is_collection_point: true },
    { building: 'Concourse', floor: 'Basement 1', area: 'Koufu food court', lat: 1.2962, lng: 103.8504, linked_buildings: [], is_collection_point: false },
  ]).select());
  // Two bookable rooms in the first spot
  const rooms = unwrap(await supabase.from('campus_rooms').insert([
    { spot_id: spots[0].id, name: 'SCIS1 GSR 2-1', position: 1 },
    { spot_id: spots[0].id, name: 'SCIS1 GSR 2-2', position: 2 },
  ]).select());
  return { spotIds: spots.map((spot) => spot.id), roomIds: rooms.map((room) => room.id) };
}

// The API never changes a role, so tests make an admin directly
async function makeAdmin(userId) {
  assertTestDatabase();
  unwrap(await supabase.from('users').update({ role: 'admin' }).eq('id', userId));
}

module.exports = { assertTestDatabase, truncateAll, registerUser, insertBasics, makeAdmin };
