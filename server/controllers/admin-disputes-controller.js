// Feature 5b: the disputes tab of the Admin page. An admin returns the item
// to the person who raised the dispute, or keeps the claim, with a reason
// both people see.
// Privacy: an admin sees a chat only through a dispute or a report on it.
const User = require('../models/user-model');
const Item = require('../models/item-model');
const Match = require('../models/match-model');
const Claim = require('../models/claim-model');
const Message = require('../models/message-model');
const Handoff = require('../models/handoff-model');
const Dispute = require('../models/dispute-model');
const AdminAction = require('../models/admin-action-model');
const { checkCanGive, decideAndGive } = require('../lib/dispute-steps');
const { disputeQueueFacts } = require('../lib/admin-history');
const {
  parseStatusFilter, requireReason, itemSummary, nameOnly, checkCanSuspend, suspend, loadHistory, withHistory,
} = require('./admin-shared');
const { httpError } = require('../lib/errors');
const { parseId } = require('../lib/validate');

// 'none' for an honest mistake (most wrong claims are), 'warn' or 'suspend'
// when the claim looked deliberate
const PENALTIES = ['none', 'warn', 'suspend'];

// The queue. Each dispute also carries the names of the three people (for
// search), whether the item had already been returned when it was disputed,
// and, once upheld, whether the item has reached the person who disputed it.
exports.getDisputes = async (req, res) => {
  const status = parseStatusFilter(req.query.status, ['open', 'upheld', 'closed', 'withdrawn']);
  const disputes = await Dispute.findAll({ status });
  const claimIds = [...new Set(disputes.flatMap((dispute) => [dispute.claimId, dispute.newClaimId]).filter(Boolean))];
  const [items, claims] = await Promise.all([
    Item.findByIds([...new Set(disputes.map((dispute) => dispute.itemId))]),
    Claim.findByIds(claimIds),
  ]);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const userIds = [
    ...disputes.map((dispute) => dispute.raisedBy),
    ...claims.map((claim) => claim.claimerId),
    ...items.map((item) => item.postedBy),
  ];
  const [handoffs, users] = await Promise.all([
    Handoff.findByMatches([...new Set(claims.map((claim) => claim.matchId))]),
    User.findByIds([...new Set(userIds.filter(Boolean))]),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const handoffsByMatch = new Map();
  for (const handoff of handoffs) {
    handoffsByMatch.set(handoff.matchId, [...(handoffsByMatch.get(handoff.matchId) || []), handoff]);
  }

  res.json(disputes.map((dispute) => {
    const item = itemsById.get(dispute.itemId);
    return {
      ...dispute,
      item: itemSummary(item),
      people: {
        raisedBy: nameOnly(usersById.get(dispute.raisedBy)),
        claimer: nameOnly(usersById.get(claimsById.get(dispute.claimId)?.claimerId)),
        finder: nameOnly(usersById.get(item?.postedBy)),
      },
      ...disputeQueueFacts(dispute, claimsById, handoffsByMatch),
    };
  }));
};

async function loadDispute(req) {
  const dispute = await Dispute.findById(parseId(req.params.id));
  if (!dispute) throw httpError(404, 'Dispute not found');
  return dispute;
}

// Everything the admin needs to decide: who claimed the item, both reports
// and their photos, the earlier lost report of the person who raised it, and
// the handoff chat between the finder and the claimer
exports.getDispute = async (req, res) => {
  const dispute = await loadDispute(req);
  const claim = await Claim.findById(dispute.claimId);
  const match = await Match.findById(claim.matchId);
  const [items, messages, handoffs] = await Promise.all([
    Item.findByIds([match.foundItemId, match.lostItemId, dispute.lostItemId].filter(Boolean)),
    Message.findByMatch(match.id, { keepRemovedText: true }),
    Handoff.findByMatch(match.id),
  ]);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const foundItem = itemsById.get(match.foundItemId);
  const partyIds = [claim.claimerId, dispute.raisedBy, foundItem.postedBy];
  const people = await User.findByIds([...new Set([...partyIds, dispute.decidedBy].filter(Boolean))]);
  const contacts = new Map(people.map((user) => [user.id, User.toContact(user)]));
  // The record of the finder, claimer and disputer on other cases (this dispute left out)
  const history = await loadHistory(people.filter((user) => partyIds.includes(user.id)), {
    disputeId: dispute.id, claimId: claim.id,
  });

  res.json({
    dispute,
    claim,
    foundItem,
    claimerLostItem: itemsById.get(match.lostItemId) || null,
    raiserLostItem: dispute.lostItemId ? itemsById.get(dispute.lostItemId) || null : null,
    claimer: withHistory(contacts.get(claim.claimerId), history),
    raisedBy: withHistory(contacts.get(dispute.raisedBy), history),
    finder: withHistory(contacts.get(foundItem.postedBy), history),
    decidedBy: contacts.get(dispute.decidedBy) || null,
    handoffs,
    messages,
  });
};

// "Return to <name>": { reason, penalty?: 'none' | 'warn' | 'suspend' }
// The claim moves to the lost report of the person who raised the dispute and
// the handoff starts again with the finder (see lib/dispute-steps.js). The
// reason is shown to both people.
exports.upholdDispute = async (req, res) => {
  const dispute = await loadDispute(req);
  if (dispute.status !== 'open') throw httpError(400, 'This dispute has already been decided');
  const reason = requireReason(req.body);
  const penalty = req.body.penalty === undefined ? 'none' : req.body.penalty;
  if (!PENALTIES.includes(penalty)) throw httpError(400, 'Penalty must be none, warn or suspend');

  const now = new Date();
  const claim = await Claim.findById(dispute.claimId);
  // Everything that could refuse is checked before anything changes
  if (penalty === 'suspend') await checkCanSuspend(claim.claimerId);
  await checkCanGive(dispute);

  // Marked decided first, and only if still open, so the claimer withdrawing
  // (or another admin deciding) at the same moment cannot move the item twice
  const given = await decideAndGive(dispute, {
    status: 'upheld', decisionReason: reason, decidedBy: req.user.id, decidedAt: now.toISOString(),
  }, 'overturned', now);
  if (!given) throw httpError(409, 'This dispute was decided a moment ago. Refresh to see the outcome.');
  const { newClaim, returnBy } = given;

  if (penalty === 'suspend') await suspend(claim.claimerId, now);
  const updated = await Dispute.update(dispute.id, { returnBy, newClaimId: newClaim.id });

  const log = { adminId: req.user.id, disputeId: dispute.id, userId: claim.claimerId, reason };
  await AdminAction.create({ ...log, action: 'uphold_dispute', itemId: dispute.itemId });
  if (penalty !== 'none') {
    await AdminAction.create({ ...log, action: penalty === 'suspend' ? 'suspend_user' : 'warn_user' });
  }

  res.json(updated);
};

// "Keep <name>'s claim": { reason }. The paused handoff goes on, and both
// people see the reason.
exports.closeDispute = async (req, res) => {
  const dispute = await loadDispute(req);
  if (dispute.status !== 'open') throw httpError(400, 'This dispute has already been decided');
  const reason = requireReason(req.body);

  const updated = await Dispute.decideIfOpen(dispute.id, {
    status: 'closed', decisionReason: reason, decidedBy: req.user.id, decidedAt: new Date().toISOString(),
  });
  if (!updated) throw httpError(409, 'This dispute was decided a moment ago. Refresh to see the outcome.');
  await AdminAction.create({
    adminId: req.user.id, action: 'close_dispute', disputeId: dispute.id, itemId: dispute.itemId, reason,
  });
  res.json(updated);
};
