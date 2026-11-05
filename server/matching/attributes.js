// OWNER: Member 3. The A (attributes and description) signal.
//
// attributeScore(a, b, colours, semantic)
//   a, b      the two items ({ title, description, category, colour or colours, brand },
//             and an `embedding` when one was made, see semantic.js)
//   colours   context.colours: [{ name, hex, related }]
//   semantic  context.semantic: { floor, ceiling, share } to try other values from tune.js
// Returns { score, reasons, parts: { colour, brand, keywords }, evidence }.
// evidence is { sameBrand, sharedWords, similarText }: what the two reports' text
// has in common, which category.js asks for before an 'Other' report may match.
//
// Three parts, each 0 to 100, structured fields first:
//   colour    same 100, related 50 (Navy and Blue), different 0. With 1 to 3
//             colours a side, see colourListScore in colours.js
//   brand     same 100, different 0. If only one report names a brand and the
//             other report's text mentions it ("Totes umbrella"), that counts too
//   keywords  how many words of the title and description the two reports share,
//             or 0.4 of how close their meaning is (semantic.js), whichever is higher.
//             So "gold-rimmed specs" and "eyeglasses, golden frame" still count
//             although they share no word.
// A part is left out (null) when one report doesn't give it, so a finder who
// doesn't know the brand is not punished. The score is the weighted average of
// the parts that are left.
const { colourListScore, itemColours } = require('./colours');
const { forms, words, keywords, mentions } = require('./text');
const { reason } = require('./reasons');
const { semanticScore } = require('./semantic');

const PART_WEIGHTS = { colour: 0.3, brand: 0.3, keywords: 0.4 };

// Shared words needed for full keyword marks. Finders write short reports, so
// we compare against the shorter report, but never fewer than this many words
// (two one-word reports that share their only word should not score 100).
const KEYWORDS_FOR_FULL_MARKS = 4;

// Meaning score at which the descriptions count as saying the same thing: it gets
// a reason, and it backs up an 'Other' report the way 2 shared words do
const SIMILAR_TEXT = 60;

// Share of the meaning score the text part can earn. Two reports of the same
// kind of thing (two umbrellas) always mean much the same, so full credit
// would reward look-alikes; shared words stay the stronger evidence. 0.4 was
// picked with tune.js --semantic-grid: it finds every hard-set pair and keeps
// the seeded pairs' noise close to what words alone give (see the README).
const MEANING_SHARE = 0.4;

function brandScore(a, b) {
  const brandA = words(a.brand).join(' ');
  const brandB = words(b.brand).join(' ');
  if (brandA && brandB) {
    return brandA === brandB
      ? { score: 100, reasons: [reason('same brand', a.brand)] }
      : { score: 0, reasons: [] };
  }
  // Only one side named a brand: look for it in the other side's text
  const named = brandA ? a : brandB ? b : null;
  if (!named) return { score: null, reasons: [] };
  const other = named === a ? b : a;
  if (mentions(`${other.title} ${other.description}`, named.brand)) {
    return { score: 100, reasons: [reason('both mention', named.brand)] };
  }
  return { score: null, reasons: [] };
}

// Words already scored by another signal (colour names, brands, categories)
// are left out, so they don't count twice.
function keywordScore(a, b, colours) {
  const scoredElsewhere = keywords(
    ...colours.map((colour) => colour.name),
    a.brand, b.brand, a.category, b.category,
  );
  const wordsOf = (item) => [...keywords(item.title, item.description)]
    .filter((word) => !scoredElsewhere.has(word));
  const wordsA = wordsOf(a);
  const wordsB = new Set(wordsOf(b));
  const shared = wordsA.filter((word) => wordsB.has(word));

  const needed = Math.max(Math.min(wordsA.length, wordsB.size), KEYWORDS_FOR_FULL_MARKS);
  const score = Math.min(100, (100 * shared.length) / needed);
  // Scored on stems, but the reason shows each word as the first report wrote it
  // ("stickers", "over-ear"), not the stem ("sticker", "overear")
  const written = new Map();
  for (const form of [...forms(`${a.title} ${a.description}`), ...forms(`${b.title} ${b.description}`)]) {
    if (!written.has(form.stem)) written.set(form.stem, form.word);
  }
  const shown = shared.slice(0, 3).map((stem) => written.get(stem) || stem);
  const reasons = shared.length > 0 ? [reason('both mention', shown.join(', '))] : [];
  return { score, reasons, shared };
}

function attributeScore(a, b, colours, semantic = {}) {
  const colour = colourListScore(itemColours(a), itemColours(b), colours);
  const brand = brandScore(a, b);
  const keyword = keywordScore(a, b, colours);
  const meaning = semanticScore(a, b, semantic);
  const similarText = meaning !== null && meaning >= SIMILAR_TEXT;
  // The text part counts whichever is higher: the shared words or the meaning,
  // which earns only MEANING_SHARE of its score (see the constant)
  const share = semantic.share ?? MEANING_SHARE;
  const meaningCredit = meaning === null ? null : meaning * share;
  const text = meaningCredit !== null && meaningCredit > keyword.score ? meaningCredit : keyword.score;
  const parts = { colour: colour.score, brand: brand.score, keywords: text };

  let total = 0;
  let weightUsed = 0;
  for (const [name, value] of Object.entries(parts)) {
    if (value === null) continue;
    total += PART_WEIGHTS[name] * value;
    weightUsed += PART_WEIGHTS[name];
  }
  const score = weightUsed > 0 ? total / weightUsed : 0;

  // Said only when the meaning, not the shared words, set the text part
  const meaningReasons = similarText && text === meaningCredit ? [reason('similar description')] : [];
  const reasons = [...colour.reasons, ...brand.reasons, ...keyword.reasons, ...meaningReasons];
  const evidence = { sameBrand: brand.score === 100, sharedWords: keyword.shared.length, similarText };
  return { score, reasons, parts, evidence };
}

module.exports = { attributeScore, brandScore, keywordScore, PART_WEIGHTS, SIMILAR_TEXT, MEANING_SHARE };
