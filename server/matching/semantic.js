// OWNER: Member 3. Meaning-based similarity between two reports' text, for the A signal.
//
// semanticScore(a, b, settings)
//   a, b      items that may carry `embedding`: a list of numbers for the meaning of
//             their title and description (see matching/embed.js). Reports with the
//             same meaning in other words ("spectacles" and "glasses") get lists that
//             point the same way.
//   settings  { floor, ceiling } to try other values from tune.js; defaults below
// Returns a score from 0 to 100, or null when either report has no embedding
// (no key set, or the embedding service was down), so matching falls back to
// keywords alone.
//
// How close two lists point is their cosine similarity, from -1 to 1. The score is
// a straight line from 0 at FLOOR to 100 at CEILING. With gemini-embedding-2 even
// unrelated reports sit near 0.68 (two short reports about lost things have a lot
// in common), look-alikes near 0.79 and true pairs mostly above 0.82. Both
// were picked with `node matching/tune.js --semantic-grid` (see the README), and
// depend on the model, so run it again after changing the model.
// This file only does arithmetic: no network, no database.

const FLOOR = 0.74;
const CEILING = 0.84;

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return null;
  let dot = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    sizeA += a[i] * a[i];
    sizeB += b[i] * b[i];
  }
  if (sizeA === 0 || sizeB === 0) return null;
  return dot / Math.sqrt(sizeA * sizeB);
}

function semanticScore(a, b, settings = {}) {
  const similarity = cosine(a.embedding, b.embedding);
  if (similarity === null) return null;
  const floor = settings.floor ?? FLOOR;
  const ceiling = settings.ceiling ?? CEILING;
  const score = (100 * (similarity - floor)) / (ceiling - floor);
  return Math.max(0, Math.min(100, score));
}

module.exports = { cosine, semanticScore, FLOOR, CEILING };
