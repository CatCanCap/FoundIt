// OWNER of the chat feature: Member 5. These functions are the database access.
const supabase = require('../lib/db');
const { toCamel, toSnake } = require('../lib/case');
const { unwrap } = require('../lib/errors');
const { allPages } = require('../lib/all-pages');

const TABLE = 'messages';

// A message an admin removed keeps its place in the chat, but its text is
// hidden (removedAt says when). Pass keepRemovedText for the admin's view.
function fromRow(row, keepRemovedText = false) {
  if (!row) return null;
  const message = toCamel(row);
  if (message.removedAt && !keepRemovedText) message.text = '';
  return message;
}

// data: { matchId, senderId, text }
exports.create = async function (data) {
  return fromRow(unwrap(await supabase.from(TABLE).insert(toSnake(data)).select().single()));
};

exports.findById = async function (id, options = {}) {
  const row = unwrap(await supabase.from(TABLE).select().eq('id', id).maybeSingle());
  return fromRow(row, options.keepRemovedText);
};

// Several messages at once, removed text included (for the admin only)
exports.findByIds = async function (ids) {
  if (ids.length === 0) return [];
  return unwrap(await supabase.from(TABLE).select().in('id', ids)).map((row) => fromRow(row, true));
};

// Oldest first. Pass { after: sentAt } to get only messages sent later,
// which is what a chat that checks every few seconds needs.
// Pass { keepRemovedText: true } only for an admin.
exports.findByMatch = async function (matchId, options = {}) {
  // Page by page, so a chat of more than 1000 messages keeps its newest ones
  const rows = await allPages(() => {
    let query = supabase.from(TABLE).select().eq('match_id', matchId);
    if (options.after) query = query.gt('sent_at', options.after);
    return query.order('sent_at').order('id');
  });
  return rows.map((row) => fromRow(row, options.keepRemovedText));
};

// The newest message of each chat (the list of handoffs shows only the last
// message). Returns a Map from each match id to its newest message; a chat
// with no messages is left out.
//
// The header's badge asks for this on every page, so it must stay a few
// queries however many chats someone has. (It used to send one query per chat
// all at once: an account with 140 chats sent 140 at the same moment, and the
// page took 10 to 30 seconds.) Two steps:
//   1. the id and time of every message in these chats, page by page so a
//      busy chat past 1000 messages still counts, and in groups of chats so
//      the address of each request stays short;
//   2. the whole row of only the newest message in each chat.
const CHATS_PER_QUERY = 200;
exports.findLatestByMatches = async function (matchIds) {
  const ids = [...new Set(matchIds.map(Number))];
  if (ids.length === 0) return new Map();

  // Newest first by sent_at, then by id when two share the same time
  const newestByChat = new Map();
  for (let start = 0; start < ids.length; start += CHATS_PER_QUERY) {
    const group = ids.slice(start, start + CHATS_PER_QUERY);
    const rows = await allPages(() => supabase.from(TABLE).select('id, match_id, sent_at')
      .in('match_id', group)
      .order('id'));
    for (const row of rows) {
      const kept = newestByChat.get(Number(row.match_id));
      const sentAt = Date.parse(row.sent_at);
      const keptAt = kept ? Date.parse(kept.sent_at) : -Infinity;
      if (!kept || sentAt > keptAt || (sentAt === keptAt && row.id > kept.id)) {
        newestByChat.set(Number(row.match_id), row);
      }
    }
  }

  const newestIds = [...newestByChat.values()].map((row) => row.id);
  const latest = new Map();
  for (let start = 0; start < newestIds.length; start += CHATS_PER_QUERY) {
    const group = newestIds.slice(start, start + CHATS_PER_QUERY);
    for (const row of unwrap(await supabase.from(TABLE).select().in('id', group))) {
      const message = fromRow(row);
      latest.set(Number(message.matchId), message);
    }
  }
  return latest;
};

// A reported message with up to `count` messages before and after it in the
// same chat, oldest first, for the admin (removed text included)
exports.findAround = async function (message, count = 5) {
  const [before, after] = await Promise.all([
    supabase.from(TABLE).select().eq('match_id', message.matchId).lt('id', message.id)
      .order('id', { ascending: false }).limit(count),
    supabase.from(TABLE).select().eq('match_id', message.matchId).gt('id', message.id)
      .order('id').limit(count),
  ]);
  return [...unwrap(before).reverse(), message, ...unwrap(after)]
    .map((row) => (row === message ? row : fromRow(row, true)));
};

// An admin takes a message down
exports.remove = async function (id, now = new Date()) {
  const result = await supabase.from(TABLE).update({ removed_at: now.toISOString() })
    .eq('id', id).select().maybeSingle();
  return fromRow(unwrap(result), true);
};

// Tells anyone listening on a chat's Realtime channel that a new message was
// saved. The ping carries no message text: the browser fetches the messages
// through the API, which checks who is asking. Get the channel name from
// lib/chat-channel.js. A failed ping never fails the request, because the
// chat page also checks for new messages every few seconds.
exports.announce = async function (channel) {
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ topic: channel, event: 'new-message', payload: {}, private: false }],
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) console.error(`Realtime ping failed with status ${response.status}`);
  } catch (error) {
    console.error('Realtime ping failed:', error);
  }
};
