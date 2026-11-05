// The found items whose place and time one person may see, besides their own
// finds (see lib/item-privacy.js for the rule). Shared by the items, matches
// and claims controllers and the alert emails.
const Item = require('../models/item-model');
const Match = require('../models/match-model');
const { knownFinds } = require('./item-privacy');

// Every lost report the person posted counts, closed and taken down ones too,
// so taking down a report that guessed wrong does not allow another guess.
// Admins see every place anyway, so they get an empty set, and so does
// someone without an id (nothing is shown rather than everyone's reports read).
async function foundPlacesFor(viewer) {
  if (!viewer || !viewer.id || viewer.role === 'admin') return new Set();
  const [mine, removed] = await Promise.all([
    Item.findAll({ type: 'lost', postedBy: viewer.id, includeHidden: true }),
    Item.findAll({ type: 'lost', postedBy: viewer.id, includeHidden: true, status: 'removed' }),
  ]);
  return knownFinds(await Match.findByLostItems([...mine, ...removed].map((item) => item.id)));
}

module.exports = { foundPlacesFor };
