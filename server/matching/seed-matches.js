// OWNER: Member 3. The matches the seeded items would have, so a freshly
// seeded database shows finds on the Matches page.
//
// seedMatches(seed)
//   seed  the result of loadSeed() from data/load.js
// Returns rows for the matches table: [{ lostItemId, foundItemId, score, breakdown, reasons }].
//
// It replays the reports in the order they were posted: each one is scored
// against the open reports of the other type posted before it, exactly as
// POST /api/items does. No database needed.
const { findMatches } = require('./index');

function seedMatches(seed) {
  const context = { spots: seed.spots, categories: seed.categories, colours: seed.colours };
  const posted = [...seed.items]
    .filter((item) => item.status === 'open')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);

  const rows = new Map();
  posted.forEach((item, index) => {
    const earlier = posted.slice(0, index).filter((other) => other.type !== item.type);
    for (const result of findMatches(item, earlier, context)) {
      const lostItemId = item.type === 'lost' ? item.id : result.candidateId;
      const foundItemId = item.type === 'found' ? item.id : result.candidateId;
      rows.set(`${lostItemId}-${foundItemId}`, {
        lostItemId,
        foundItemId,
        score: result.score,
        breakdown: result.breakdown,
        reasons: result.reasons,
      });
    }
  });
  return [...rows.values()];
}

module.exports = { seedMatches };
