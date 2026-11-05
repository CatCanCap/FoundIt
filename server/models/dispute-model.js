// Feature 5: "This is my item" disputes on a claimed found item.
//   status: 'open' -> 'upheld'    an admin gave the item to the person who raised it
//                  -> 'closed'    an admin kept the claim (the paused handoff goes on)
//                  -> 'withdrawn' the claimer gave it up, so it went to the person who raised it
const supabase = require('../lib/db');
const { toCamel, toSnake } = require('../lib/case');
const { unwrap } = require('../lib/errors');

const TABLE = 'disputes';

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function fromRow(row) {
  if (!row) return null;
  const dispute = toCamel(row);
  return {
    ...dispute,
    createdAt: toIso(dispute.createdAt),
    decidedAt: toIso(dispute.decidedAt),
    returnBy: toIso(dispute.returnBy),
    respondedAt: toIso(dispute.respondedAt),
  };
}

// data: { itemId, claimId, raisedBy, lostItemId, description, proofUrl }
// One person can have only one open dispute per claim; a second fails with 409.
exports.create = async function (data) {
  return fromRow(unwrap(await supabase.from(TABLE).insert(toSnake(data)).select().single()));
};

exports.findById = async function (id) {
  return fromRow(unwrap(await supabase.from(TABLE).select().eq('id', id).maybeSingle()));
};

// filters: { status, raisedBy }. Oldest first, so the admin queue is first come, first served.
exports.findAll = async function (filters = {}) {
  let query = supabase.from(TABLE).select();
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.raisedBy) query = query.eq('raised_by', filters.raisedBy);
  return unwrap(await query.order('created_at').order('id')).map(fromRow);
};

// Every dispute raised by any of these people, oldest first (for the admin's
// history of each person on a case)
exports.findByRaisers = async function (userIds) {
  if (userIds.length === 0) return [];
  const result = await supabase.from(TABLE).select().in('raised_by', userIds).order('created_at');
  return unwrap(result).map(fromRow);
};

// Every dispute on any of these claims, oldest first
exports.findByClaims = async function (claimIds) {
  if (claimIds.length === 0) return [];
  const result = await supabase.from(TABLE).select().in('claim_id', claimIds).order('created_at');
  return unwrap(result).map(fromRow);
};

// Disputes still waiting on one claim
exports.findOpenByClaim = async function (claimId) {
  const result = await supabase.from(TABLE).select().eq('claim_id', claimId).eq('status', 'open');
  return unwrap(result).map(fromRow);
};

// Every dispute on an item, oldest first (for the item's timeline)
exports.findByItem = async function (itemId) {
  const result = await supabase.from(TABLE).select().eq('item_id', itemId).order('created_at');
  return unwrap(result).map(fromRow);
};

// True while an item has a dispute waiting for an admin. Such an item is
// paused: its handoff cannot complete, by the owner or by the daily job.
exports.hasOpenForItem = async function (itemId) {
  const result = await supabase.from(TABLE).select('id').eq('item_id', itemId).eq('status', 'open').limit(1);
  return unwrap(result).length > 0;
};

// Only for undoing a dispute that was just created (see disputes-controller.js)
exports.remove = async function (id) {
  unwrap(await supabase.from(TABLE).delete().eq('id', id));
};

// Decides a dispute only if it is still open: fields as for update, with the
// new status. Returns the decided dispute, or null when someone else decided
// it first (an admin and the claimer withdrawing at the same moment), so the
// item is never moved twice.
exports.decideIfOpen = async function (id, fields) {
  const result = await supabase.from(TABLE).update(toSnake(fields))
    .eq('id', id).eq('status', 'open').select().maybeSingle();
  return fromRow(unwrap(result));
};

// fields: any of { status, decisionReason, returnBy, newClaimId, decidedBy, decidedAt,
//                 claimerResponse, claimerProofUrl, respondedAt }
exports.update = async function (id, fields) {
  const result = await supabase.from(TABLE).update(toSnake(fields)).eq('id', id).select().maybeSingle();
  return fromRow(unwrap(result));
};
