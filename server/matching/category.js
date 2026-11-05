// OWNER: Member 3. The C (category) signal.
//
// categoryScore(a, b, categories)
//   a, b        category names, e.g. 'Wallet'
//   categories  context.categories: [{ name, related }]
// Returns { score, reasons }: 100 for the same category, 50 for a related one
// (Wallet and Cardholder), 0 otherwise.
//
// canMatch(a, b, categories, evidence)
//   evidence  from attributeScore: { sameBrand, sharedWords, similarText }
// Whether two reports may be matched at all. Only the same or a related
// category may, so a black umbrella is never offered for black headphones just
// because both are black and were at the same place. 'Other' says nothing about
// what the item is (a finder may file a power bank as 'Other' that its owner
// filed as 'Charger'), so a pair with 'Other' on either side, two 'Other'
// reports included, needs the text to back it up instead: the same brand, at
// least MIN_SHARED_WORDS words in common, or descriptions that mean the same
// thing in other words (similarText, see semantic.js). Colour and place never count.
//
// 'Other' is for anything that fits no other category, so two 'Other'
// reports can be completely different things. index.js gives the category less
// weight whenever either report is 'Other' (see isOther), so the description
// and colour decide, and two 'Other' reports get no "same category" reason.

const { reason } = require('./reasons');
const OTHER = 'Other';
const MIN_SHARED_WORDS = 2;

function isOther(name) {
  return name === OTHER;
}

function isRelated(a, b, categories) {
  const entryA = categories.find((category) => category.name === a);
  const entryB = categories.find((category) => category.name === b);
  // Check both sides, so the match still counts if only one list names the other
  return Boolean((entryA && entryA.related.includes(b)) || (entryB && entryB.related.includes(a)));
}

function categoryScore(a, b, categories) {
  if (!a || !b) return { score: 0, reasons: [] };
  if (a === b) return { score: 100, reasons: isOther(a) ? [] : [reason('same category')] };
  if (isRelated(a, b, categories)) {
    return { score: 50, reasons: [reason('similar category', `${a} and ${b}`)] };
  }
  return { score: 0, reasons: [] };
}

function canMatch(a, b, categories, evidence = {}) {
  if (isOther(a) || isOther(b)) {
    return Boolean(evidence.sameBrand) || Boolean(evidence.similarText)
      || (evidence.sharedWords || 0) >= MIN_SHARED_WORDS;
  }
  return categoryScore(a, b, categories).score > 0;
}

module.exports = { categoryScore, canMatch, isOther, OTHER, MIN_SHARED_WORDS };
