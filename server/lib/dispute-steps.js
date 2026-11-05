// Feature 5: the step that gives a disputed item to the person who raised the
// dispute. Shared by an admin's "Return to <name>" decision and the claimer's
// "withdraw my claim".
//
// What happens:
// - the old claim ends (overturned or withdrawn) and its match is rejected;
// - the claimer's own lost report opens again;
// - the claim moves to the lost report of the person who raised the dispute,
//   and the handoff starts again with the finder;
// - if the claimer already had the item, they must bring it to a collection
//   point within 3 days (returnBy);
// - other open disputes on the same claim are closed, because it no longer stands.
const Item = require('../models/item-model');
const Match = require('../models/match-model');
const Claim = require('../models/claim-model');
const Handoff = require('../models/handoff-model');
const Dispute = require('../models/dispute-model');
const { httpError } = require('./errors');
const { DAY } = require('./time');

const RETURN_WITHIN_DAYS = 3;

// Checked before the dispute is marked decided, so a refusal changes nothing:
// - the found item must still be up: if an admin removed the post, moving it
//   would put it back in the feed;
// - the lost report of the person who raised the dispute must still be open.
//   If it was claimed elsewhere, closed or taken down, giving them this item
//   would leave them with two claims or a claim on a closed report. (It may
//   already be matched to this item by a decision that failed halfway; that
//   one may be tried again.)
async function checkCanGive(dispute) {
  const found = await Item.findById(dispute.itemId);
  if (!found || found.status === 'removed') {
    throw httpError(409, 'An admin removed this post, so the item cannot move to anyone. Keep the claim instead.');
  }
  const lost = dispute.lostItemId ? await Item.findById(dispute.lostItemId) : null;
  if (!lost || !(lost.status === 'open' || await isHalfGiven(dispute, lost))) {
    throw httpError(409, 'The lost report attached to this dispute is no longer open, so the item cannot move to it. Keep the claim instead, or ask them to report it again and dispute again.');
  }
}

async function isHalfGiven(dispute, lost) {
  if (lost.status !== 'matched') return false;
  const match = (await Match.findByItem(dispute.itemId)).find((entry) => entry.lostItemId === lost.id);
  return Boolean(match && match.status === 'claimed');
}

// The match between the disputer's lost report and the found item, made if
// matching never paired them
async function findOrMakeMatch(lostItemId, foundItemId) {
  const existing = (await Match.findByItem(foundItemId)).find((match) => match.lostItemId === lostItemId);
  if (existing) return existing;
  const [made] = await Match.saveMany([{
    lostItemId, foundItemId, score: 0, breakdown: {}, reasons: ['Given to the owner after a dispute'],
  }]);
  return made;
}

// claimStatus: 'overturned' (admin decision) or 'withdrawn' (by the claimer)
// Returns { newClaim, returnBy, claimerId }
// Call checkCanGive first, then mark the dispute decided, then call this.
async function giveItemToDisputer(dispute, claimStatus, now = new Date()) {
  const claim = await Claim.findById(dispute.claimId);
  const oldMatch = await Match.findById(claim.matchId);
  const handoffs = await Handoff.findByMatch(oldMatch.id);
  const claimerHasIt = handoffs.some((handoff) => ['handed_over', 'completed'].includes(handoff.status));

  await Claim.update(claim.id, { status: claimStatus, decidedAt: now.toISOString() });
  await Match.updateStatus(oldMatch.id, 'rejected');
  // The claimer's lost report opens again, unless an admin took it down
  const claimerLost = await Item.findById(oldMatch.lostItemId);
  if (claimerLost && claimerLost.status !== 'removed') await Item.updateStatus(claimerLost.id, 'open');

  const match = await findOrMakeMatch(dispute.lostItemId, dispute.itemId);
  await Match.updateStatus(match.id, 'claimed');
  // A decision that failed halfway may have made this claim already
  const newClaim = await Claim.findActiveByMatch(match.id)
    || await Claim.create({ matchId: match.id, claimerId: dispute.raisedBy, detail: dispute.description });
  await Item.updateStatus(dispute.lostItemId, 'matched');
  await Item.updateStatus(dispute.itemId, 'matched');

  for (const other of await Dispute.findOpenByClaim(claim.id)) {
    if (other.id === dispute.id) continue;
    await Dispute.update(other.id, {
      status: 'closed',
      decisionReason: 'Another dispute on this claim was decided first. Open a new dispute if the item is still yours.',
      decidedAt: now.toISOString(),
    });
  }

  return {
    newClaim,
    returnBy: claimerHasIt ? new Date(now.getTime() + RETURN_WITHIN_DAYS * DAY).toISOString() : null,
    claimerId: claim.claimerId,
  };
}

// Marks the dispute decided (only if it is still open, so two decisions at
// the same moment cannot both move the item), then gives the item to the
// person who raised it. If giving fails partway, the dispute is opened again
// so it can be decided again; every step above is safe to repeat.
// fields: what to save on the dispute ({ status, decisionReason, decidedBy?, decidedAt })
// Returns giveItemToDisputer's result, or null if it was already decided.
async function decideAndGive(dispute, fields, claimStatus, now = new Date()) {
  const decided = await Dispute.decideIfOpen(dispute.id, fields);
  if (!decided) return null;
  try {
    return await giveItemToDisputer(dispute, claimStatus, now);
  } catch (error) {
    await Dispute.update(dispute.id, { status: 'open', decisionReason: null, decidedBy: null, decidedAt: null });
    throw error;
  }
}

module.exports = { checkCanGive, giveItemToDisputer, decideAndGive };
