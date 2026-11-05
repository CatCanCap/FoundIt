// OWNER of the handoff feature: Member 5. These functions are the database access.
const supabase = require('../lib/db');
const { toCamel, toSnake } = require('../lib/case');
const { unwrap } = require('../lib/errors');
const { allPages } = require('../lib/all-pages');

const TABLE = 'handoffs';

// data: { matchId, method, spotId, scheduledAt }  method: 'meetup' or 'drop-off'
exports.create = async function (data) {
  return toCamel(unwrap(await supabase.from(TABLE).insert(toSnake(data)).select().single()));
};

exports.findById = async function (id) {
  return toCamel(unwrap(await supabase.from(TABLE).select().eq('id', id).maybeSingle()));
};

exports.findByMatch = async function (matchId) {
  const result = await supabase.from(TABLE).select().eq('match_id', matchId)
    .order('id', { ascending: false });
  return unwrap(result).map(toCamel);
};

// Every handoff on any of these matches, oldest first (for an item's timeline)
exports.findByMatches = async function (matchIds) {
  if (matchIds.length === 0) return [];
  return unwrap(await supabase.from(TABLE).select().in('match_id', matchIds).order('id')).map(toCamel);
};

// Every handoff, for the resolution-rate figures (Member 4)
exports.findAll = async function () {
  return unwrap(await supabase.from(TABLE).select().order('id')).map(toCamel);
};

// The completed handoffs, for when each returned item was given back (Member 4)
exports.findCompleted = async function () {
  // Page by page: this list only grows, and passes 1000 rows in time
  const rows = await allPages(() => supabase.from(TABLE).select()
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .order('id'));
  return rows.map(toCamel);
};

// Handoffs the finder marked handed over before `date` that the owner never
// confirmed. The daily job completes them.
exports.findHandedOverBefore = async function (date) {
  const rows = await allPages(() => supabase.from(TABLE).select()
    .eq('status', 'handed_over')
    .lt('handed_over_at', date.toISOString())
    .order('id'));
  return rows.map(toCamel);
};

// fields: any of { method, spotId, scheduledAt, status, handedOverAt, completedAt }
// status: 'pending' -> 'handed_over' (finder) -> 'completed' (owner, or the daily job)
exports.update = async function (id, fields) {
  const result = await supabase.from(TABLE).update(toSnake(fields)).eq('id', id).select().maybeSingle();
  return toCamel(unwrap(result));
};
