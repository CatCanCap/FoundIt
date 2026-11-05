// OWNER of the claim feature: Member 5. These functions are the database access.
// A claim is the owner of the lost item saying "this is mine" on a match. It
// opens the handoff chat straight away and is logged against their account.
// `detail` is one detail only the owner would know; the finder sees it, and an
// admin uses it if the claim is disputed.
//   status: 'active'     the claim stands (the chat and handoff go ahead)
//           'declined'   the finder declined it (the details did not fit)
//           'withdrawn'  the claimer gave it up after a dispute
//           'overturned' an admin gave the item to the person who disputed it
const supabase = require('../lib/db');
const { toCamel, toSnake } = require('../lib/case');
const { unwrap } = require('../lib/errors');

const TABLE = 'claims';

function fromRow(row) {
  if (!row) return null;
  const claim = toCamel(row);
  return {
    ...claim,
    createdAt: new Date(claim.createdAt).toISOString(),
    decidedAt: claim.decidedAt ? new Date(claim.decidedAt).toISOString() : null,
  };
}

// data: { matchId, claimerId, detail }
// A match can have only one active claim; a second one fails with 409.
exports.create = async function (data) {
  return fromRow(unwrap(await supabase.from(TABLE).insert(toSnake(data)).select().single()));
};

exports.findById = async function (id) {
  return fromRow(unwrap(await supabase.from(TABLE).select().eq('id', id).maybeSingle()));
};

// Several claims at once (for the admin queue)
exports.findByIds = async function (ids) {
  if (ids.length === 0) return [];
  return unwrap(await supabase.from(TABLE).select().in('id', ids)).map(fromRow);
};

// Every claim made by any of these people, oldest first (for the admin's
// history of each person on a case)
exports.findByClaimers = async function (userIds) {
  if (userIds.length === 0) return [];
  const result = await supabase.from(TABLE).select().in('claimer_id', userIds).order('id');
  return unwrap(result).map(fromRow);
};

// Newest first
exports.findByMatch = async function (matchId) {
  const result = await supabase.from(TABLE).select().eq('match_id', matchId)
    .order('id', { ascending: false });
  return unwrap(result).map(fromRow);
};

// The claim that stands on a match, or null
exports.findActiveByMatch = async function (matchId) {
  const result = await supabase.from(TABLE).select().eq('match_id', matchId)
    .eq('status', 'active').maybeSingle();
  return fromRow(unwrap(result));
};

// Every claim on any of these matches, oldest first (for an item's timeline)
exports.findByMatches = async function (matchIds) {
  if (matchIds.length === 0) return [];
  const result = await supabase.from(TABLE).select().in('match_id', matchIds).order('id');
  return unwrap(result).map(fromRow);
};

// Every claim this user made, newest first
exports.findByClaimer = async function (userId) {
  const result = await supabase.from(TABLE).select().eq('claimer_id', userId).order('id', { ascending: false });
  return unwrap(result).map(fromRow);
};

// fields: any of { status, decidedAt }
exports.update = async function (id, fields) {
  const result = await supabase.from(TABLE).update(toSnake(fields)).eq('id', id).select().maybeSingle();
  return fromRow(unwrap(result));
};

// Normal users never see who claimed an item, so leave the claimer out of
// anything sent to someone who is not the claimer or an admin
exports.toPublic = function (claim) {
  if (!claim) return null;
  const { claimerId, ...rest } = claim;
  return rest;
};
