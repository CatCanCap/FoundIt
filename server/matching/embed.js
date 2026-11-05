// OWNER: Member 3. The only place the app calls Google's Gemini embedding model.
// It turns a report's title and description into a list of numbers for its
// meaning (an embedding). semantic.js compares two lists; the score itself is
// our own code, the model only reads the text.
//
// The key (GEMINI_API_KEY) stays on the server. Leave it empty to switch this
// off: matching then scores descriptions on shared words only. Tests never
// call Google, like they never send email.
//
// We use the free tier, so Google may use what we send to improve its products.
// Only the title and description are sent (the feed already shows them to
// everyone), never who posted, where or when, and embeddingText() blanks out
// email addresses, phone numbers and long numbers (card or matric numbers) first.
const crypto = require('crypto');

const MODEL = 'gemini-embedding-2';
const DIMENSIONS = 768;
const BATCH_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
// The most texts the API takes in one request
const BATCH_SIZE = 100;
// Posting a report waits for matching, so don't wait long for Google
const TIMEOUT_MS = 5000;

function isEmbeddingEnabled() {
  return Boolean(process.env.GEMINI_API_KEY) && !process.env.VITEST;
}

// Email addresses, then phone numbers and any long run of digits ("9123 4567",
// "+65 9123-4567", "01234567"). "10000mAh" and "TI-84" are short, so they stay.
function scrub(text) {
  return String(text || '')
    .replace(/\S+@\S+/g, '[email]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '[number]');
}

// The text sent for one item, in the form Google suggests for a document
//   embeddingText({ title: 'Black thermos', description: 'Dent near the bottom' })
//   -> 'title: Black thermos | text: Dent near the bottom'
function embeddingText(item) {
  return `title: ${scrub(item.title).trim()} | text: ${scrub(item.description).trim()}`;
}

// Short fingerprint of the text, model and size. A saved embedding is only
// used while the item's text still has the same hash.
function textHash(item) {
  return crypto.createHash('sha256')
    .update(`${MODEL}/${DIMENSIONS}/${embeddingText(item)}`)
    .digest('hex')
    .slice(0, 16);
}

async function embedBatch(texts) {
  const response = await fetch(BATCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // The key goes in a header so it never shows up in logs
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: DIMENSIONS,
      })),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  const embeddings = body.embeddings;
  if (!response.ok || !Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new Error(`Gemini embeddings failed (${response.status}): ${body.error?.message || 'no embeddings'}`);
  }
  return embeddings.map((embedding) => embedding.values);
}

// One embedding per item, in order. Throws if Google can't be reached or
// refuses (for example the free tier's daily limit); callers decide what to do.
async function embedItems(items) {
  const vectors = [];
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const texts = items.slice(start, start + BATCH_SIZE).map(embeddingText);
    vectors.push(...await embedBatch(texts));
  }
  return vectors;
}

module.exports = { isEmbeddingEnabled, scrub, embeddingText, textHash, embedItems, MODEL, DIMENSIONS, BATCH_SIZE };
