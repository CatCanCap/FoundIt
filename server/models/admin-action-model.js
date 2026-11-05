// Feature 5: the log of every admin action. Rows are only ever added.
const supabase = require('../lib/db');
const { toCamel, toSnake } = require('../lib/case');
const { unwrap } = require('../lib/errors');

const TABLE = 'admin_actions';

// The actions the database accepts (see the admin_actions table):
// uphold_dispute, close_dispute, dismiss_report, warn_user, remove_message,
// remove_item, suspend_user, unsuspend_user, decline_appeal

function fromRow(row) {
  if (!row) return null;
  const entry = toCamel(row);
  return { ...entry, createdAt: new Date(entry.createdAt).toISOString() };
}

// entry: { adminId, action, reason?, disputeId?, reportId?, appealId?, userId?, itemId?, messageId? }
// Every key is always sent, so one call can log several rows the same way.
exports.create = async function (entry) {
  const row = toSnake({
    adminId: entry.adminId,
    action: entry.action,
    reason: entry.reason || '',
    disputeId: entry.disputeId || null,
    reportId: entry.reportId || null,
    appealId: entry.appealId || null,
    userId: entry.userId || null,
    itemId: entry.itemId || null,
    messageId: entry.messageId || null,
  });
  return fromRow(unwrap(await supabase.from(TABLE).insert(row).select().single()));
};

// Newest first. options: { limit } (default 100)
exports.findAll = async function (options = {}) {
  const result = await supabase.from(TABLE).select()
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(options.limit || 100);
  return unwrap(result).map(fromRow);
};

// What admins did about one report, oldest first (for the report page)
exports.findByReport = async function (reportId) {
  const result = await supabase.from(TABLE).select().eq('report_id', reportId)
    .order('created_at').order('id');
  return unwrap(result).map(fromRow);
};

// The actions an admin took on a person's account: warnings, suspensions and
// lifted suspensions
const ACCOUNT_ACTIONS = ['warn_user', 'suspend_user', 'unsuspend_user', 'decline_appeal'];

// Account actions on any of these people, newest first
exports.findByUsers = async function (userIds) {
  if (userIds.length === 0) return [];
  const result = await supabase.from(TABLE).select()
    .in('user_id', userIds).in('action', ACCOUNT_ACTIONS)
    .order('created_at', { ascending: false }).order('id', { ascending: false });
  return unwrap(result).map(fromRow);
};

// Every account action on anyone, newest first (for the People list)
exports.findAccountActions = async function () {
  const result = await supabase.from(TABLE).select()
    .not('user_id', 'is', null).in('action', ACCOUNT_ACTIONS)
    .order('created_at', { ascending: false }).order('id', { ascending: false });
  return unwrap(result).map(fromRow);
};


// The latest suspension logged for this person (its reason and when), or null.
// A suspension made before the log existed has no entry.
exports.findLatestSuspension = async function (userId) {
  const result = await supabase.from(TABLE).select().eq('user_id', userId)
    .eq('action', 'suspend_user')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1);
  return fromRow(unwrap(result)[0]);
};
