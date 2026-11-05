// OWNER: Member 3. Saves the embeddings of the seeded reports and the harder
// test set in data/embeddings-cache.json, so tune.js --semantic can measure the
// semantic score with no key and no network. Run it again after editing
// seed-pairs.json or hard-pairs.json (it only asks Google for texts it hasn't got):
//
//   node matching/embed-cache.js        needs GEMINI_API_KEY in config.env
//
// withCachedEmbeddings(items) gives each item its embedding from the file, and
// returns how many it found none for.
require('../lib/config');
const fs = require('fs');
const path = require('path');
const { embedItems, textHash, MODEL, DIMENSIONS, isEmbeddingEnabled } = require('./embed');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'embeddings-cache.json');
const CHUNK = 90;
const PAUSE_MS = 65 * 1000;

function readCache() {
  if (!fs.existsSync(CACHE_FILE)) return { model: MODEL, dimensions: DIMENSIONS, vectors: {} };
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  // Numbers from another model or size can't be compared with ours
  if (cache.model !== MODEL || cache.dimensions !== DIMENSIONS) {
    return { model: MODEL, dimensions: DIMENSIONS, vectors: {} };
  }
  return cache;
}

// Writes the embeddings of the texts in `wanted` (old wording is dropped)
function writeCache(wanted, cache) {
  const vectors = {};
  for (const hash of [...wanted.keys()].sort()) {
    const vector = cache.vectors[hash];
    // 5 decimals keeps the file small and changes no score
    if (vector) vectors[hash] = vector.map((value) => Math.round(value * 1e5) / 1e5);
  }
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify({ model: MODEL, dimensions: DIMENSIONS, vectors })}\n`);
  return vectors;
}

function withCachedEmbeddings(items) {
  const { vectors } = readCache();
  let missing = 0;
  for (const item of items) {
    const vector = vectors[textHash(item)];
    if (vector) item.embedding = vector;
    else missing += 1;
  }
  return missing;
}

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

// Tries again after a minute (up to 3 times) when the free tier says "too many this minute"
async function withRetry(run) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= 3 || !error.message.includes('(429)')) throw error;
      console.log('Free tier limit reached, waiting a minute...');
      await pause();
    }
  }
}

async function main() {
  if (!isEmbeddingEnabled()) {
    console.error('Set GEMINI_API_KEY in config.env first.');
    process.exit(1);
  }
  const { loadSeed } = require('../data/load');
  const { loadHardSet } = require('./hard-set');
  const seed = loadSeed();
  const items = [...seed.items, ...loadHardSet(seed).items];

  const cache = readCache();
  // Keep only texts still in use, so the file doesn't grow with old wording
  const wanted = new Map(items.map((item) => [textHash(item), item]));
  const missing = [...wanted].filter(([hash]) => !cache.vectors[hash]);
  console.log(`${wanted.size} texts, ${missing.length} to fetch from ${MODEL}`);

  // The free tier allows 100 texts a minute, so fetch in chunks with a pause
  // between them, saving after each so a refusal loses nothing
  for (let start = 0; start < missing.length; start += CHUNK) {
    if (start > 0) {
      console.log(`Waiting a minute for the free tier's limit...`);
      await pause();
    }
    const chunk = missing.slice(start, start + CHUNK);
    const fetched = await withRetry(() => embedItems(chunk.map(([, item]) => item)));
    chunk.forEach(([hash], index) => {
      cache.vectors[hash] = fetched[index];
    });
    writeCache(wanted, cache);
    console.log(`Fetched ${Math.min(start + CHUNK, missing.length)} of ${missing.length}`);
  }
  const vectors = writeCache(wanted, cache);
  console.log(`Saved ${Object.keys(vectors).length} embeddings to data/embeddings-cache.json`);
}

module.exports = { withCachedEmbeddings, CACHE_FILE };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
