// OWNER: Member 3. Loads the harder test set in data/hard-pairs.json for tune.js --hard.
// No database needed, and it is never seeded.
//
// loadHardSet(seed, now) -> { groups: [{ groupId, note, lostItemId, foundItemId, distractorIds }], items }
// Items are shaped like loadSeed()'s, with ids from 1001 so they never clash with the seed.
// Each side gets its own poster (lost 101, found 102, look-alikes 103), because
// findMatches skips a person's own reports.
const hardPairs = require('../data/hard-pairs.json');
const { resolveTime } = require('../data/load');

const FIRST_ID = 1001;
const POSTERS = { lost: 101, found: 102, distractor: 103 };

function loadHardSet(seed, now = new Date()) {
  const spotIdByKey = new Map(require('../data/campus-spots.json').spots.map((spot, index) => [spot.key, index + 1]));
  const items = [];

  function addItem(raw, type, postedBy) {
    const trail = raw.trail.map((point) => {
      if (!spotIdByKey.has(point.spot)) throw new Error(`Unknown spot key: ${point.spot}`);
      return {
        spotId: spotIdByKey.get(point.spot),
        roomId: null,
        from: resolveTime(now, raw.daysAgo, point.from).toISOString(),
        to: resolveTime(now, raw.daysAgo, point.to).toISOString(),
      };
    });
    const item = {
      id: FIRST_ID + items.length,
      type,
      title: raw.title,
      description: raw.description,
      category: raw.category,
      colours: raw.colours || (raw.colour ? [raw.colour] : []),
      colour: (raw.colours && raw.colours[0]) || raw.colour || null,
      brand: raw.brand || null,
      status: 'open',
      postedBy,
      trail,
    };
    items.push(item);
    return item;
  }

  const groups = hardPairs.groups.map((group) => {
    const lost = addItem(group.lost, 'lost', POSTERS.lost);
    const found = addItem(group.found, 'found', POSTERS.found);
    const distractorIds = group.distractors.map((raw) => addItem(raw, 'found', POSTERS.distractor).id);
    return { groupId: group.groupId, note: group.note, lostItemId: lost.id, foundItemId: found.id, distractorIds };
  });

  // Check every category and colour against the seed's lists, so a typo fails loudly
  const categoryNames = new Set(seed.categories.map((category) => category.name));
  const colourNames = new Set(seed.colours.map((colour) => colour.name));
  for (const item of items) {
    if (!categoryNames.has(item.category)) throw new Error(`Unknown category: ${item.category}`);
    for (const colour of item.colours) {
      if (!colourNames.has(colour)) throw new Error(`Unknown colour: ${colour}`);
    }
  }
  return { groups, items };
}

module.exports = { loadHardSet };
