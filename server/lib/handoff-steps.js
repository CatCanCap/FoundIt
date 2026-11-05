// The last step of a handoff (feature 4), shared by the owner's "I have it
// back" route and the daily job that completes unconfirmed handoffs.
// Completing a handoff confirms its match and resolves both items, so they
// leave the feed and stop being matched.
const Handoff = require('../models/handoff-model');
const Match = require('../models/match-model');
const Item = require('../models/item-model');
const Dispute = require('../models/dispute-model');
const { httpError } = require('./errors');

// Why a handoff cannot complete right now, or null if it can:
// - 'paused': the item has an open dispute, so it waits for an admin (feature 5)
// - 'closed': the claim no longer stands, because an admin gave the item to
//   someone else or the claimer withdrew. Its old handoff is left behind and
//   must never complete, or it would undo the admin's decision.
// - 'removed': an admin took down one of the two posts after a report.
//   Completing would mark it resolved and put it back on the feed.
async function blockedReason(handoff) {
  const match = await Match.findById(handoff.matchId);
  // 'confirmed' as well, so a completion that failed halfway can be finished
  if (!match || !['claimed', 'confirmed'].includes(match.status)) return 'closed';
  const items = await Item.findByIds([match.lostItemId, match.foundItemId]);
  if (items.some((item) => item.status === 'removed')) return 'removed';
  if (await Dispute.hasOpenForItem(match.foundItemId)) return 'paused';
  return null;
}

const BLOCKED_MESSAGES = {
  paused: 'This item is under dispute. An admin will decide before it can be completed.',
  closed: 'This claim no longer stands, so its handoff is closed',
  removed: 'An admin removed this post, so its handoff is closed',
};

// The handoff is marked completed last. If anything before it fails, the
// handoff is still open, so the owner (or the daily job) can simply try again.
async function completeHandoff(handoff, now = new Date()) {
  const reason = await blockedReason(handoff);
  if (reason) throw httpError(409, BLOCKED_MESSAGES[reason]);
  const match = await Match.updateStatus(handoff.matchId, 'confirmed');
  await Item.updateStatus(match.lostItemId, 'resolved');
  await Item.updateStatus(match.foundItemId, 'resolved');
  return Handoff.update(handoff.id, { status: 'completed', completedAt: now.toISOString() });
}

module.exports = { completeHandoff, blockedReason };
