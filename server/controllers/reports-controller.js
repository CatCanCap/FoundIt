// Feature 5c: report an abusive chat message or a fake post to the admins.
// The report-message button in the chat (Member 5) and a "report post" button
// on an item page both call POST /api/reports.
const Item = require('../models/item-model');
const Match = require('../models/match-model');
const Message = require('../models/message-model');
const Report = require('../models/report-model');
const { httpError } = require('../lib/errors');
const { parseId, isNonEmptyString } = require('../lib/validate');

// Only the two people in a chat can see its messages, so only they can report one
async function checkCanReportMessage(message, userId) {
  if (message.senderId === userId) throw httpError(400, 'You cannot report your own message');
  const match = await Match.findById(message.matchId);
  const items = await Item.findByIds([match.lostItemId, match.foundItemId]);
  if (!items.some((item) => item.postedBy === userId)) {
    throw httpError(403, 'This is not your chat');
  }
}

// { messageId, reason } or { itemId, reason }
exports.addReport = async (req, res) => {
  const body = req.body || {};
  if (!isNonEmptyString(body.reason, 500)) throw httpError(400, 'Say what is wrong (up to 500 characters)');
  if ((body.messageId === undefined) === (body.itemId === undefined)) {
    throw httpError(400, 'Report either a message or a post');
  }

  let report;
  if (body.messageId !== undefined) {
    const message = await Message.findById(parseId(body.messageId));
    if (!message) throw httpError(404, 'Message not found');
    await checkCanReportMessage(message, req.user.id);
    report = await Report.create({
      kind: 'message', messageId: message.id, reportedBy: req.user.id, reason: body.reason.trim(),
    });
  } else {
    const item = await Item.findById(parseId(body.itemId));
    if (!item || item.status === 'removed' || item.hiddenAt) throw httpError(404, 'Item not found');
    if (item.postedBy === req.user.id) throw httpError(400, 'You cannot report your own post');
    report = await Report.create({
      kind: 'item', itemId: item.id, reportedBy: req.user.id, reason: body.reason.trim(),
    });
    if (await Report.countOpenForItem(item.id) >= Report.HIDE_AFTER_REPORTS) {
      await Item.update(item.id, { hiddenAt: new Date().toISOString() });
    }
  }
  res.status(201).json(report);
};
