const supabase = require('../lib/db');
const { toCamel, toSnake } = require('../lib/case');
const { unwrap } = require('../lib/errors');
const { allPages } = require('../lib/all-pages');
const { DAY } = require('../lib/time');

const TABLE = 'items';
const TRAIL_TABLE = 'item_trail_points';
const COLOURS_TABLE = 'item_colours';
const SELECT = '*, trail:item_trail_points(spot_id, room_id, from_time, to_time, position), '
  + 'colour_rows:item_colours(colour, position)';

// An item's colours, main colour first: ['Navy', 'White']. An item saved
// before item_colours existed (or by older code) has only items.colour, so
// that counts as its one colour.
function coloursOf(colourRows, mainColour) {
  const rows = (colourRows || []).slice().sort((a, b) => a.position - b.position);
  if (rows.length > 0) return rows.map((row) => row.colour);
  return mainColour ? [mainColour] : [];
}

// Replaces an item's colours. items.colour keeps the main colour, so code
// that reads one colour still works.
async function saveColours(itemId, colours) {
  unwrap(await supabase.from(COLOURS_TABLE).delete().eq('item_id', itemId));
  if (colours.length === 0) return;
  unwrap(await supabase.from(COLOURS_TABLE).insert(
    colours.map((colour, index) => ({ item_id: itemId, colour, position: index + 1 })),
  ));
}

function toIso(value) {
  return new Date(value).toISOString();
}

// Database row -> the item shape the API sends
function fromRow(row) {
  if (!row) return null;
  const { trail, colourRows, ...rest } = toCamel(row);
  return {
    ...rest,
    colours: coloursOf(colourRows, rest.colour),
    createdAt: toIso(rest.createdAt),
    trail: (trail || [])
      .sort((a, b) => a.position - b.position)
      .map((point) => ({
        spotId: point.spot_id,
        // The exact room, when the person named one (campus_rooms), else null
        roomId: point.room_id,
        from: toIso(point.from_time),
        to: toIso(point.to_time),
      })),
  };
}

// data: { type, title, description, category, colours: ['Navy', ...], brand,
//         photoUrl, postedBy, trail: [{ spotId, roomId?, from, to }], id?, createdAt? }
// colours (0 to 3, main colour first) also sets items.colour to the main one.
exports.create = async function (data) {
  const { trail, colours = [], ...fields } = data;
  fields.colour = colours[0] || null;
  const item = unwrap(await supabase.from(TABLE).insert(toSnake(fields)).select('id').single());

  const trailRows = trail.map((point, index) => ({
    item_id: item.id,
    spot_id: point.spotId,
    // Every row gets the key, so a point without a room saves NULL on purpose
    room_id: point.roomId ?? null,
    from_time: point.from,
    to_time: point.to,
    position: index,
  }));

  try {
    unwrap(await supabase.from(TRAIL_TABLE).insert(trailRows));
    await saveColours(item.id, colours);
  } catch (error) {
    // Do not leave an item without its trail or colours
    await supabase.from(TABLE).delete().eq('id', item.id);
    throw error;
  }

  return exports.findById(item.id);
};

exports.findById = async function (id) {
  return fromRow(unwrap(await supabase.from(TABLE).select(SELECT).eq('id', id).maybeSingle()));
};

// filters: { type, status, category, postedBy, spotId, from, to, q, feed, includeHidden, limit, offset }
// Without a limit, every matching item is returned, page by page (lib/all-pages.js).
// Items an admin removed are left out unless status is 'removed', and posts
// hidden after 3 reports are left out unless includeHidden is true (for the
// poster's own list).
// category is one name or a list of names.
// from and to are Dates; an item matches when any trail point overlaps the window.
// feed: true keeps only what the public feed shows: found items that are
// open, matched or resolved, and lost items only while open.
exports.findAll = async function (filters = {}) {
  const {
    type, status, category, postedBy, spotId, from, to, q, feed, includeHidden, limit, offset = 0,
  } = filters;

  let itemIds = null;
  if (spotId || from || to) {
    const trailRows = await allPages(() => {
      let trailQuery = supabase.from(TRAIL_TABLE).select('item_id');
      if (spotId) trailQuery = trailQuery.eq('spot_id', spotId);
      if (from) trailQuery = trailQuery.gte('to_time', from.toISOString());
      if (to) trailQuery = trailQuery.lte('from_time', to.toISOString());
      return trailQuery.order('id');
    });
    itemIds = [...new Set(trailRows.map((row) => row.item_id))];
    if (itemIds.length === 0) return [];
  }

  // A fresh query each time, so it can be asked for again page by page
  function makeQuery() {
    let query = supabase.from(TABLE).select(SELECT);
    if (itemIds) query = query.in('id', itemIds);
    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);
    else query = query.neq('status', 'removed');
    if (!includeHidden) query = query.is('hidden_at', null);
    if (feed) {
      query = query.in('status', ['open', 'matched', 'resolved']).or('type.eq.found,status.eq.open');
    }
    // One category name, or a list of names (any of them)
    if (Array.isArray(category)) query = query.in('category', category);
    else if (category) query = query.eq('category', category);
    if (postedBy) query = query.eq('posted_by', postedBy);

    if (q) {
      // Keep letters, digits and spaces only, so the text cannot change the filter
      const safe = q.replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (safe) query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
    return query.order('created_at', { ascending: false }).order('id', { ascending: false });
  }

  const rows = limit ? unwrap(await makeQuery().range(offset, offset + limit - 1)) : await allPages(makeQuery);
  return rows.map(fromRow);
};

// Several items at once, removed ones included (for the admin's view)
exports.findByIds = async function (ids) {
  if (ids.length === 0) return [];
  return unwrap(await supabase.from(TABLE).select(SELECT).in('id', ids)).map(fromRow);
};

// One person's reports of one type saved at or after `since` (a Date), newest
// first, removed ones left out. POST /api/items uses it to spot the same report
// sent twice (Try again after a slow reply).
exports.findRecentByPoster = async function (postedBy, type, since) {
  const rows = unwrap(await supabase.from(TABLE).select(SELECT)
    .eq('posted_by', postedBy).eq('type', type).neq('status', 'removed')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(20));
  return rows.map(fromRow);
};

exports.findOpenByType = async function (type) {
  return exports.findAll({ type, status: 'open' });
};

// fields: any of { title, description, category, colours, brand, photoUrl, status, hiddenAt }
// colours replaces the item's colours and sets items.colour to the main one.
exports.update = async function (id, fields) {
  const { colours, ...rest } = fields;
  if (colours !== undefined) rest.colour = colours[0] || null;
  if (Object.keys(rest).length > 0) {
    unwrap(await supabase.from(TABLE).update(toSnake(rest)).eq('id', id));
  }
  if (colours !== undefined) await saveColours(id, colours);
  return exports.findById(id);
};

exports.coloursOf = coloursOf;

exports.updateStatus = async function (id, status) {
  return exports.update(id, { status });
};

exports.remove = async function (id) {
  unwrap(await supabase.from(TABLE).delete().eq('id', id));
};

// Archives open items older than `days` days. Returns how many were archived.
exports.archiveStale = async function (days) {
  const cutoff = new Date(Date.now() - days * DAY).toISOString();
  const result = await supabase.from(TABLE).update({ status: 'archived' })
    .eq('status', 'open').lt('created_at', cutoff).select('id');
  return unwrap(result).length;
};
