// OWNER: Member 3. The owner's Matches page (Figma V09 "3 finds look like your
// water bottle" and V10 "No matches yet").
const Item = require('../models/item-model');
const Match = require('../models/match-model');
const Claim = require('../models/claim-model');
const { buildMyMatches } = require('../matching/my-matches');
const { httpError } = require('../lib/errors');
const { forViewer, matchForViewer } = require('../lib/item-privacy');
const { foundPlacesFor } = require('../lib/found-places');
const { parseId } = require('../lib/validate');

// GET /api/matches/mine
// Your lost reports that are still open or being returned, each with the found
// items that might be it, best first, and the claims the finder declined.
exports.getMine = async (req, res) => {
  // This runs on every page for the header's badge, so it has to stay quick:
  // three rounds of queries however many reports there are, and the queries
  // in each round run at the same time
  const [reports, claims] = await Promise.all([
    Item.findAll({ type: 'lost', postedBy: req.user.id }),
    Claim.findByClaimer(req.user.id),
  ]);
  const waiting = reports.filter((report) => report.status === 'open' || report.status === 'matched');
  const waitingIds = new Set(waiting.map((report) => Number(report.id)));

  // A declined claim's match is set to rejected, so it is not live. It is kept
  // under its report here, so the owner sees what happened instead of the
  // claim just disappearing; the report itself stays open.
  const declinedClaims = claims.filter((claim) => claim.status === 'declined');

  const [allMatches, declinedList] = await Promise.all([
    Match.findByLostItems(waiting.map((report) => report.id)),
    Match.findByIds(declinedClaims.map((claim) => claim.matchId)),
  ]);
  const declinedById = new Map(declinedList.map((match) => [Number(match.id), match]));
  const declinedMatches = declinedClaims.map((claim) => declinedById.get(Number(claim.matchId)) || null);
  const declinedByReport = new Map();
  declinedClaims.forEach((claim, index) => {
    const match = declinedMatches[index];
    if (!match || !waitingIds.has(Number(match.lostItemId))) return;
    const list = declinedByReport.get(Number(match.lostItemId)) || [];
    list.push({ matchId: match.id, foundItemId: match.foundItemId, declinedAt: claim.decidedAt });
    declinedByReport.set(Number(match.lostItemId), list);
  });

  // The found items, fetched once: their statuses decide which matches are
  // still live (the reports' statuses are known already), and the page shows
  // them. No separate status query is needed.
  const candidates = allMatches.filter((match) => match.status !== 'rejected');
  const foundIds = [...new Set([
    ...candidates.map((match) => Number(match.foundItemId)),
    ...[...declinedByReport.values()].flat().map((declined) => Number(declined.foundItemId)),
  ])];
  const foundItems = await Item.findByIds(foundIds);
  const statusOf = new Map([...reports, ...foundItems].map((item) => [Number(item.id), item.status]));

  // Where and when each find was handed in shows only when your reports
  // already said it; otherwise the find and its match leave out the place and
  // time, so a made-up report cannot learn them (lib/item-privacy.js)
  const finds = await foundPlacesFor(req.user);
  const shownFinds = foundItems.map((item) => forViewer(item, req.user, finds));

  const matchesByReport = new Map(waiting.map((report) => [Number(report.id), []]));
  for (const match of candidates) {
    if (Match.isLive(match, statusOf)) matchesByReport.get(Number(match.lostItemId)).push(matchForViewer(match, finds));
  }

  res.json({ reports: buildMyMatches({ reports: waiting, matchesByReport, foundItems: shownFinds, declinedByReport }) });
};

// POST /api/matches/:id/reject
// "Not mine": the owner hides a suggested match. It stays hidden when the
// items are scored again, because a re-score never changes a match's status.
exports.rejectMatch = async (req, res) => {
  const match = await Match.findById(parseId(req.params.id));
  if (!match) throw httpError(404, 'Match not found');

  const lostItem = await Item.findById(match.lostItemId);
  if (!lostItem || lostItem.postedBy !== req.user.id) {
    throw httpError(403, 'Only the person who lost the item can hide this match');
  }
  if (match.status !== 'suggested') {
    throw httpError(409, 'This match has already been claimed or hidden');
  }

  res.json(await Match.updateStatus(match.id, 'rejected'));
};
