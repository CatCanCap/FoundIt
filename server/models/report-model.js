// Feature 5: reports of an abusive chat message or a fake post, for the admin queue.
//   kind:   'message' (messageId is set) or 'item' (itemId is set)
//   status: 'open' -> 'dismissed' (nothing wrong) or 'actioned' (warned, removed or suspended)
const supabase = require('../lib/db');
const { toCamel, toSnake } = require('../lib/case');
const { unwrap } = require('../lib/errors');

const TABLE = 'reports';

// A post with this many open reports hides itself until an admin looks at it
exports.HIDE_AFTER_REPORTS = 3;

function fromRow(row) {
  if (!row) return null;
  const report = toCamel(row);
  return {
    ...report,
    createdAt: new Date(report.createdAt).toISOString(),
    decidedAt: report.decidedAt ? new Date(report.decidedAt).toISOString() : null,
  };
}

// data: { kind, messageId?, itemId?, reportedBy, reason }
// Every row needs both id keys, so a missing one is saved as null on purpose.
// One person can have only one open report per message or post; a second fails with 409.
exports.create = async function ({ kind, messageId = null, itemId = null, reportedBy, reason }) {
  const row = toSnake({ kind, messageId, itemId, reportedBy, reason });
  return fromRow(unwrap(await supabase.from(TABLE).insert(row).select().single()));
};

exports.findById = async function (id) {
  return fromRow(unwrap(await supabase.from(TABLE).select().eq('id', id).maybeSingle()));
};

// filters: { status }. Oldest first.
exports.findAll = async function (filters = {}) {
  let query = supabase.from(TABLE).select();
  if (filters.status) query = query.eq('status', filters.status);
  return unwrap(await query.order('created_at').order('id')).map(fromRow);
};

// Reports in any of these statuses, oldest first
exports.findByStatuses = async function (statuses) {
  if (statuses.length === 0) return [];
  const result = await supabase.from(TABLE).select().in('status', statuses).order('created_at').order('id');
  return unwrap(result).map(fromRow);
};

// How many reports on a post are still waiting for an admin
exports.countOpenForItem = async function (itemId) {
  const result = await supabase.from(TABLE).select('id', { count: 'exact', head: true })
    .eq('item_id', itemId).eq('status', 'open');
  if (result.error) unwrap(result);
  return result.count;
};

// fields: any of { status, decidedBy, decidedAt }
exports.update = async function (id, fields) {
  const result = await supabase.from(TABLE).update(toSnake(fields)).eq('id', id).select().maybeSingle();
  return fromRow(unwrap(result));
};
