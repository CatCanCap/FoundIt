// OWNER: Member 5. Feature 4b and 4c: meetup or drop-off, and the two-step
// status. pending -> handed_over (the finder) -> completed (the owner, or the
// daily job 7 days after it was handed over). See "Status lifecycle" in the README.
const Handoff = require('../models/handoff-model');
const Claim = require('../models/claim-model');
const Spot = require('../models/spot-model');
const Item = require('../models/item-model');
const Dispute = require('../models/dispute-model');
const { loadMatchFor } = require('./match-access');
const { completeHandoff } = require('../lib/handoff-steps');
const { metresBetween } = require('../lib/distance');
const { httpError } = require('../lib/errors');
const { DAY } = require('../lib/time');
const { parseId, parseDate } = require('../lib/validate');

const METHODS = ['meetup', 'drop-off'];

// A handoff can only be planned while the owner's claim stands
async function loadClaimedMatch(matchId, userId) {
  const access = await loadMatchFor(matchId, userId);
  const claim = await Claim.findActiveByMatch(access.match.id);
  if (access.match.status !== 'claimed' || !claim) {
    throw httpError(403, 'The owner must claim the item first');
  }
  return access;
}

async function loadHandoffFor(req) {
  const handoff = await Handoff.findById(parseId(req.params.id));
  if (!handoff) throw httpError(404, 'Handoff not found');
  const access = await loadMatchFor(handoff.matchId, req.user.id);
  // An admin gave the item to someone else, or the claim was withdrawn
  if (access.match.status === 'rejected') {
    throw httpError(409, 'This claim no longer stands, so its handoff is closed');
  }
  // Only the newest plan counts. A double-clicked "Yes, it fits" can save two;
  // the pages show the newest, so the older one must not be marked or completed.
  const [newest] = await Handoff.findByMatch(handoff.matchId);
  if (newest && newest.id !== handoff.id) {
    throw httpError(409, 'This plan was replaced by a newer one. Reload the page.');
  }
  return { handoff, ...access };
}

// A planned time is optional, and cannot be in the past (a few minutes of
// leeway for a slow clock)
const PAST_LEEWAY_MS = 5 * 60 * 1000;
function plannedTime(value) {
  if (value === undefined || value === null) return null;
  const date = parseDate(value);
  if (date.getTime() < Date.now() - PAST_LEEWAY_MS) {
    throw httpError(400, 'Pick a time that has not passed yet');
  }
  return date.toISOString();
}

async function refuseWhileDisputed(foundItem, step) {
  if (await Dispute.hasOpenForItem(foundItem.id)) {
    throw httpError(409, `This item is under dispute. An admin will decide before it can be ${step}.`);
  }
}

async function checkSpot(method, spotId) {
  const spot = await Spot.findById(spotId);
  if (!spot) throw httpError(400, 'Unknown place');
  if (method === 'drop-off' && !spot.isCollectionPoint) {
    throw httpError(400, 'A drop-off must be at a collection point');
  }
}

// Collection points, nearest first, for the drop-off picker: ?near=<spotId>
exports.getCollectionPoints = async (req, res) => {
  const points = await Spot.findCollectionPoints();
  if (req.query.near === undefined) return res.json(points);
  const from = await Spot.findById(parseId(req.query.near));
  if (!from) throw httpError(404, 'Place not found');
  const withDistance = points.map((point) => ({
    ...point,
    distanceMetres: Math.round(metresBetween(from.coordinates, point.coordinates)),
  }));
  res.json(withDistance.sort((a, b) => a.distanceMetres - b.distanceMetres));
};

// The finder accepts the claim by planning the handoff (Figma V12.2):
// { matchId, method, spotId, scheduledAt? }. Either person can change the plan later.
exports.addHandoff = async (req, res) => {
  const body = req.body || {};
  const { match, role, foundItem } = await loadClaimedMatch(parseId(body.matchId), req.user.id);
  if (role !== 'finder') throw httpError(403, 'Only the finder accepts the claim and plans the handoff');
  if (!METHODS.includes(body.method)) throw httpError(400, 'Method must be meetup or drop-off');
  const spotId = parseId(body.spotId);
  await checkSpot(body.method, spotId);
  const scheduledAt = plannedTime(body.scheduledAt);
  // A dispute pauses the handoff, so the claim waits for an admin before it is accepted
  await refuseWhileDisputed(foundItem, 'accepted');

  const existing = await Handoff.findByMatch(match.id);
  if (existing.some((handoff) => handoff.status !== 'completed')) {
    throw httpError(409, 'This match already has a handoff');
  }
  res.status(201).json(await Handoff.create({ matchId: match.id, method: body.method, spotId, scheduledAt }));
};

exports.getHandoff = async (req, res) => {
  const { match } = await loadMatchFor(parseId(req.params.matchId), req.user.id);
  const [handoff] = await Handoff.findByMatch(match.id);
  if (!handoff) throw httpError(404, 'No handoff planned yet');
  res.json(handoff);
};

// Either person changes the plan while it is still pending
exports.editHandoff = async (req, res) => {
  const { handoff } = await loadHandoffFor(req);
  if (handoff.status !== 'pending') throw httpError(400, 'This handoff can no longer be changed');
  const body = req.body || {};
  const fields = {};
  if (body.method !== undefined) {
    if (!METHODS.includes(body.method)) throw httpError(400, 'Method must be meetup or drop-off');
    fields.method = body.method;
  }
  if (body.spotId !== undefined) fields.spotId = parseId(body.spotId);
  if (body.scheduledAt !== undefined) fields.scheduledAt = plannedTime(body.scheduledAt);
  if (Object.keys(fields).length === 0) throw httpError(400, 'Nothing to update');
  await checkSpot(fields.method || handoff.method, fields.spotId || handoff.spotId);
  res.json(await Handoff.update(handoff.id, fields));
};

// Step 1: the finder has handed the item over or dropped it off.
// { method? }: how it actually went back, when that differs from the plan.
// Saved in the same step, so the plan never changes without the handover.
exports.markHandedOver = async (req, res) => {
  const { handoff, role, foundItem } = await loadHandoffFor(req);
  if (role !== 'finder') throw httpError(403, 'Only the finder marks the item handed over');
  if (handoff.status !== 'pending') throw httpError(400, 'Already marked');
  const fields = { status: 'handed_over', handedOverAt: new Date().toISOString() };
  const method = (req.body || {}).method;
  if (method !== undefined && method !== handoff.method) {
    if (!METHODS.includes(method)) throw httpError(400, 'Method must be meetup or drop-off');
    await checkSpot(method, handoff.spotId);
    fields.method = method;
  }
  // A dispute pauses the handoff: the item must not change hands until an admin decides
  await refuseWhileDisputed(foundItem, 'handed over');
  res.json(await Handoff.update(handoff.id, fields));
};

// Step 2: the owner confirms they have it back, which resolves both items
exports.confirm = async (req, res) => {
  const { handoff, role } = await loadHandoffFor(req);
  if (role !== 'owner') throw httpError(403, 'Only the owner confirms they have it back');
  if (handoff.status === 'completed') throw httpError(400, 'Already completed');
  res.json(await completeHandoff(handoff));
};

// The figures on the "You got it home" page (Figma V22), once the handoff is
// complete: how many finds this finder has returned, how many days this one
// took, and how many finds have gone home through FoundIt in all.
exports.getSummary = async (req, res) => {
  const { match, foundItem, lostItem } = await loadMatchFor(parseId(req.params.matchId), req.user.id);
  const [handoff] = await Handoff.findByMatch(match.id);
  if (!handoff || handoff.status !== 'completed') throw httpError(404, 'This handoff is not complete yet');

  const [finderReturns, allReturns] = await Promise.all([
    Item.findAll({ type: 'found', status: 'resolved', postedBy: foundItem.postedBy }),
    Item.findAll({ type: 'found', status: 'resolved' }),
  ]);
  // From when the item was reported lost (or found, if that came first) to the end
  const start = Math.min(Date.parse(lostItem.createdAt), Date.parse(foundItem.createdAt));
  const days = Math.max(0, Math.round((Date.parse(handoff.completedAt) - start) / DAY));

  res.json({
    completedAt: new Date(handoff.completedAt).toISOString(),
    method: handoff.method,
    spotId: handoff.spotId,
    finderReturns: finderReturns.length,
    daysToReturn: days,
    totalReturned: allReturns.length,
  });
};
