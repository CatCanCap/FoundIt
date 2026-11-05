// OWNER: Member 3. Gives the new item and its candidates their embeddings
// before run.js scores them, so semantic.js can compare their meaning.
//
// attachEmbeddings(item, candidates) sets `embedding` on each item it can.
// Saved embeddings are reused while the item's text is unchanged (textHash);
// the rest are made in one call to Google and saved. Items posted before this
// existed (or while Google was down) catch up the next time anything is posted.
// It never throws: without embeddings, matching scores descriptions on shared
// words only, as it did before.
const { isEmbeddingEnabled, textHash, embedItems } = require('./embed');
const ItemEmbedding = require('../models/item-embedding-model');

// The free tier allows 100 texts a minute, so one post asks for at most this
// many: the new item, then others still missing one. Several posts in one minute
// still fit, and the rest catch up on later posts.
const MAX_PER_POST = 20;

async function attachEmbeddings(item, candidates) {
  if (!isEmbeddingEnabled()) return;
  try {
    const items = [item, ...candidates];
    const saved = await ItemEmbedding.findByItemIds(items.map((entry) => entry.id));
    const missing = [];
    for (const entry of items) {
      const hash = textHash(entry);
      const row = saved.get(Number(entry.id));
      if (row && row.textHash === hash) entry.embedding = row.embedding;
      else missing.push({ entry, hash });
    }

    // The new item first, then older ones up to MAX_PER_POST
    const batch = missing.slice(0, MAX_PER_POST);
    if (batch.length === 0) return;
    const vectors = await embedItems(batch.map(({ entry }) => entry));
    batch.forEach(({ entry }, index) => {
      entry.embedding = vectors[index];
    });
    await ItemEmbedding.saveMany(batch.map(({ entry, hash }, index) => ({
      itemId: entry.id, textHash: hash, embedding: vectors[index],
    })));
  } catch (error) {
    console.error(`Embeddings failed for item ${item.id}, matching on words only:`, error.message);
  }
}

module.exports = { attachEmbeddings, MAX_PER_POST };
