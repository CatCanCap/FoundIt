// OWNER: Member 3. Colour part of the A (attributes) signal.
//
// colourScore(a, b, colours)
//   a, b     colour names from the fixed list (or null when not given)
//   colours  context.colours: [{ name, hex, related }]
// Returns 100 for the same colour, 50 for a related colour (Navy and Blue),
// 0 for different colours, and null when either side has no colour, so the
// caller can leave colour out instead of counting it as a miss.
//
// itemColours(item)
// An item's colours as a list of 1 to 3 names: item.colours when it is a list,
// else item.colour on its own. Items store one colour today; once reports can
// hold up to three, send them as `colours` and the engine scores them all.
//
// colourListScore(listA, listB, colours)
// Scores two lists of 1 to 3 colours. Each colour on one side looks for its
// best partner on the other side, and the side that matches better counts for
// three quarters. So "Black and Red" against "Black" scores 87.5: the finder may
// only have noticed the main colour. Returns { score, reasons }, or
// { score: null } when either side has no colour.

const { reason } = require('./reasons');

// How many colours an item can have (lib/colours.js checks the same limit on
// every request)
const { MAX_COLOURS } = require('../lib/colours');

function colourScore(a, b, colours) {
  if (!a || !b) return null;
  if (a === b) return 100;
  const entry = colours.find((colour) => colour.name === a);
  if (entry && entry.related.includes(b)) return 50;
  return 0;
}

function itemColours(item) {
  const list = Array.isArray(item.colours) && item.colours.length > 0 ? item.colours : [item.colour];
  // Drop blanks and repeats, and keep at most three
  return [...new Set(list.filter(Boolean))].slice(0, MAX_COLOURS);
}

// Average, over the colours in `from`, of each one's best score against `to`
function bestPartners(from, to, colours) {
  const best = from.map((a) => Math.max(...to.map((b) => colourScore(a, b, colours))));
  return best.reduce((total, value) => total + value, 0) / best.length;
}

function colourListScore(listA, listB, colours) {
  if (listA.length === 0 || listB.length === 0) return { score: null, reasons: [] };
  const fromA = bestPartners(listA, listB, colours);
  const fromB = bestPartners(listB, listA, colours);
  const score = 0.75 * Math.max(fromA, fromB) + 0.25 * Math.min(fromA, fromB);

  const shared = listA.filter((name) => listB.includes(name));
  let reasons = [];
  if (score === 100) {
    reasons = [reason(shared.length > 1 ? 'same colours' : 'same colour')];
  } else if (shared.length > 0) {
    reasons = [reason('both have', shared.join(' and '))];
  } else if (score > 0) {
    // No colour in common, so name the first related pair: "Navy and Blue"
    const a = listA.find((name) => listB.some((other) => colourScore(name, other, colours) === 50));
    const b = listB.find((other) => colourScore(a, other, colours) === 50);
    reasons = [reason('similar colour', `${a} and ${b}`)];
  }
  return { score, reasons };
}

module.exports = { colourScore, itemColours, colourListScore, MAX_COLOURS };
