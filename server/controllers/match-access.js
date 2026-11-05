// OWNER: Member 5. Shared by the claim and chat controllers.
const Match = require('../models/match-model');
const Item = require('../models/item-model');
const { httpError } = require('../lib/errors');

// Loads a match and its two items, and works out who is asking:
//   'owner'   posted the lost item and claims the match
//   'finder'  posted the found item and accepts or declines the claim
// Anyone else gets 403.
async function loadMatchFor(matchId, userId) {
  const match = await Match.findById(matchId);
  if (!match) throw httpError(404, 'Match not found');

  const [lostItem, foundItem] = await Promise.all([
    Item.findById(match.lostItemId),
    Item.findById(match.foundItemId),
  ]);
  let role = null;
  if (lostItem.postedBy === userId) role = 'owner';
  else if (foundItem.postedBy === userId) role = 'finder';
  if (!role) throw httpError(403, 'This is not your match');

  return { match, lostItem, foundItem, role };
}

module.exports = { loadMatchFor };
