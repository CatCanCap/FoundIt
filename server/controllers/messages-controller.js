const Claim = require('../models/claim-model');
const Message = require('../models/message-model');
const { loadMatchFor } = require('./match-access');
const { chatChannel } = require('../lib/chat-channel');
const { inBackground } = require('../lib/background');
const { httpError } = require('../lib/errors');
const { parseId, isNonEmptyString, parseDate } = require('../lib/validate');

// The same text from the same person within this time is one message sent twice
const REPEAT_WINDOW_MS = 2 * 60 * 1000;

// Only the two people in the match may chat, and only while the owner's claim
// stands. A declined or overturned claim closes the chat.
async function openChat(req) {
  const { match } = await loadMatchFor(parseId(req.params.matchId), req.user.id);
  const claim = await Claim.findActiveByMatch(match.id);
  if (!claim) throw httpError(403, 'The chat opens once the owner claims the item');
  return match;
}

exports.getMessages = async (req, res) => {
  const match = await openChat(req);
  const { after } = req.query;
  // Checked as a date, but passed on as sent, so no fraction of a second is lost
  if (after !== undefined) parseDate(after);
  res.json(await Message.findByMatch(match.id, { after }));
};

exports.addMessage = async (req, res) => {
  const match = await openChat(req);
  // Once the handoff is resolved the chat is read-only (Figma V12.6)
  if (match.status === 'confirmed') throw httpError(409, 'This handoff is resolved, so the chat is read-only');
  const text = req.body ? req.body.text : undefined;
  if (!isNonEmptyString(text, 1000)) throw httpError(400, 'Message is empty or too long');

  // The same message sent again soon after (the page gave up waiting and the
  // person pressed Retry, but the first one was saved): answer with that one
  const since = new Date(Date.now() - REPEAT_WINDOW_MS).toISOString();
  const repeat = (await Message.findByMatch(match.id, { after: since }))
    .find((earlier) => earlier.senderId === req.user.id && earlier.text === text.trim());
  if (repeat) return res.json(repeat);

  const message = await Message.create({ matchId: match.id, senderId: req.user.id, text: text.trim() });
  // Tell the other person's open chat page to fetch the new message, after the
  // reply (lib/background.js). The ping gives up after 3 seconds and never throws.
  inBackground('Realtime ping failed', () => Message.announce(chatChannel(match.id)));
  res.status(201).json(message);
};

// The Realtime channel to listen on (see client/src/realtime.js)
exports.getChannel = async (req, res) => {
  const match = await openChat(req);
  res.json({ channel: chatChannel(match.id) });
};
