// Feature 5c: the reports tab of the Admin page, for abusive chat messages
// and fake posts. An admin dismisses a report, or warns, removes or suspends.
// Privacy: an admin sees a chat only through a dispute or a report on it.
const User = require('../models/user-model');
const Item = require('../models/item-model');
const Message = require('../models/message-model');
const Report = require('../models/report-model');
const AdminAction = require('../models/admin-action-model');
const { withAuthors } = require('../lib/admin-history');
const {
  parseStatusFilter, requireReason, itemSummary, nameOnly, contactsById, suspend, loadHistory, withHistory,
} = require('./admin-shared');
const { httpError } = require('../lib/errors');
const { parseId } = require('../lib/validate');

exports.getReports = async (req, res) => {
  const status = parseStatusFilter(req.query.status, ['open', 'dismissed', 'actioned']);
  const reports = await Report.findAll({ status });
  const items = await Item.findByIds([...new Set(reports.filter((r) => r.itemId).map((r) => r.itemId))]);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const messages = await Message.findByIds(reports.filter((r) => r.messageId).map((r) => r.messageId));
  const messagesById = new Map(messages.map((message) => [message.id, message]));

  const authored = withAuthors(reports, messagesById, itemsById);
  const users = await User.findByIds([...new Set(
    authored.flatMap((report) => [report.authorId, report.reportedBy]).filter(Boolean),
  )]);
  const usersById = new Map(users.map((user) => [user.id, user]));

  // Each report also names who wrote what was reported and who reported it (for search)
  res.json(authored.map(({ authorId, ...report }) => ({
    ...report,
    item: report.itemId ? itemSummary(itemsById.get(report.itemId)) : null,
    message: report.messageId ? messagesById.get(report.messageId) || null : null,
    people: { author: nameOnly(usersById.get(authorId)), reporter: nameOnly(usersById.get(report.reportedBy)) },
  })));
};

// The report, what was reported, who wrote or posted it, and for a message
// the messages around it in that chat
async function loadReportTarget(report) {
  if (report.kind === 'message') {
    const message = await Message.findById(report.messageId, { keepRemovedText: true });
    return { message, userId: message.senderId };
  }
  const [item] = await Item.findByIds([report.itemId]);
  return { item, userId: item.postedBy };
}

async function loadReport(req) {
  const report = await Report.findById(parseId(req.params.id));
  if (!report) throw httpError(404, 'Report not found');
  return { report, ...(await loadReportTarget(report)) };
}

// actions: what admins already did about this report, oldest first, each
// { action, reason, createdAt, admin: { id, name, email } }, so the page can
// show the outcome of a decided report
exports.getReport = async (req, res) => {
  const { report, message, item, userId } = await loadReport(req);
  const people = await User.findByIds([...new Set([userId, report.reportedBy].filter(Boolean))]);
  const contacts = new Map(people.map((user) => [user.id, User.toContact(user)]));
  // Each person's record on other cases (this report left out)
  const [context, history, actions] = await Promise.all([
    message ? Message.findAround(message) : [],
    loadHistory(people, { reportId: report.id }),
    AdminAction.findByReport(report.id),
  ]);
  const admins = await contactsById(actions.map((entry) => entry.adminId));
  res.json({
    report,
    message: message || null,
    context,
    item: item || null,
    author: withHistory(contacts.get(userId), history),
    reportedBy: withHistory(contacts.get(report.reportedBy), history),
    actions: actions.map((entry) => ({
      action: entry.action, reason: entry.reason, createdAt: entry.createdAt, admin: admins.get(entry.adminId) || null,
    })),
  });
};

// { reason? } A reason is optional when nothing was wrong
exports.dismissReport = async (req, res) => {
  const { report, item } = await loadReport(req);
  if (report.status !== 'open') throw httpError(400, 'This report has already been decided');
  const body = req.body || {};
  if (body.reason !== undefined && body.reason !== null
    && (typeof body.reason !== 'string' || body.reason.length > 1000)) {
    throw httpError(400, 'The reason must be text (up to 1000 characters)');
  }
  const reason = (body.reason || '').trim();
  const updated = await Report.update(report.id, {
    status: 'dismissed', decidedBy: req.user.id, decidedAt: new Date().toISOString(),
  });
  // A post hidden by reports shows again once an admin finds them unfounded
  if (item && item.hiddenAt && await Report.countOpenForItem(item.id) < Report.HIDE_AFTER_REPORTS) {
    await Item.update(item.id, { hiddenAt: null });
  }
  await AdminAction.create({ adminId: req.user.id, action: 'dismiss_report', reportId: report.id, reason });
  res.json(updated);
};

// Warn, remove or suspend. An admin may take more than one of these on the
// same report (for example remove the message, then suspend the sender), but
// each one only once: the same action sent again (the page gave up waiting and
// the admin pressed it again) answers with the report as it is, so a warning is
// not counted twice. `actions` are the action-log names that count as done.
async function actOnReport(req, actions, takeAction) {
  const target = await loadReport(req);
  if (target.report.status === 'dismissed') throw httpError(400, 'This report was dismissed');
  const reason = requireReason(req.body);
  const done = await AdminAction.findByReport(target.report.id);
  if (done.some((entry) => actions.includes(entry.action))) return target.report;
  const now = new Date();
  const log = await takeAction(target, now);
  await AdminAction.create({ adminId: req.user.id, reportId: target.report.id, reason, ...log });
  return Report.update(target.report.id, {
    status: 'actioned', decidedBy: req.user.id, decidedAt: now.toISOString(),
  });
}

exports.warnFromReport = async (req, res) => {
  res.json(await actOnReport(req, ['warn_user'], async ({ userId }) => ({ action: 'warn_user', userId })));
};

exports.removeFromReport = async (req, res) => {
  res.json(await actOnReport(req, ['remove_message', 'remove_item'], async ({ report, message, item, userId }, now) => {
    if (report.kind === 'message') {
      await Message.remove(message.id, now);
      return { action: 'remove_message', messageId: message.id, userId };
    }
    await Item.updateStatus(item.id, 'removed');
    return { action: 'remove_item', itemId: item.id, userId };
  }));
};

exports.suspendFromReport = async (req, res) => {
  res.json(await actOnReport(req, ['suspend_user'], async ({ userId }, now) => {
    await suspend(userId, now);
    return { action: 'suspend_user', userId };
  }));
};
