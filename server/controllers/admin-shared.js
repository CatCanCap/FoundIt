// Helpers shared by the three Admin page controllers (disputes, reports and
// users). Every admin route sits behind requireAuth + requireAdmin
// (routes/admin-routes.js), and every decision is written to the action log.
const User = require('../models/user-model');
const Item = require('../models/item-model');
const Claim = require('../models/claim-model');
const Message = require('../models/message-model');
const Dispute = require('../models/dispute-model');
const Report = require('../models/report-model');
const AdminAction = require('../models/admin-action-model');
const { emptyHistory, summariseHistory, withAuthors } = require('../lib/admin-history');
const { httpError } = require('../lib/errors');
const { isNonEmptyString } = require('../lib/validate');

// ?status= on the queues: open by default, 'all' for everything
function parseStatusFilter(value, statuses) {
  if (value === undefined) return 'open';
  if (value === 'all') return undefined;
  if (!statuses.includes(value)) throw httpError(400, 'Unknown status');
  return value;
}

function requireReason(body) {
  const reason = (body || {}).reason;
  if (!isNonEmptyString(reason, 1000)) throw httpError(400, 'Give a reason (up to 1000 characters)');
  return reason.trim();
}

// A short version of an item for the queues
function itemSummary(item) {
  if (!item) return null;
  const { id, type, title, category, photoUrl, status } = item;
  return { id, type, title, category, photoUrl, status };
}

const nameOnly = (user) => (user ? { id: user.id, name: user.name } : null);

async function contactsById(ids) {
  const users = await User.findByIds([...new Set(ids.filter(Boolean))]);
  return new Map(users.map((user) => [user.id, User.toContact(user)]));
}

// Checked before anything changes, so a refused suspension leaves the case as it was
async function checkCanSuspend(userId) {
  const user = await User.findById(userId);
  if (!user) throw httpError(404, 'User not found');
  if (user.role === 'admin') throw httpError(400, 'An admin account cannot be suspended here');
  return user;
}

async function suspend(userId, now) {
  const user = await checkCanSuspend(userId);
  if (!user.suspendedAt) await User.update(userId, { suspendedAt: now.toISOString() });
}

// Loads everything summariseHistory needs in a few queries, whatever the
// number of people
async function loadHistory(users, exclude) {
  const userIds = users.filter(Boolean).map((user) => user.id);
  if (userIds.length === 0) return {};
  const [raised, claims, actions, reports] = await Promise.all([
    Dispute.findByRaisers(userIds),
    Claim.findByClaimers(userIds),
    AdminAction.findByUsers(userIds),
    Report.findByStatuses(['open', 'actioned']),
  ]);
  const [onClaims, messages, items] = await Promise.all([
    Dispute.findByClaims(claims.map((claim) => claim.id)),
    Message.findByIds(reports.filter((r) => r.messageId).map((r) => r.messageId)),
    Item.findByIds([...new Set(reports.filter((r) => r.itemId).map((r) => r.itemId))]),
  ]);
  const authored = withAuthors(
    reports,
    new Map(messages.map((message) => [message.id, message])),
    new Map(items.map((item) => [item.id, item])),
  );
  return summariseHistory(userIds, {
    raised, claims, onClaims, actions, reports: authored, users,
  }, exclude);
}

// A contact with their history added (the history is about everything except this case)
function withHistory(contact, history) {
  return contact ? { ...contact, history: history[contact.id] || emptyHistory() } : null;
}

module.exports = {
  parseStatusFilter, requireReason, itemSummary, nameOnly, contactsById,
  checkCanSuspend, suspend, loadHistory, withHistory,
};
