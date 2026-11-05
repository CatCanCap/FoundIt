// OWNER: Member 5. Feature 4a, the claim (Figma V12.1 and V12.2).
// The owner of the lost item claims a match with one detail only the owner
// would know. The chat opens straight away, and the finder checks the detail
// and accepts the claim (by planning the handoff) or declines it. Every claim
// is logged against the claimer's account.
const Claim = require('../models/claim-model');
const Match = require('../models/match-model');
const Item = require('../models/item-model');
const Handoff = require('../models/handoff-model');
const Dispute = require('../models/dispute-model');
const Message = require('../models/message-model');
const alerts = require('../alerts');
const { loadMatchFor } = require('./match-access');
const { chatChannel } = require('../lib/chat-channel');
const { inBackground } = require('../lib/background');
const { httpError } = require('../lib/errors');
const { forViewer, matchForViewer } = require('../lib/item-privacy');
const { foundPlacesFor } = require('../lib/found-places');
const { parseId, isNonEmptyString } = require('../lib/validate');

const DETAIL_MAX = 500;
const REASON_MAX = 300;

// When the finder declines, their reason is saved as their last chat message,
// starting with these words, so both people can read why the chat closed.
// (The claims table has no column for it, and this needs no database change.)
const DECLINE_PREFIX = 'Declined the claim: ';

// Why a claim that no longer stands was closed, for the closed chat page:
//   { status: 'declined' | 'withdrawn' | 'overturned', decidedAt, reason }
// reason is the finder's words for a decline, or null
async function closedInfo(match, foundItem, latest) {
  if (!latest || latest.status === 'active') return null;
  let reason = null;
  if (latest.status === 'declined') {
    const messages = await Message.findByMatch(match.id);
    const said = messages.filter((message) => message.senderId === foundItem.postedBy
      && message.text.startsWith(DECLINE_PREFIX)).pop();
    reason = said ? said.text.slice(DECLINE_PREFIX.length) : null;
  }
  return { status: latest.status, decidedAt: latest.decidedAt, reason };
}

// Everything the claim and handoff pages need about one match, for either person.
// The claim goes through Claim.toPublic, so the claimer's account id is never sent.
// viewer is req.user, for what of the find they may see
async function overview(access, viewer) {
  const { match, foundItem, lostItem, role } = access;
  const [claims, handoffs, disputeOpen, finds] = await Promise.all([
    Claim.findByMatch(match.id),
    Handoff.findByMatch(match.id),
    Dispute.hasOpenForItem(foundItem.id),
    foundPlacesFor(viewer),
  ]);
  // Newest first: the claim that stands, or the last one that was closed
  const claim = claims.find((entry) => entry.status === 'active') || null;
  // The owner sees where and when it was found only if their report already
  // said it, so claiming cannot be used to learn it (lib/item-privacy.js)
  const shown = role === 'owner' && viewer.role !== 'admin' ? matchForViewer(match, finds) : match;
  return {
    role,
    match: { id: match.id, status: match.status, score: match.score, reasons: shown.reasons, createdAt: match.createdAt },
    claim: Claim.toPublic(claim),
    foundItem: forViewer(foundItem, viewer, finds),
    // The owner's own lost report; the finder only needs the found item
    lostItem: role === 'owner' ? lostItem : null,
    // Newest first, so this is the one that counts
    handoff: handoffs[0] || null,
    disputeOpen,
    // A match still suggested never had a claim that went ahead (see keepFirstClaimOnFind)
    closed: claim || match.status === 'suggested' ? null : await closedInfo(match, foundItem, claims[0]),
  };
}

// GET /api/claims/:matchId  Either person: the match, its claim and its handoff
exports.getClaim = async (req, res) => {
  const access = await loadMatchFor(parseId(req.params.matchId), req.user.id);
  res.json(await overview(access, req.user));
};

// One find can match several lost reports. If two owners press "This is mine"
// at the same moment, both pass the "still open" check above. So once a claim
// is saved, look for another claim standing on the same find: the earlier one
// (lower id) keeps it, and this one is withdrawn straight away and refused.
// Whichever order the two requests run in, exactly one claim is left.
async function keepFirstClaimOnFind(claim, match, foundItem) {
  const otherMatches = (await Match.findByFoundItems([foundItem.id]))
    .filter((other) => Number(other.id) !== Number(match.id));
  if (otherMatches.length === 0) return;
  const rivals = await Claim.findByMatches(otherMatches.map((other) => other.id));
  if (!rivals.some((rival) => rival.status === 'active' && Number(rival.id) < Number(claim.id))) return;
  await Claim.update(claim.id, { status: 'withdrawn', decidedAt: new Date().toISOString() });
  throw httpError(409, 'Someone else has just claimed this item');
}

// POST /api/claims/:matchId  The owner: { detail }
// Claims the match, which opens the chat and takes both items out of matching.
exports.addClaim = async (req, res) => {
  const access = await loadMatchFor(parseId(req.params.matchId), req.user.id);
  const { match, lostItem, foundItem, role } = access;
  if (role !== 'owner') throw httpError(403, 'Only the person who lost the item can claim it');

  const detail = (req.body || {}).detail;
  if (!isNonEmptyString(detail, DETAIL_MAX)) {
    throw httpError(400, `Add one detail only the owner would know (up to ${DETAIL_MAX} characters)`);
  }
  // The same person sending their claim again (the page gave up waiting, but
  // the first one was saved): answer with the claim that stands
  if (match.status === 'claimed') {
    const standing = await Claim.findActiveByMatch(match.id);
    if (standing && standing.claimerId === req.user.id) return res.json(await overview(access, req.user));
  }
  if (match.status !== 'suggested' || lostItem.status !== 'open' || foundItem.status !== 'open'
    || foundItem.hiddenAt) {
    throw httpError(400, 'This item is no longer available to claim');
  }

  // A second active claim on the same match fails with 409 in the model
  const claim = await Claim.create({ matchId: match.id, claimerId: req.user.id, detail: detail.trim() });
  await keepFirstClaimOnFind(claim, match, foundItem);
  // Both items stop being scored against new reports from here on
  await Match.updateStatus(match.id, 'claimed');
  await Item.updateStatus(lostItem.id, 'matched');
  await Item.updateStatus(foundItem.id, 'matched');
  // Emails the finder (when their alerts are on), after the reply, so a slow
  // email service does not make the claim look failed (lib/background.js)
  inBackground(`The claim alert for match ${match.id} failed`, () => alerts.notifyNewClaim(match));

  const updated = await loadMatchFor(match.id, req.user.id);
  res.status(201).json(await overview(updated, req.user));
};

// POST /api/claims/:matchId/decline  The finder: the details do not fit.
// { reason } (required, up to 300), which the owner reads on the closed chat.
// The claim ends, the match is closed and both items open again, so the owner's
// lost report goes back to being matched. Only before the finder has accepted
// (planned a handoff), and never while a dispute is open.
exports.declineClaim = async (req, res) => {
  const access = await loadMatchFor(parseId(req.params.matchId), req.user.id);
  const { match, lostItem, foundItem, role } = access;
  if (role !== 'finder') throw httpError(403, 'Only the finder can decline a claim');

  const claim = await Claim.findActiveByMatch(match.id);
  if (!claim) throw httpError(404, 'There is no claim to decline');
  if ((await Handoff.findByMatch(match.id)).length > 0) {
    throw httpError(400, 'You already accepted this claim');
  }
  if (await Dispute.hasOpenForItem(foundItem.id)) {
    throw httpError(409, 'This item is under dispute. An admin will decide.');
  }
  const reason = (req.body || {}).reason;
  if (!isNonEmptyString(reason, REASON_MAX)) {
    throw httpError(400, `Say why the details do not fit (up to ${REASON_MAX} characters)`);
  }

  // Saved before the claim closes, so it is the finder's last word in the chat
  await Message.create({ matchId: match.id, senderId: req.user.id, text: `${DECLINE_PREFIX}${reason.trim()}` });
  inBackground('Realtime ping failed', () => Message.announce(chatChannel(match.id)));
  await Claim.update(claim.id, { status: 'declined', decidedAt: new Date().toISOString() });
  await Match.updateStatus(match.id, 'rejected');
  if (lostItem.status === 'matched') await Item.updateStatus(lostItem.id, 'open');
  if (foundItem.status === 'matched') await Item.updateStatus(foundItem.id, 'open');

  const updated = await loadMatchFor(match.id, req.user.id);
  res.json(await overview(updated, req.user));
};

// GET /api/claims/mine  The logged-in user's claims and the claims on their
// found items, newest first, for the "Your handoffs" page and the header's
// Handoffs badge. lastMessage says when the newest chat message was sent and
// whether you sent it, never what it says, so the page can mark unread chats.
// A closed claim (declined, withdrawn or overturned) stays on the list with its
// claimStatus, so the owner can still see what happened and why.
exports.getMine = async (req, res) => {
  const userId = req.user.id;
  const [myClaims, myFoundItems] = await Promise.all([
    Claim.findByClaimer(userId),
    Item.findAll({ type: 'found', postedBy: userId }),
  ]);
  // Everything here is fetched for all the rows at once, a few queries however
  // many items and chats there are: the header's badge loads this on every page
  const matchesOnMyFinds = await Match.findByFoundItems(myFoundItems.map((item) => item.id));
  const claimsOnMyFinds = await Claim.findByMatches(matchesOnMyFinds.map((match) => match.id));

  // The newest claim on each match: the one that stands, or the last one closed
  const newestByMatch = new Map();
  for (const claim of [...myClaims, ...claimsOnMyFinds]) {
    const kept = newestByMatch.get(claim.matchId);
    if (!kept || claim.id > kept.id) newestByMatch.set(claim.matchId, claim);
  }
  const newest = [...newestByMatch.values()];
  if (newest.length === 0) return res.json([]);

  const matchById = new Map(
    (await Match.findByIds(newest.map((claim) => claim.matchId))).map((match) => [Number(match.id), match]),
  );
  // Left out: a claim refused because someone else claimed the find a moment
  // earlier (its match is still suggested, see keepFirstClaimOnFind)
  const claims = newest.filter((claim) => claim.status === 'active'
    || matchById.get(Number(claim.matchId))?.status !== 'suggested');
  if (claims.length === 0) return res.json([]);
  const matches = claims.map((claim) => matchById.get(Number(claim.matchId)));
  const [handoffs, items, latestByMatch, disputes, finds] = await Promise.all([
    Handoff.findByMatches(matches.map((match) => match.id)),
    Item.findByIds([...new Set(matches.map((match) => match.foundItemId))]),
    Message.findLatestByMatches(matches.map((match) => match.id)),
    Dispute.findByClaims(claims.map((claim) => claim.id)),
    foundPlacesFor(req.user),
  ]);
  const itemById = new Map(items.map((item) => [Number(item.id), item]));
  // Claims whose handoff is paused while an admin looks at a dispute
  const pausedClaims = new Set(
    disputes.filter((dispute) => dispute.status === 'open').map((dispute) => Number(dispute.claimId)),
  );

  const rows = claims.map((claim, index) => {
    const match = matches[index];
    const handoff = handoffs.filter((entry) => entry.matchId === match.id).pop() || null;
    const last = latestByMatch.get(Number(match.id));
    const role = claim.claimerId === userId ? 'owner' : 'finder';
    const foundItem = itemById.get(Number(match.foundItemId)) || null;
    return {
      matchId: match.id,
      role,
      matchStatus: match.status,
      claimStatus: claim.status,
      claimedAt: claim.createdAt,
      handoff,
      disputeOpen: claim.status === 'active' && pausedClaims.has(Number(claim.id)),
      // Without its place and time for an owner whose reports did not say them
      foundItem: forViewer(foundItem, req.user, finds),
      lastMessage: last ? { sentAt: last.sentAt, fromMe: last.senderId === userId } : null,
    };
  });
  rows.sort((a, b) => b.claimedAt.localeCompare(a.claimedAt));
  res.json(rows);
};
