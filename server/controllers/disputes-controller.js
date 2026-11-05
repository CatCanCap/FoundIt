// Feature 5a: "This is my item". Someone whose item shows as claimed by
// another person opens a dispute from the item record, with their own lost
// report attached and optional proof. The claimer can add their side or
// withdraw the claim. An admin decides (see admin-disputes-controller.js).
// Privacy: the two people never learn who the other is, and the claimer never
// sees the description or proof (so they cannot copy it).
const Item = require('../models/item-model');
const Match = require('../models/match-model');
const Claim = require('../models/claim-model');
const Handoff = require('../models/handoff-model');
const Dispute = require('../models/dispute-model');
const { checkCanGive, decideAndGive } = require('../lib/dispute-steps');
const { httpError } = require('../lib/errors');
const { parseId, isNonEmptyString } = require('../lib/validate');
const { optionalOurPhoto } = require('../lib/photo-size');
const { DAY } = require('../lib/time');

// A returned item can still be disputed for this long after its handoff completed
const DISPUTE_AFTER_RETURN_DAYS = 7;
// A dispute pauses someone else's handoff, so one person may only have a few
// open at a time
const MAX_OPEN_DISPUTES = 3;

// The claim that stands on a found item, or null
async function findActiveClaim(foundItemId) {
  const matches = (await Match.findByItem(foundItemId)).filter((match) => match.foundItemId === foundItemId);
  const claims = await Claim.findByMatches(matches.map((match) => match.id));
  return claims.find((claim) => claim.status === 'active') || null;
}

// The person's own open lost report in the same category as the found item,
// so nobody can pause a handoff with an unrelated report, or with one that is
// already claimed or closed. Prefers one filed before the claim (its
// timestamp is strong evidence), then the most recent.
async function findOwnLostReport(userId, foundItem, claimedAt) {
  const lostItems = await Item.findAll({
    type: 'lost', status: 'open', postedBy: userId, category: foundItem.category,
  });
  // findAll returns the newest first
  return lostItems.find((item) => item.createdAt < claimedAt) || lostItems[0] || null;
}

// What the person who raised the dispute sees: not the claimer, not their side
function toRaiserView(dispute) {
  const { claimId, decidedBy, raisedBy, newClaimId, claimerResponse, claimerProofUrl, ...rest } = dispute;
  return rest;
}

// What the claimer sees: that a dispute is open and the outcome, but not who
// raised it or what they said
function toClaimerView(dispute) {
  const { status, decisionReason, returnBy, createdAt, decidedAt, claimerResponse, claimerProofUrl, respondedAt } = dispute;
  return {
    id: dispute.id, itemId: dispute.itemId, status, decisionReason, returnBy,
    createdAt, decidedAt, claimerResponse, claimerProofUrl, respondedAt,
  };
}

// The found item each dispute is about, in short, so My disputes can show
// its name and photo without fetching every item record. The place and time
// are left out: the list never needs them. It is null (the page says the item
// is no longer listed) for a post an admin took down, and for a post that
// reports hid, unless canSeeHidden(dispute) says this person may still see it.
// That follows the item page's rule: only the poster, admins and the person
// whose claim stands on it see a hidden post.
async function withItems(disputes, canSeeHidden = () => false) {
  const items = await Item.findByIds([...new Set(disputes.map((dispute) => dispute.itemId))]);
  const byId = new Map(items.filter((item) => item.status !== 'removed').map((item) => [item.id, item]));
  return disputes.map((dispute) => {
    const item = byId.get(dispute.itemId);
    if (!item || (item.hiddenAt && !canSeeHidden(dispute))) return { ...dispute, item: null };
    const { id, type, title, category, colours, colour, photoUrl } = item;
    return { ...dispute, item: { id, type, title, category, colours, colour, photoUrl } };
  });
}

// { itemId, description, proofUrl? }  itemId is the claimed found item
exports.addDispute = async (req, res) => {
  const body = req.body || {};
  const item = await Item.findById(parseId(body.itemId));
  if (!item || item.status === 'removed' || item.hiddenAt) throw httpError(404, 'Item not found');
  if (item.type !== 'found') throw httpError(400, 'Open the dispute on the found item that was claimed');
  if (item.postedBy === req.user.id) throw httpError(400, 'You reported finding this item');

  const claim = await findActiveClaim(item.id);
  if (!claim) throw httpError(400, 'This item has not been claimed');
  if (claim.claimerId === req.user.id) throw httpError(400, 'You claimed this item');
  // An admin already looked at this person's dispute on this claim and kept
  // the claim. Disputing again would pause the handoff again and again.
  const earlier = await Dispute.findByClaims([claim.id]);
  if (earlier.some((dispute) => dispute.raisedBy === req.user.id && dispute.status === 'closed')) {
    throw httpError(409, 'An admin already decided your dispute on this claim. If you have new evidence, contact the FoundIt admins through your SMU email.');
  }

  const handoffs = await Handoff.findByMatch(claim.matchId);
  const returned = handoffs.find((handoff) => handoff.status === 'completed');
  if (returned && Date.now() - new Date(returned.completedAt).getTime() > DISPUTE_AFTER_RETURN_DAYS * DAY) {
    throw httpError(400, `Items can only be disputed up to ${DISPUTE_AFTER_RETURN_DAYS} days after they are returned`);
  }

  if (!isNonEmptyString(body.description, 2000)) {
    throw httpError(400, 'Describe the item and why it is yours (up to 2000 characters)');
  }
  const proofUrl = await optionalOurPhoto(body.proofUrl, 'Proof link');
  const lostReport = await findOwnLostReport(req.user.id, item, claim.createdAt);
  if (!lostReport) {
    throw httpError(400, `Report your item as lost first (category ${item.category}), then open the dispute`);
  }
  const open = await Dispute.findAll({ status: 'open', raisedBy: req.user.id });
  if (open.length >= MAX_OPEN_DISPUTES) {
    throw httpError(429, `You already have ${MAX_OPEN_DISPUTES} disputes waiting for an admin`);
  }

  const dispute = await Dispute.create({
    itemId: item.id,
    claimId: claim.id,
    raisedBy: req.user.id,
    lostItemId: lostReport.id,
    description: body.description.trim(),
    proofUrl,
  });
  // Count again after saving: several disputes sent at the same moment all
  // pass the check above, so any over the limit are taken back here
  const nowOpen = await Dispute.findAll({ status: 'open', raisedBy: req.user.id });
  if (nowOpen.length > MAX_OPEN_DISPUTES) {
    await Dispute.remove(dispute.id);
    throw httpError(429, `You already have ${MAX_OPEN_DISPUTES} disputes waiting for an admin`);
  }
  res.status(201).json(toRaiserView(dispute));
};

// Disputes the logged-in user raised, oldest first, with the decision and
// reason once there is one, and the item each is about
exports.getMyDisputes = async (req, res) => {
  res.json(await withItems((await Dispute.findAll({ raisedBy: req.user.id })).map(toRaiserView)));
};

// Disputes against the logged-in user's claims, oldest first, with the item,
// what they said when they claimed it and when they claimed it
exports.getDisputesOnMyClaims = async (req, res) => {
  const claims = await Claim.findByClaimer(req.user.id);
  const disputes = await Dispute.findByClaims(claims.map((claim) => claim.id));
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  // While their claim stands, the claimer may still see a post that reports
  // hid. Worked out here, because the claimer's view leaves out claimId.
  const stands = new Set(disputes
    .filter((dispute) => claimsById.get(dispute.claimId)?.status === 'active')
    .map((dispute) => dispute.id));
  res.json(await withItems(disputes.map((dispute) => {
    const claim = claimsById.get(dispute.claimId);
    return { ...toClaimerView(dispute), claimDetail: claim?.detail || null, claimedAt: claim?.createdAt || null };
  }), (dispute) => stands.has(dispute.id)));
};

// Loads an open dispute and checks the logged-in user made the disputed claim
async function loadOpenDisputeOnMyClaim(req) {
  const dispute = await Dispute.findById(parseId(req.params.id));
  if (!dispute) throw httpError(404, 'Dispute not found');
  const claim = await Claim.findById(dispute.claimId);
  if (claim.claimerId !== req.user.id) throw httpError(403, 'This is not a dispute about your claim');
  if (dispute.status !== 'open') throw httpError(400, 'This dispute has already been decided');
  return dispute;
}

// The claimer adds their side: { response, proofUrl? }. Sending it again replaces it.
exports.respond = async (req, res) => {
  const dispute = await loadOpenDisputeOnMyClaim(req);
  const body = req.body || {};
  if (!isNonEmptyString(body.response, 2000)) {
    throw httpError(400, 'Add a detail that shows the item is yours (up to 2000 characters)');
  }
  const updated = await Dispute.update(dispute.id, {
    claimerResponse: body.response.trim(),
    claimerProofUrl: await optionalOurPhoto(body.proofUrl, 'Proof link'),
    respondedAt: new Date().toISOString(),
  });
  res.json(toClaimerView(updated));
};

// The claimer says it might not be theirs. The item goes to the person who
// raised the dispute, and the claimer's own lost report opens again. Honest
// mistakes are not penalised.
exports.withdrawClaim = async (req, res) => {
  const dispute = await loadOpenDisputeOnMyClaim(req);
  await checkCanGive(dispute);
  const now = new Date();
  // Marked decided first, and only if still open, so an admin deciding at the
  // same moment cannot move the item a second time
  const given = await decideAndGive(dispute, {
    status: 'withdrawn',
    decisionReason: 'The person who claimed the item withdrew their claim.',
    decidedAt: now.toISOString(),
  }, 'withdrawn', now);
  if (!given) throw httpError(409, 'An admin has just decided this dispute');
  const { newClaim, returnBy } = given;
  const updated = await Dispute.update(dispute.id, { newClaimId: newClaim.id, returnBy });
  res.json(toClaimerView(updated));
};
