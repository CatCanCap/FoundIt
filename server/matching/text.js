// OWNER: Member 3. Turns free text into a set of keywords for the A signal.
//
// keywords('Black Totes umbrella with a wooden handle') -> Set { 'black', 'tote', 'umbrella', 'wooden', 'handle' }
//
// Common words ("the", "with", "found") are dropped because every report has
// them. A plural "s" is cut off so "stickers" and "sticker" count as the same
// word. Those cut-down stems are for scoring only; forms() also keeps each word
// as it was written, so the reasons people read say "stickers", not "sticker".

const STOPWORDS = new Set([
  // Everyday English
  'a', 'about', 'above', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as',
  'at', 'be', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'down', 'during', 'each', 'few', 'for', 'from', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'just', 'me', 'more', 'most', 'my', 'no', 'nor', 'not', 'of', 'off', 'on', 'one', 'only',
  'or', 'other', 'our', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'still',
  'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'three', 'through', 'to', 'too', 'two', 'under', 'up', 'upon', 'very', 'was', 'we',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'within', 'would', 'you', 'your',
  // Words every lost-and-found report uses, so they say nothing about the item
  'found', 'lost', 'left', 'near', 'nearby', 'next', 'picked', 'handed', 'dropped', 'item',
  'inside', 'side', 'bit', 'lot', 'lots', 'many', 'think', 'maybe', 'probably', 'please',
]);

// Cut a plural "s" ("cards" -> "card", but not "glass" or "case")
function stem(word) {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

// Each useful word of the text twice over: `stem` for scoring and `word` as
// the person wrote it (lower case), for the reason people read.
//   forms('Over-ear headphones') -> [{ stem: 'overear', word: 'over-ear' },
//                                    { stem: 'headphone', word: 'headphones' }]
// Lower case, join hyphenated words ("EZ-Link" -> "ezlink", "USB-C" -> "usbc"),
// split on anything else that is not a letter or digit, drop stopwords and cut
// plurals.
function forms(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((token) => token.replace(/^-+|-+$/g, ''))
    .map((word) => ({ word, joined: word.replace(/-/g, '') }))
    .filter(({ joined }) => joined.length > 1 && !STOPWORDS.has(joined))
    .map(({ word, joined }) => ({ stem: stem(joined), word }));
}

// Just the stems, for scoring
function words(text) {
  return forms(text).map((form) => form.stem);
}

function keywords(...texts) {
  return new Set(texts.flatMap(words));
}

// True when every word of `phrase` appears in `text`, e.g. 'Hydro Flask' in a description.
function mentions(text, phrase) {
  const textWords = new Set(words(text));
  const phraseWords = words(phrase);
  return phraseWords.length > 0 && phraseWords.every((word) => textWords.has(word));
}

module.exports = { STOPWORDS, forms, words, keywords, mentions };
