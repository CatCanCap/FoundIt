const supabase = require('../lib/db');
const { toCamel, toSnake } = require('../lib/case');
const { unwrap } = require('../lib/errors');

const TABLE = 'matches';

function fromRow(row) {
  if (!row) return null;
  const match = toCamel(row);
  return { ...match, createdAt: new Date(match.createdAt).toISOString() };
}

function byScore(a, b) {
  return b.score - a.score;
}

function pairKey(lostItemId, foundItemId) {
  return `${lostItemId}-${foundItemId}`;
}

// rows: [{ lostItemId, foundItemId, score, breakdown, reasons }]
// A pair that was scored before is updated instead of duplicated.
// Each saved match comes back with isNew: true if the pair was never scored
// before, so alerts go out once per match and not on every re-score.
exports.saveMany = async function (rows) {
  if (rows.length === 0) return [];

  const lostIds = [...new Set(rows.map((row) => Number(row.lostItemId)))];
  const foundIds = [...new Set(rows.map((row) => Number(row.foundItemId)))];
  const existing = unwrap(await supabase.from(TABLE).select('lost_item_id, found_item_id')
    .in('lost_item_id', lostIds)
    .in('found_item_id', foundIds));
  const seenBefore = new Set(existing.map((row) => pairKey(row.lost_item_id, row.found_item_id)));

  const result = await supabase.from(TABLE)
    .upsert(rows.map(toSnake), { onConflict: 'lost_item_id,found_item_id' })
    .select();
  return unwrap(result).map(fromRow)
    .map((match) => ({ ...match, isNew: !seenBefore.has(pairKey(match.lostItemId, match.foundItemId)) }))
    .sort(byScore);
};

exports.findById = async function (id) {
  return fromRow(unwrap(await supabase.from(TABLE).select().eq('id', id).maybeSingle()));
};

// itemId must be a number (use parseId on anything from a request)
exports.findByItem = async function (itemId) {
  const id = Number(itemId);
  const result = await supabase.from(TABLE).select()
    .or(`lost_item_id.eq.${id},found_item_id.eq.${id}`)
    .order('score', { ascending: false });
  return unwrap(result).map(fromRow);
};

// The matches worth showing for an item, best first. Leaves out:
// - rejected matches
// - suggestions where either item is no longer open (it was claimed through
//   another match, resolved or archived)
// A claimed or confirmed match is always kept, so both people can follow
// their handoff to the end.
exports.findLiveByItem = async function (itemId) {
  const matches = (await exports.findByItem(itemId)).filter((match) => match.status !== 'rejected');
  if (matches.length === 0) return [];

  const itemIds = [...new Set(matches.flatMap((match) => [match.lostItemId, match.foundItemId]))];
  const items = unwrap(await supabase.from('items').select('id, status').in('id', itemIds));
  const statusOf = new Map(items.map((item) => [Number(item.id), item.status]));

  return matches.filter((match) => exports.isLive(match, statusOf));
};

// The rule findLiveByItem uses, for code that already has the items' statuses
// (statusOf: Map from item id to status). No database here.
exports.isLive = function (match, statusOf) {
  if (match.status === 'rejected') return false;
  if (match.status === 'claimed' || match.status === 'confirmed') return true;
  return statusOf.get(Number(match.lostItemId)) === 'open'
    && statusOf.get(Number(match.foundItemId)) === 'open';
};

// Every match on any of these lost items, best first, in one query (findByItem
// for many lost items at once). Filter with isLive once the items' statuses
// are known.
exports.findByLostItems = async function (lostItemIds) {
  const ids = [...new Set(lostItemIds.map(Number))];
  if (ids.length === 0) return [];
  const result = await supabase.from(TABLE).select()
    .in('lost_item_id', ids)
    .order('score', { ascending: false });
  return unwrap(result).map(fromRow);
};

// Every match on any of these found items, best first, in one query (findByItem
// for many found items at once)
exports.findByFoundItems = async function (foundItemIds) {
  const ids = [...new Set(foundItemIds.map(Number))];
  if (ids.length === 0) return [];
  const result = await supabase.from(TABLE).select()
    .in('found_item_id', ids)
    .order('score', { ascending: false });
  return unwrap(result).map(fromRow);
};

// Supabase sends back at most 1000 rows per query, and a long id list also
// makes the request address too long, so findByIds asks in batches of this size
const ID_BATCH = 500;

// Several matches by id, in no particular order. Any number of ids is fine:
// they are asked for in batches, so none are silently left out.
exports.findByIds = async function (ids) {
  const unique = [...new Set(ids.map(Number))];
  const rows = [];
  for (let start = 0; start < unique.length; start += ID_BATCH) {
    const batch = unique.slice(start, start + ID_BATCH);
    rows.push(...unwrap(await supabase.from(TABLE).select().in('id', batch)));
  }
  return rows.map(fromRow);
};

// Deletes matches that are still only suggestions (nobody claimed or
// rejected them), for pairs that no longer fit after an item was edited.
// A match in any other state is left alone.
exports.removeSuggested = async function (ids) {
  if (ids.length === 0) return;
  unwrap(await supabase.from(TABLE).delete().in('id', ids).eq('status', 'suggested'));
};

// Marks those matches rejected if they are still suggested, instead of
// deleting them: hidden from both people like a deleted one, but kept, so a
// lost report's wrong guess at a find's place still counts (lib/found-places.js).
// A re-score never changes a match's status, so it stays hidden.
exports.rejectSuggested = async function (ids) {
  if (ids.length === 0) return;
  unwrap(await supabase.from(TABLE).update({ status: 'rejected' }).in('id', ids).eq('status', 'suggested'));
};

exports.updateStatus = async function (id, status) {
  const result = await supabase.from(TABLE).update({ status }).eq('id', id).select().maybeSingle();
  return fromRow(unwrap(result));
};
