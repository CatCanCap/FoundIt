// Turns data/demo-showcase.json into the rows scripts/seed-demo.js adds to a
// database, with no database needed (the dry run and the unit test use it too).
//
// loadDemo({ now, spots, categories, colours, photoUrls })
//   spots       the campus spots with their rooms, as Spot.findAll() or
//               loadSeed().spots give them. Spots are found by building,
//               floor and area, so the ids of the database being seeded are used.
//   photoUrls   { photoKey: link } from data/demo-photos.json (missing ones stay null)
// Every row refers to the others by `key` (users, items, claims, ...); the
// seed script swaps keys for ids as it inserts.
//
// Item, match and claim statuses are worked out from the stories, the same way
// the API would leave them (see "Status lifecycle" in the README), and the
// matches come from the real engine: the reports are replayed in the order they
// were posted, each scored against the reports of the other type that were
// still open at that moment, as POST /api/items does.
const demo = require('./demo-showcase.json');
const campusSpots = require('./campus-spots.json');
const { resolveTime } = require('./load');
const { findMatches } = require('../matching');

const DECLINE_PREFIX = 'Declined the claim: ';

function loadDemo({ now = new Date(), spots, categories, colours, photoUrls = {} }) {
  const at = (daysAgo, time) => resolveTime(now, daysAgo, time).toISOString();
  const atOf = (when) => (when ? at(when.daysAgo, when.time) : null);

  // Spot key (as in campus-spots.json) -> the spot in `spots`
  const spotByPlace = new Map(spots.map((spot) => [`${spot.building}|${spot.floor}|${spot.area}`, spot]));
  function spotOf(key) {
    const raw = campusSpots.spots.find((spot) => spot.key === key);
    const spot = raw && spotByPlace.get(`${raw.building}|${raw.floor}|${raw.area}`);
    if (!spot) throw new Error(`Unknown spot key: ${key}`);
    return spot;
  }
  function roomOf(spot, name) {
    if (!name) return null;
    const room = (spot.rooms || []).find((entry) => entry.name === name);
    if (!room) throw new Error(`No room "${name}" in ${spot.building} ${spot.floor} ${spot.area}`);
    return room.id;
  }

  const userKeys = new Set(demo.users.map((user) => user.key));
  const needUser = (key) => {
    if (!userKeys.has(key)) throw new Error(`Unknown user key: ${key}`);
    return key;
  };

  const users = demo.users.map((user) => {
    const createdAt = at(user.joinedDaysAgo, '10:00');
    return {
      key: user.key, name: user.name, email: user.email, role: user.role || 'user',
      alertsOn: false, createdAt, emailVerifiedAt: createdAt, suspendedAt: null,
    };
  });
  const userByKey = new Map(users.map((user) => [user.key, user]));

  const items = demo.items.map((raw, index) => {
    const trail = raw.trail.map((point) => {
      const spot = spotOf(point.spot);
      const daysAgo = point.daysAgo ?? raw.daysAgo;
      return { spotId: spot.id, roomId: roomOf(spot, point.room), from: at(daysAgo, point.from), to: at(daysAgo, point.to) };
    });
    const posted = typeof raw.postedAt === 'object' ? raw.postedAt : { daysAgo: raw.daysAgo, time: raw.postedAt };
    if (raw.photo && !demo.photos[raw.photo]) throw new Error(`Unknown photo key: ${raw.photo}`);
    return {
      // A number for the matching engine, which works with ids
      id: index + 1,
      key: raw.key,
      type: raw.type,
      title: raw.title,
      description: raw.description,
      category: raw.category,
      colours: raw.colours,
      colour: raw.colours[0] || null,
      brand: raw.brand || null,
      photoKey: raw.photo || null,
      photoUrl: raw.photo ? photoUrls[raw.photo] || null : null,
      status: raw.status || 'open',
      hiddenAt: null,
      postedBy: needUser(raw.postedBy),
      createdAt: at(posted.daysAgo, posted.time),
      trail,
    };
  });
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const needItem = (key) => {
    if (!itemByKey.has(key)) throw new Error(`Unknown item key: ${key}`);
    return itemByKey.get(key);
  };

  // When each item stopped being open: from a claim until it was declined (or for good)
  const closedSpans = new Map(items.map((item) => [item.key, []]));
  for (const claim of demo.claims) {
    const start = at(claim.daysAgo, claim.time);
    const end = claim.declined ? atOf(claim.declined) : null;
    for (const key of [claim.lost, claim.found]) closedSpans.get(needItem(key).key).push({ start, end });
  }
  const openAt = (item, time) => item.status !== 'removed'
    && closedSpans.get(item.key).every(({ start, end }) => time < start || (end && time >= end));

  // Replay the posts in order through the matching engine
  const context = { spots, categories, colours };
  const posted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const matches = new Map();
  posted.forEach((item, index) => {
    if (item.status === 'removed') return;
    const candidates = posted.slice(0, index)
      .filter((other) => other.type !== item.type && openAt(other, item.createdAt));
    for (const result of findMatches(item, candidates, context)) {
      const other = items[result.candidateId - 1];
      const [lost, found] = item.type === 'lost' ? [item, other] : [other, item];
      matches.set(`${lost.key}|${found.key}`, {
        lost: lost.key, found: found.key, score: result.score,
        breakdown: result.breakdown, reasons: result.reasons,
        status: 'suggested', createdAt: item.createdAt,
      });
    }
  });
  const matchOf = (lost, found) => {
    const match = matches.get(`${lost}|${found}`);
    if (!match) throw new Error(`The engine does not match ${lost} with ${found}, so it cannot be claimed or rejected`);
    return match;
  };

  for (const entry of demo.rejectedMatches) matchOf(entry.lost, entry.found).status = 'rejected';

  const claims = [];
  const messages = [];
  const handoffs = [];
  for (const raw of demo.claims) {
    const match = matchOf(raw.lost, raw.found);
    const lost = itemByKey.get(raw.lost);
    const found = itemByKey.get(raw.found);
    if (lost.type !== 'lost' || found.type !== 'found') throw new Error(`Claim ${raw.key}: lost and found are the wrong way round`);
    const owner = lost.postedBy;
    const finder = found.postedBy;
    const createdAt = at(raw.daysAgo, raw.time);
    if (createdAt < match.createdAt) throw new Error(`Claim ${raw.key} is older than its match`);

    const claim = {
      key: raw.key, lost: raw.lost, found: raw.found, claimer: owner, detail: raw.detail,
      status: raw.declined ? 'declined' : 'active', decidedAt: atOf(raw.declined), createdAt,
    };
    claims.push(claim);

    for (const message of raw.messages) {
      messages.push({
        key: message.key || null, claim: raw.key, sender: message.from === 'owner' ? owner : finder,
        text: message.text, sentAt: at(message.daysAgo, message.time), removedAt: null,
      });
    }
    if (raw.declined) {
      messages.push({
        key: null, claim: raw.key, sender: finder, text: `${DECLINE_PREFIX}${raw.declined.reason}`,
        sentAt: atOf(raw.declined), removedAt: null,
      });
    }

    let completed = false;
    if (raw.handoff) {
      const handoff = raw.handoff;
      completed = Boolean(handoff.completed);
      handoffs.push({
        claim: raw.key,
        method: handoff.method,
        spotId: spotOf(handoff.spot).id,
        scheduledAt: atOf(handoff.scheduled),
        status: handoff.completed ? 'completed' : handoff.handedOver ? 'handed_over' : 'pending',
        handedOverAt: atOf(handoff.handedOver),
        completedAt: atOf(handoff.completed),
        createdAt: atOf(handoff.created),
      });
    }

    if (raw.declined) {
      match.status = 'rejected';
    } else {
      match.status = completed ? 'confirmed' : 'claimed';
      lost.status = completed ? 'resolved' : 'matched';
      found.status = completed ? 'resolved' : 'matched';
    }
  }
  messages.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const messageKeys = new Set(messages.filter((message) => message.key).map((message) => message.key));

  const claimByKey = new Map(claims.map((claim) => [claim.key, claim]));
  const disputes = demo.disputes.map((raw) => {
    const claim = claimByKey.get(raw.claim);
    if (!claim || claim.status !== 'active') throw new Error(`Dispute on ${raw.claim}: no active claim`);
    const lost = needItem(raw.lostItem);
    if (lost.status !== 'open' || lost.postedBy !== raw.raisedBy) {
      throw new Error(`Dispute on ${raw.claim}: the attached lost report must be the disputer's own and open`);
    }
    if (raw.proofPhoto && !demo.photos[raw.proofPhoto]) throw new Error(`Unknown photo key: ${raw.proofPhoto}`);
    return {
      claim: raw.claim, item: claim.found, raisedBy: needUser(raw.raisedBy), lostItem: raw.lostItem,
      description: raw.description,
      proofKey: raw.proofPhoto || null,
      proofUrl: raw.proofPhoto ? photoUrls[raw.proofPhoto] || null : null,
      claimerResponse: raw.response ? raw.response.text : null,
      respondedAt: raw.response ? atOf(raw.response) : null,
      status: 'open',
      createdAt: at(raw.daysAgo, raw.time),
    };
  });

  const reports = demo.reports.map((raw) => {
    if (raw.kind === 'message' && !messageKeys.has(raw.message)) throw new Error(`Unknown message key: ${raw.message}`);
    if (raw.kind === 'item') needItem(raw.item);
    return {
      key: raw.key, kind: raw.kind, message: raw.kind === 'message' ? raw.message : null,
      item: raw.kind === 'item' ? raw.item : null, reportedBy: needUser(raw.reportedBy), reason: raw.reason,
      status: raw.decided ? raw.decided.status : 'open',
      decidedBy: raw.decided ? needUser(raw.decided.by) : null,
      decidedAt: atOf(raw.decided),
      createdAt: at(raw.daysAgo, raw.time),
    };
  });
  const reportKeys = new Set(reports.map((report) => report.key));

  const adminActions = demo.adminActions.map((raw) => {
    if (raw.report && !reportKeys.has(raw.report)) throw new Error(`Unknown report key: ${raw.report}`);
    if (raw.message && !messageKeys.has(raw.message)) throw new Error(`Unknown message key: ${raw.message}`);
    if (raw.item) needItem(raw.item);
    const createdAt = at(raw.daysAgo, raw.time);
    if (raw.action === 'suspend_user') userByKey.get(needUser(raw.user)).suspendedAt = createdAt;
    if (raw.action === 'remove_message') {
      messages.find((message) => message.key === raw.message).removedAt = createdAt;
    }
    return {
      action: raw.action, admin: needUser(raw.by), report: raw.report || null, user: raw.user || null,
      item: raw.item || null, message: raw.message || null, reason: raw.reason, createdAt,
    };
  });

  const appeals = demo.appeals.map((raw) => {
    const user = userByKey.get(needUser(raw.user));
    if (!user.suspendedAt) throw new Error(`Appeal from ${raw.user}, who is not suspended`);
    return {
      user: raw.user, suspendedAt: user.suspendedAt, message: raw.message, proofUrl: null,
      status: 'open', createdAt: at(raw.daysAgo, raw.time),
    };
  });

  const photoKeys = [...new Set([
    ...items.map((item) => item.photoKey), ...disputes.map((dispute) => dispute.proofKey),
  ].filter(Boolean))];

  return {
    users, items, matches: [...matches.values()], claims, messages, handoffs,
    disputes, reports, adminActions, appeals, photoKeys,
  };
}

module.exports = { loadDemo, demo };
