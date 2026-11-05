// OWNER: Member 3 (F2 Smart matching).
//
// findMatches(newItem, candidates, context)
//   newItem     the item just posted, with its trail
//   candidates  open items of the opposite type, each with its trail
//   context     { spots, categories, colours } - the full reference lists.
//               The tuning script may also pass `weights`,
//               `fullCreditBuildings` and `semantic` to try other values.
// An item may carry `embedding`, the meaning of its text as a list of numbers
// (run.js adds it). Without one, the description is scored on shared words only.
//
// Return an array, best match first, of at most 5 results scoring 50 or more:
//   { candidateId, score, breakdown: { C, A, L, D }, reasons: ['same floor: SCIS 1 Level 2', ...] }
// Each reason is built as { lead, detail } (reasons.js) and returned as text in
// one fixed form, "lead: detail", because the matches table stores text. The
// Matches page gets them back as { lead, detail } from GET /api/matches/mine.
//
// Each signal scores 0 to 100 and the total is the weighted sum:
//   C  category                  categoryScore   (category.js)
//   A  attributes, description   attributeScore  (attributes.js)
//   L  campus location           locationScore   (location.js)
//   D  date proximity            dateScore       (dates.js)
// A lost item can have a trail of up to 10 places. L and D are worked out for
// every pair of trail points and the best pair counts, so the owner doesn't
// need to know exactly where they lost it. Two rules keep that honest:
// - A trail stop the item was found before is skipped. If every stop is, the
//   pair is impossible and is not scored at all.
// - A trail that covers many buildings almost always "passes" any found item,
//   so L and D are scaled down once it covers more than 3 buildings
//   (trailCredit below). Category and attributes then decide.
// Only reports of the same or a related category are matched at all; a pair
// with 'Other' on either side needs the same brand or 2 shared words instead
// (canMatch in category.js). When either report's category is 'Other', the
// category says little, so it keeps only a third of its weight and the rest
// moves to attributes (weightsFor below).
//
// Keep this function pure: no database calls. Tune it with matching/tune.js.
const { canMatch, categoryScore, isOther } = require('./category');
const { attributeScore } = require('./attributes');
const { locationScore, placeOf } = require('./location');
const { formatReason, reason } = require('./reasons');
const { dateScore, foundBeforeLost } = require('./dates');

// The weights add up to 1, so the total stays 0 to 100.
// WEIGHTS is the mix tuned on the seeded pairs: colour, brand and keywords (A) tell two items
// of the same category apart, so they count most. PROPOSAL_WEIGHTS are the proposal's starting
// weights, kept so `node matching/tune.js --compare` can show the difference. See the README.
const PROPOSAL_WEIGHTS = { C: 0.4, A: 0.3, L: 0.2, D: 0.1 };
const WEIGHTS = { C: 0.15, A: 0.55, L: 0.25, D: 0.05 };
const MIN_SCORE = 50;
const MAX_RESULTS = 5;
// A trail over this many buildings or fewer gets full credit for place and time
const FULL_CREDIT_BUILDINGS = 3;
// Share of the category weight kept when either report is 'Other'
const OTHER_CATEGORY_SHARE = 1 / 3;

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

// The weights for one pair. With 'Other' on either side, category keeps a
// third of its weight and attributes get the rest, so the total still adds up to 1.
// With the tuned weights that is C 0.05 and A 0.65.
function weightsFor(lostItem, foundItem, weights) {
  if (!isOther(lostItem.category) && !isOther(foundItem.category)) return weights;
  const moved = weights.C * (1 - OTHER_CATEGORY_SHARE);
  return { ...weights, C: weights.C - moved, A: weights.A + moved };
}

// "stop 2 of 3 on your trail", only when the lost item has more than one stop
function trailNote(lostItem, index) {
  return lostItem.trail.length > 1 ? `stop ${index + 1} of ${lostItem.trail.length} on your trail` : '';
}

// A place reason with the trail stop added to its detail
function withTrailNote(placeReason, note) {
  if (!note) return placeReason;
  return reason(placeReason.lead, placeReason.detail ? `${placeReason.detail}, ${note}` : note);
}

// Share of the L and D credit a trail earns: 1 for up to 3 buildings, then
// 3 / buildings (10 buildings earn 0.3). A wide trail matches nearly anything,
// so a match on it says less.
function trailCredit(lostItem, spotsById, fullCredit = FULL_CREDIT_BUILDINGS) {
  const buildings = new Set(lostItem.trail.map((point) => (spotsById.get(point.spotId) || {}).building));
  return { credit: Math.min(1, fullCredit / buildings.size), buildings: buildings.size };
}

// Best place-and-time pair between the two trails, by its weighted L + D.
// Null when the item was found before every stop on the trail.
function bestTrailPair(lostItem, foundItem, spotsById, weights) {
  let best = null;
  lostItem.trail.forEach((lostPoint, index) => {
    for (const foundPoint of foundItem.trail) {
      if (foundBeforeLost(lostPoint, foundPoint)) continue;
      const location = locationScore(placeOf(lostPoint, spotsById), placeOf(foundPoint, spotsById));
      const date = dateScore(lostPoint, foundPoint);
      const value = weights.L * location.score + weights.D * date.score;
      if (!best || value > best.value) best = { value, location, date, index };
    }
  });
  return best;
}

// Score one lost item against one found item. Null when the pair cannot be
// the same item: unrelated categories (see canMatch), or found before the
// owner lost it.
function scorePair(lostItem, foundItem, context, spotsById) {
  const categories = context.categories || [];
  const attributes = attributeScore(lostItem, foundItem, context.colours || [], context.semantic);
  if (!canMatch(lostItem.category, foundItem.category, categories, attributes.evidence)) return null;
  const weights = weightsFor(lostItem, foundItem, context.weights || WEIGHTS);
  const pair = bestTrailPair(lostItem, foundItem, spotsById, weights);
  if (!pair) return null;
  const category = categoryScore(lostItem.category, foundItem.category, categories);
  const { location, date } = pair;
  const trail = trailCredit(lostItem, spotsById, context.fullCreditBuildings);

  const breakdown = {
    C: category.score, A: attributes.score, L: location.score * trail.credit, D: date.score * trail.credit,
  };
  const score = weights.C * breakdown.C + weights.A * breakdown.A
    + weights.L * breakdown.L + weights.D * breakdown.D;

  const note = trailNote(lostItem, pair.index);
  const locationReasons = location.reasons.map((placeReason) => withTrailNote(placeReason, note));
  if (trail.credit < 1 && location.score > 0) {
    locationReasons.push(reason(`trail covers ${trail.buildings} buildings`, 'place and time count for less'));
  }
  return {
    score: roundOne(score),
    breakdown: {
      C: roundOne(breakdown.C), A: roundOne(breakdown.A), L: roundOne(breakdown.L), D: roundOne(breakdown.D),
    },
    reasons: [...category.reasons, ...attributes.reasons, ...locationReasons, ...date.reasons]
      .map(formatReason),
  };
}

// Every candidate with its score, best first, before the cut-off. The tuning
// script uses this to see where the true match ranks.
function rankAll(newItem, candidates, context) {
  const spotsById = new Map((context.spots || []).map((spot) => [spot.id, spot]));
  const results = [];
  for (const candidate of candidates) {
    // Skip the item itself, items of the same type, and your own reports
    if (candidate.id === newItem.id || candidate.type === newItem.type) continue;
    if (newItem.postedBy && candidate.postedBy === newItem.postedBy) continue;
    const lostItem = newItem.type === 'lost' ? newItem : candidate;
    const foundItem = newItem.type === 'lost' ? candidate : newItem;
    const scored = scorePair(lostItem, foundItem, context, spotsById);
    if (scored) results.push({ candidateId: candidate.id, ...scored });
  }
  // Highest score first; equal scores keep the older report first
  return results.sort((a, b) => b.score - a.score || a.candidateId - b.candidateId);
}

exports.findMatches = function (newItem, candidates, context) {
  return rankAll(newItem, candidates, context)
    .filter((result) => result.score >= MIN_SCORE)
    .slice(0, MAX_RESULTS);
};

exports.rankAll = rankAll;
exports.scorePair = scorePair;
exports.WEIGHTS = WEIGHTS;
exports.PROPOSAL_WEIGHTS = PROPOSAL_WEIGHTS;
exports.MIN_SCORE = MIN_SCORE;
exports.MAX_RESULTS = MAX_RESULTS;
exports.FULL_CREDIT_BUILDINGS = FULL_CREDIT_BUILDINGS;
exports.trailCredit = trailCredit;
exports.weightsFor = weightsFor;
exports.OTHER_CATEGORY_SHARE = OTHER_CATEGORY_SHARE;
