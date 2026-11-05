// GET /api/stats/hotspots: the Map page's figures
const Item = require('../models/item-model');
const Spot = require('../models/spot-model');
const Match = require('../models/match-model');
const Handoff = require('../models/handoff-model');
const { summariseHotspots, hideSmallCounts } = require('../stats/hotspots');
const { httpError } = require('../lib/errors');
const { isNonEmptyString } = require('../lib/validate');
const { DAY } = require('../lib/time');

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

function parseDays(value) {
  if (value === undefined) return DEFAULT_DAYS;
  const text = String(value);
  if (!/^\d{1,3}$/.test(text) || Number(text) < 1 || Number(text) > MAX_DAYS) {
    throw httpError(400, `days must be a whole number from 1 to ${MAX_DAYS}`);
  }
  return Number(text);
}

const TYPES = ['found', 'lost'];

// Where and when a find was handed in is private (lib/item-privacy.js), so
// the figures for finds always cover the Map page's 7 days in every category,
// and leave out any building, spot or hour with fewer than 3 finds. Otherwise
// asking for one category, or one day after another, could point at a single
// find. Lost reports' places are public, so their figures are not changed.
const FOUND_DAYS = 7;
const MIN_FINDS = 3;

// item id -> completedAt for each resolved item, via its completed handoff
async function findReturnTimes(items, type) {
  const resolvedIds = new Set(items.filter((item) => item.status === 'resolved').map((item) => Number(item.id)));
  if (resolvedIds.size === 0) return new Map();

  const completed = await Handoff.findCompleted();
  const matches = await Match.findByIds(completed.map((handoff) => handoff.matchId));
  const matchById = new Map(matches.map((match) => [Number(match.id), match]));

  const returns = new Map();
  completed.forEach((handoff) => {
    const match = matchById.get(Number(handoff.matchId));
    const itemId = match && Number(type === 'lost' ? match.lostItemId : match.foundItemId);
    if (itemId && resolvedIds.has(itemId)) returns.set(itemId, handoff.completedAt);
  });
  return returns;
}

// '?category=Laptop,Phone' -> ['Laptop', 'Phone']; undefined -> []
function parseCategories(value) {
  if (value === undefined) return [];
  const names = String(value).split(',').map((name) => name.trim());
  if (names.length > 20 || !names.every((name) => isNonEmptyString(name, 50))) {
    throw httpError(400, 'Category is not valid');
  }
  return names;
}

// ?days=1-365 (default 30), ?type=found|lost, ?category=Name or Name,Name
// For finds, days and category are ignored (see FOUND_DAYS above)
exports.getHotspots = async (req, res) => {
  const type = req.query.type === undefined ? 'found' : req.query.type;
  if (!TYPES.includes(type)) throw httpError(400, 'type must be found or lost');
  const isFound = type === 'found';
  const days = isFound ? FOUND_DAYS : parseDays(req.query.days);
  const categories = isFound ? [] : parseCategories(req.query.category);

  const since = new Date(Date.now() - days * DAY);
  const [items, spots] = await Promise.all([
    // The database keeps only the asked-for categories (all when none are asked for)
    Item.findAll({ type, from: since, category: categories.length > 0 ? categories : undefined }),
    Spot.findAll(),
  ]);
  const returns = await findReturnTimes(items, type);

  const summary = summariseHotspots({ items, spots, returns });
  res.json(isFound ? hideSmallCounts(summary, MIN_FINDS) : summary);
};
