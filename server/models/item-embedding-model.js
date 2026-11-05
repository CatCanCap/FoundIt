// The meaning of each item's text as a list of numbers, for the matching
// engine's semantic score (WS3, matching/embed.js). Never sent to the browser.
const supabase = require('../lib/db');
const { unwrap } = require('../lib/errors');

const TABLE = 'item_embeddings';

// Map of itemId -> { textHash, embedding } for the items that have one
exports.findByItemIds = async function (itemIds) {
  const byItem = new Map();
  if (itemIds.length === 0) return byItem;
  const rows = unwrap(await supabase.from(TABLE)
    .select('item_id, text_hash, embedding')
    .in('item_id', itemIds));
  for (const row of rows) {
    byItem.set(Number(row.item_id), { textHash: row.text_hash, embedding: row.embedding });
  }
  return byItem;
};

// rows: [{ itemId, textHash, embedding }]. Replaces an item's earlier row.
exports.saveMany = async function (rows) {
  if (rows.length === 0) return;
  unwrap(await supabase.from(TABLE).upsert(rows.map((row) => ({
    item_id: row.itemId,
    text_hash: row.textHash,
    embedding: row.embedding,
  })), { onConflict: 'item_id' }));
};
