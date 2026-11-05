// Feature 5: a suspended student's appeal against their suspension, one for
// each suspension (appeals table). An admin accepts it (the suspension is
// lifted) or declines it, with a reply the student sees.
const supabase = require('../lib/db');
const { toCamel, toSnake } = require('../lib/case');
const { unwrap } = require('../lib/errors');

const TABLE = 'appeals';

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function fromRow(row) {
  if (!row) return null;
  const appeal = toCamel(row);
  return {
    ...appeal,
    suspendedAt: iso(appeal.suspendedAt),
    decidedAt: iso(appeal.decidedAt),
    createdAt: iso(appeal.createdAt),
  };
}

// { userId, suspendedAt, message, proofUrl? }. A second appeal for the same
// suspension breaks the unique rule, which unwrap turns into a 409.
exports.create = async function ({ userId, suspendedAt, message, proofUrl }) {
  const row = toSnake({ userId, suspendedAt, message, proofUrl: proofUrl || null });
  return fromRow(unwrap(await supabase.from(TABLE).insert(row).select().single()));
};

exports.findById = async function (id) {
  return fromRow(unwrap(await supabase.from(TABLE).select().eq('id', id).maybeSingle()));
};

// The person's most recent appeal, or null
exports.findLatestForUser = async function (userId) {
  const result = await supabase.from(TABLE).select().eq('user_id', userId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1);
  return fromRow(unwrap(result)[0]);
};

// Oldest first, so the longest wait comes first. statuses: e.g. ['open']
exports.findByStatuses = async function (statuses) {
  const result = await supabase.from(TABLE).select().in('status', statuses)
    .order('created_at', { ascending: true }).order('id', { ascending: true });
  return unwrap(result).map(fromRow);
};

// Decides an open appeal: { status: 'accepted' | 'declined', reply, decidedBy }.
// Returns null when it was no longer open (another admin decided it first).
exports.decide = async function (id, { status, reply, decidedBy }) {
  const result = await supabase.from(TABLE)
    .update(toSnake({ status, reply, decidedBy, decidedAt: new Date().toISOString() }))
    .eq('id', id).eq('status', 'open').select();
  return fromRow(unwrap(result)[0]);
};

// When a suspension is lifted some other way (the People tab), its open
// appeal is accepted with the same reason, so it does not wait for nothing
exports.acceptOpenForUser = async function (userId, { reply, decidedBy }) {
  const result = await supabase.from(TABLE)
    .update(toSnake({ status: 'accepted', reply, decidedBy, decidedAt: new Date().toISOString() }))
    .eq('user_id', userId).eq('status', 'open').select();
  return unwrap(result).map(fromRow);
};
