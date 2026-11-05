const Item = require('../models/item-model');
const Match = require('../models/match-model');
const Claim = require('../models/claim-model');
const Handoff = require('../models/handoff-model');
const Dispute = require('../models/dispute-model');
const Room = require('../models/room-model');
const { runMatching } = require('../matching/run');
const Colour = require('../models/colour-model');
const { parseColours } = require('../lib/colours');
const { forViewer, matchForViewer } = require('../lib/item-privacy');
const { foundPlacesFor } = require('../lib/found-places');
const { httpError } = require('../lib/errors');
const { parseId, isNonEmptyString, parseDate } = require('../lib/validate');
const { optionalOurPhoto } = require('../lib/photo-size');
const { DAY } = require('../lib/time');
const { isSameReport, repeatWindowMs } = require('../lib/same-report');

const TYPES = ['lost', 'found'];
const STATUSES = ['open', 'matched', 'resolved', 'archived'];
// ?view=feed: what the public feed shows (see Item.findAll)
const VIEWS = ['feed'];
const MAX_TRAIL_POINTS = 10;
// Trail times must be real: not in the future (a few minutes' slack for a
// phone clock that runs fast), not more than a year ago, and no window longer
// than a week, which would count as "close in time" to almost everything
const FUTURE_SLACK_MS = 10 * 60 * 1000;
const OLDEST_DAYS = 365;
const LONGEST_WINDOW_DAYS = 7;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
// Editing any of these changes the scores, so the item is matched again
const SCORED_FIELDS = ['title', 'description', 'category', 'colours', 'brand'];

// Optional text field: undefined stays undefined, anything else must be text
function optionalText(value, max, label) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > max) throw httpError(400, `${label} is not valid`);
  return value.trim();
}

// True when a time filter could tell when a find was handed in. Only the
// feed's own window (from 30 days ago, give or take a day for clocks) is
// used on finds whose time is hidden; with any other window, trying one after
// another would give the time away, so those finds are left out.
const FEED_WINDOW_DAYS = 30;
function usesTimeFilter(filters) {
  if (filters.to) return true;
  if (!filters.from) return false;
  const daysBack = (Date.now() - filters.from.getTime()) / DAY;
  return Math.abs(daysBack - FEED_WINDOW_DAYS) > 1;
}

// Colours come from the fixed list (the colours table), so that matching can
// compare them: up to 3, main colour first (lib/colours.js). The list is only
// read when the request mentions colour.
async function optionalColours(body) {
  if (body.colours === undefined && body.colour === undefined) return undefined;
  return parseColours(body, await Colour.findAll());
}

// The matches of your own item. On a lost report, a match leaves out the
// place and time reasons and scores unless you may see the find's place and
// time, so posting a made-up report cannot reveal where a find was handed in
// (lib/item-privacy.js). The finder sees every match on their find whole.
async function matchesForPoster(item, matches, viewer) {
  if (item.type !== 'lost') return matches;
  const finds = await foundPlacesFor(viewer);
  return matches.map((match) => matchForViewer(match, finds));
}

// Whole number within a range, from a query string
function parseWholeNumber(value, min, max, label) {
  const text = String(value);
  if (!/^\d{1,6}$/.test(text) || Number(text) < min || Number(text) > max) {
    throw httpError(400, `${label} must be a whole number from ${min} to ${max}`);
  }
  return Number(text);
}

function parseTrail(trail, type) {
  if (!Array.isArray(trail) || trail.length === 0) throw httpError(400, 'Add at least one place');
  if (trail.length > MAX_TRAIL_POINTS) throw httpError(400, `At most ${MAX_TRAIL_POINTS} places`);
  if (type === 'found' && trail.length !== 1) throw httpError(400, 'A found item has exactly one place');

  return trail.map((point) => {
    const from = parseDate(point && point.from);
    const to = parseDate(point && point.to);
    if (from > to) throw httpError(400, 'A time window must start before it ends');
    if (to.getTime() > Date.now() + FUTURE_SLACK_MS) throw httpError(400, 'A time cannot be in the future');
    if (from.getTime() < Date.now() - OLDEST_DAYS * DAY) throw httpError(400, 'A time cannot be more than a year ago');
    if (to - from > LONGEST_WINDOW_DAYS * DAY) {
      throw httpError(400, `A time window can be at most ${LONGEST_WINDOW_DAYS} days long`);
    }
    // A room is optional; without one the point is the whole area
    const roomId = point.roomId === undefined || point.roomId === null ? null : parseId(point.roomId);
    return { spotId: parseId(point.spotId), roomId, from: from.toISOString(), to: to.toISOString() };
  });
}

// Each room named in a trail must be one of the rooms in that point's spot.
// (The database checks this too; this gives a clearer message.)
async function checkRooms(trail) {
  const rooms = await Room.findByIds(trail.filter((point) => point.roomId).map((point) => point.roomId));
  for (const point of trail) {
    if (!point.roomId) continue;
    const room = rooms.find((entry) => entry.id === point.roomId);
    if (!room) throw httpError(400, 'Room not found');
    if (room.spotId !== point.spotId) throw httpError(400, 'That room is not in the place you picked');
  }
}

exports.getItems = async (req, res) => {
  const { type, status, category, postedBy, spotId, from, to, q, view, limit, offset } = req.query;
  const filters = {};

  // Never return the whole table in one response
  filters.limit = limit === undefined ? DEFAULT_LIMIT : parseWholeNumber(limit, 1, MAX_LIMIT, 'limit');
  filters.offset = offset === undefined ? 0 : parseWholeNumber(offset, 0, 999999, 'offset');

  if (type !== undefined) {
    if (!TYPES.includes(type)) throw httpError(400, 'Unknown type');
    filters.type = type;
  }
  if (status !== undefined) {
    if (!STATUSES.includes(status)) throw httpError(400, 'Unknown status');
    filters.status = status;
  }
  if (category !== undefined) filters.category = String(category);
  if (postedBy !== undefined) {
    // Only your own reports, so nobody can look up everything one person posted
    // (for example the person who claimed their find)
    filters.postedBy = parseId(postedBy);
    if (!req.user || (req.user.id !== filters.postedBy && req.user.role !== 'admin')) {
      throw httpError(403, 'You can only list your own reports');
    }
    // Your own list still shows a post that reports have hidden
    filters.includeHidden = true;
  }
  if (spotId !== undefined) filters.spotId = parseId(spotId);
  if (from !== undefined) filters.from = parseDate(from);
  if (to !== undefined) filters.to = parseDate(to);
  if (q !== undefined) filters.q = String(q).slice(0, 100);
  if (view !== undefined) {
    if (!VIEWS.includes(view)) throw httpError(400, 'Unknown view');
    filters.feed = true;
  }

  const [items, matchedFinds] = await Promise.all([Item.findAll(filters), foundPlacesFor(req.user)]);
  let shown = items.map((item) => forViewer(item, req.user, matchedFinds));
  // Searching by place, or by a short time window, must not give away a
  // hidden place or time either
  if (filters.spotId || usesTimeFilter(filters)) shown = shown.filter((item) => !item.placeHidden);
  res.json(shown);
};

// An item anyone may see. Items an admin removed are hidden. A post hidden
// by 3 reports is hidden from the public until an admin looks at it, but its
// poster, admins and anyone with a claim on it still see it, so a live
// handoff page keeps working.
async function findVisibleItem(req) {
  const item = await Item.findById(parseId(req.params.id));
  if (!item || item.status === 'removed') throw httpError(404, 'Item not found');
  if (item.hiddenAt && !(await isInvolved(req.user, item))) throw httpError(404, 'Item not found');
  return item;
}

// The poster, an admin, or the person on the other side of a claim that
// stands on this item (the owner of a found item, the finder of a lost one)
async function isInvolved(viewer, item) {
  if (!viewer) return false;
  if (viewer.role === 'admin' || viewer.id === item.postedBy) return true;
  const claimed = (await Match.findByItem(item.id))
    .filter((match) => ['claimed', 'confirmed'].includes(match.status));
  if (claimed.length === 0) return false;
  const others = await Item.findByIds(claimed.map((match) => (item.type === 'found' ? match.lostItemId : match.foundItemId)));
  return others.some((other) => other.postedBy === viewer.id);
}

exports.getItem = async (req, res) => {
  const [item, matchedFinds] = await Promise.all([findVisibleItem(req), foundPlacesFor(req.user)]);
  res.json(forViewer(item, req.user, matchedFinds));
};

// What the item record says the item is now: 'disputed' while a dispute
// waits for an admin (the item is paused), else 'claimed' or 'returned' for
// the claim that stands, else the item's own status
function recordState(item, { claims, handoffs, disputeOpen }) {
  if (disputeOpen) return 'disputed';
  const active = claims.find((claim) => claim.status === 'active');
  if (!active) return item.status;
  const returned = handoffs.some((handoff) => handoff.matchId === active.matchId && handoff.status === 'completed');
  return returned ? 'returned' : 'claimed';
}

// Whether the viewer may see that a dispute exists: admins, the finder, the
// person whose claim is disputed and the person who raised it. Everyone else
// keeps seeing the item as claimed or returned, so the record does not hint
// that the claimer lied before an admin has decided, and does not invite
// copycat disputes. Nobody but admins learns who the other people are.
function canSeeDispute(viewer, item, dispute, claimerOf) {
  if (!viewer) return false;
  return viewer.role === 'admin'
    || viewer.id === item.postedBy
    || viewer.id === dispute.raisedBy
    || viewer.id === claimerOf.get(dispute.claimId);
}

// Feature 5a: the record of an item, for anyone, logged in or not.
// The timeline shows what happened and when, but never who claimed the item
// or who raised a dispute. Disputes show only to the people in them and
// admins (see canSeeDispute).
exports.getItemRecord = async (req, res) => {
  const item = await findVisibleItem(req);
  const matches = await Match.findByItem(item.id);
  const matchIds = matches.map((match) => match.id);
  const [claims, handoffs, allDisputes, matchedFinds] = await Promise.all([
    Claim.findByMatches(matchIds),
    Handoff.findByMatches(matchIds),
    // Disputes are raised on the found item
    item.type === 'found' ? Dispute.findByItem(item.id) : [],
    foundPlacesFor(req.user),
  ]);
  const claimerOf = new Map(claims.map((claim) => [claim.id, claim.claimerId]));
  const disputes = allDisputes.filter((dispute) => canSeeDispute(req.user, item, dispute, claimerOf));

  // A claim that ended through a dispute (overturned or withdrawn) is only
  // shown to people who may see that dispute. Otherwise a second "claimed"
  // in the public timeline would hint that someone's claim was taken away.
  const disputedClaims = new Set(disputes.map((dispute) => dispute.claimId));
  const shownClaims = claims.filter((claim) => !['overturned', 'withdrawn'].includes(claim.status)
    || disputedClaims.has(claim.id));
  const shownMatches = new Set(shownClaims.map((claim) => claim.matchId));

  const timeline = [{ event: 'reported', at: item.createdAt }];
  for (const claim of shownClaims) {
    timeline.push({ event: 'claimed', at: claim.createdAt });
    if (claim.status === 'declined') timeline.push({ event: 'claim_declined', at: claim.decidedAt || claim.createdAt });
  }
  for (const handoff of handoffs.filter((entry) => shownMatches.has(entry.matchId))) {
    if (handoff.handedOverAt) timeline.push({ event: 'handed_over', at: new Date(handoff.handedOverAt).toISOString() });
    if (handoff.completedAt) timeline.push({ event: 'returned', at: new Date(handoff.completedAt).toISOString() });
  }
  for (const dispute of disputes) {
    timeline.push({ event: 'disputed', at: dispute.createdAt });
    if (dispute.status === 'upheld') timeline.push({ event: 'dispute_upheld', at: dispute.decidedAt });
    if (dispute.status === 'closed') timeline.push({ event: 'dispute_closed', at: dispute.decidedAt });
    if (dispute.status === 'withdrawn') timeline.push({ event: 'claim_withdrawn', at: dispute.decidedAt });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const disputeOpen = disputes.some((dispute) => dispute.status === 'open');
  const state = recordState(item, { claims, handoffs, disputeOpen });

  res.json({ item: forViewer(item, req.user, matchedFinds), state, disputeOpen, timeline });
};

exports.addItem = async (req, res) => {
  const body = req.body || {};

  if (!TYPES.includes(body.type)) throw httpError(400, 'Type must be lost or found');
  if (!isNonEmptyString(body.title, 100)) throw httpError(400, 'Title is required (up to 100 characters)');
  if (!isNonEmptyString(body.category, 50)) throw httpError(400, 'Category is required');

  const trail = parseTrail(body.trail, body.type);
  const description = optionalText(body.description, 2000, 'Description') || '';
  const brand = optionalText(body.brand, 50, 'Brand');
  // Each of these asks the database or the photo host, so they run together
  const [, colours, photoUrl] = await Promise.all([
    checkRooms(trail),
    optionalColours(body),
    optionalOurPhoto(body.photoUrl, 'Photo link'),
  ]);

  const report = {
    type: body.type,
    title: body.title.trim(),
    description,
    category: body.category,
    colours: colours || [],
    brand,
    photoUrl,
    postedBy: req.user.id,
    trail,
  };

  // The same report sent again soon after: the page gave up waiting and the
  // person pressed Try again, but the first one was saved. Answer with that one
  // instead of saving a copy (and matching and emailing about it twice).
  // lib/same-report.js says what counts as the same.
  const windowMs = repeatWindowMs();
  const earlier = windowMs > 0
    ? await Item.findRecentByPoster(req.user.id, report.type, new Date(Date.now() - windowMs))
    : [];
  const repeat = earlier.find((item) => isSameReport(item, report));
  if (repeat) {
    const matches = (await Match.findLiveByItem(repeat.id))
      .filter((match) => match.status === 'suggested').slice(0, 5);
    return res.status(200).json({ item: repeat, matches: await matchesForPoster(repeat, matches, req.user) });
  }

  const item = await Item.create(report);
  const matches = await runMatching(item);
  res.status(201).json({ item, matches: await matchesForPoster(item, matches, req.user) });
};

// Loads the item and checks the logged-in user posted it
async function findOwnItem(req) {
  const item = await Item.findById(parseId(req.params.id));
  if (!item || item.status === 'removed') throw httpError(404, 'Item not found');
  if (item.postedBy !== req.user.id) throw httpError(403, 'This is not your item');
  return item;
}

exports.editItem = async (req, res) => {
  const item = await findOwnItem(req);
  const body = req.body || {};
  const fields = {};

  // Once someone has claimed the item (or it is resolved or archived), what it
  // looks like is evidence: the finder checked the claim against it and an
  // admin compares it in a dispute. So it can only change while it is open.
  const changesDetails = [...SCORED_FIELDS, 'colour', 'photoUrl'].some((key) => body[key] !== undefined);
  if (changesDetails && item.status !== 'open') {
    throw httpError(409, 'This report can no longer be edited, because someone has claimed it or it is closed');
  }

  if (body.title !== undefined) {
    if (!isNonEmptyString(body.title, 100)) throw httpError(400, 'Title is required (up to 100 characters)');
    fields.title = body.title.trim();
  }
  if (body.category !== undefined) {
    if (!isNonEmptyString(body.category, 50)) throw httpError(400, 'Category is required');
    fields.category = body.category;
  }
  if (body.status !== undefined) {
    // An owner may only close their item here, and only while it is open.
    // A matched item has a claim and a handoff (and maybe a dispute) running:
    // closing it here would leave those stuck or get around a dispute's pause.
    // "matched" and "archived" are set by the claim, handoff and daily-job
    // code through Item.updateStatus.
    if (body.status !== 'resolved') throw httpError(400, 'You can only mark your item as resolved');
    if (item.status !== 'open') {
      throw httpError(409, 'This report has a claim in progress or is already closed, so it cannot be closed here');
    }
    fields.status = body.status;
  }
  for (const [key, max] of [['description', 2000], ['brand', 50]]) {
    const value = optionalText(body[key], max, key);
    if (value !== undefined) fields[key] = value;
  }
  const colours = await optionalColours(body);
  if (colours !== undefined) fields.colours = colours;
  if (body.photoUrl !== undefined) fields.photoUrl = await optionalOurPhoto(body.photoUrl, 'Photo link');
  if (Object.keys(fields).length === 0) throw httpError(400, 'Nothing to update');

  const updated = await Item.update(item.id, fields);
  // Score the edited item again. Pairs scored before are updated, and only
  // pairs that are new send alerts.
  if (updated.status === 'open' && SCORED_FIELDS.some((key) => key in fields)) {
    await runMatching(updated);
  }
  res.json(updated);
};

// An owner may take down their report while it is still open. It is marked
// removed rather than deleted, so reports about it, its matches and its
// timeline stay for the admins. Once claimed, it is part of a claim, chat or
// dispute and stays until that is done.
exports.deleteItem = async (req, res) => {
  const item = await findOwnItem(req);
  if (item.status !== 'open') {
    throw httpError(409, 'This report has a claim in progress or is closed, so it cannot be deleted');
  }
  await Item.updateStatus(item.id, 'removed');
  res.json({ message: 'Item deleted' });
};

// Only the person who posted an item may see its matches. The other person
// sees the same match through their own item. Rejected matches and
// suggestions that can no longer go ahead are left out.
exports.getItemMatches = async (req, res) => {
  const item = await findOwnItem(req);
  res.json(await matchesForPoster(item, await Match.findLiveByItem(item.id), req.user));
};
