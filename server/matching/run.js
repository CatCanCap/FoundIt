// Runs Member 3's scoring for a newly posted (or edited) item and saves the results.
// A problem in scoring must never stop someone from posting their item.
const { inBackground } = require('../lib/background');
const matching = require('./index');
const { attachEmbeddings } = require('./attach-embeddings');
const alerts = require('../alerts');
const Item = require('../models/item-model');
const Spot = require('../models/spot-model');
const Category = require('../models/category-model');
const Colour = require('../models/colour-model');
const Match = require('../models/match-model');
const { knowsWhereAndWhen } = require('../lib/item-privacy');

function toRow(item, result) {
  return {
    lostItemId: item.type === 'lost' ? item.id : result.candidateId,
    foundItemId: item.type === 'found' ? item.id : result.candidateId,
    score: result.score,
    breakdown: result.breakdown || {},
    reasons: result.reasons || [],
  };
}

// The item's suggested matches that this run did not return. findMatches only
// gives the top 5, so a missing pair may simply be 6th best; scoring the
// partner alone tells whether it still reaches the cut-off.
// Returns { keep: rows to save again, dropIds: match ids to remove,
// rejectIds: match ids to hide but keep }. A pair whose lost report did not
// name the find's building and time is kept as rejected rather than deleted:
// otherwise editing a report until its match drops below the cut-off would
// wipe a wrong guess at the place and allow another (lib/found-places.js).
async function rescoreEarlierPairs(item, candidates, rows, context) {
  const returned = new Set(rows.map((row) => `${row.lostItemId}-${row.foundItemId}`));
  const candidateById = new Map(candidates.map((candidate) => [Number(candidate.id), candidate]));
  const earlier = (await Match.findByItem(item.id)).filter((match) => match.status === 'suggested'
    && !returned.has(`${match.lostItemId}-${match.foundItemId}`));

  const keep = [];
  const dropIds = [];
  const rejectIds = [];
  for (const match of earlier) {
    const partner = candidateById.get(Number(item.type === 'lost' ? match.foundItemId : match.lostItemId));
    // A partner that is no longer open is already hidden from both people
    if (!partner) continue;
    const results = await matching.findMatches(item, [partner], context);
    const result = (Array.isArray(results) ? results : [])
      .find((entry) => Number(entry.candidateId) === Number(partner.id));
    if (result) keep.push(toRow(item, result));
    else if (knowsWhereAndWhen(match)) dropIds.push(match.id);
    else rejectIds.push(match.id);
  }
  return { keep, dropIds, rejectIds };
}

async function runMatching(item) {
  let saved;
  try {
    const oppositeType = item.type === 'lost' ? 'found' : 'lost';
    const [candidates, spots, categories, colours] = await Promise.all([
      Item.findOpenByType(oppositeType),
      Spot.findAll(),
      Category.findAll(),
      Colour.findAll(),
    ]);

    // The meaning of each report's text, for the semantic score (WS3). Never
    // throws; without it, descriptions are scored on shared words only.
    await attachEmbeddings(item, candidates);

    // Call through the module so tests (and hot fixes) can replace the function.
    // await works whether findMatches is a normal or an async function.
    const context = { spots, categories, colours };
    const results = await matching.findMatches(item, candidates, context);
    const rows = (Array.isArray(results) ? results : []).map((result) => toRow(item, result));

    // After an edit, pairs saved earlier may no longer fit (a wallet edited
    // into an umbrella). Score each one again on its own: keep it with its
    // new score and reasons, or drop it if it no longer reaches the cut-off.
    const earlier = await rescoreEarlierPairs(item, candidates, rows, context);
    if (earlier.dropIds.length > 0) await Match.removeSuggested(earlier.dropIds);
    if (earlier.rejectIds.length > 0) await Match.rejectSuggested(earlier.rejectIds);

    const fresh = rows.length > 0 ? await Match.saveMany(rows) : [];
    if (earlier.keep.length > 0) await Match.saveMany(earlier.keep);
    saved = fresh;
  } catch (error) {
    console.error(`Matching failed for item ${item.id}:`, error);
    return [];
  }

  // Alert once per new pair, not every time a pair is scored again.
  // The emails take several seconds (lookups, then EmailJS), so they finish
  // after the reply (lib/background.js) and the poster does not wait for them.
  const newMatches = saved.filter((match) => match.isNew);
  if (newMatches.length > 0) {
    inBackground(`Match alerts failed for item ${item.id}`, () => alerts.notifyNewMatches(newMatches));
  }
  return saved;
}

module.exports = { runMatching };
