const supabase = require('../lib/db');
const { toCamel, toSnake } = require('../lib/case');
const { unwrap } = require('../lib/errors');

const TABLE = 'users';

exports.create = async function ({ name, email, passwordHash }) {
  const row = toSnake({ name: name.trim(), email: email.trim().toLowerCase(), passwordHash });
  return toCamel(unwrap(await supabase.from(TABLE).insert(row).select().single()));
};

exports.findByEmail = async function (email) {
  const result = await supabase.from(TABLE).select().eq('email', email.trim().toLowerCase()).maybeSingle();
  return toCamel(unwrap(result));
};

exports.findById = async function (id) {
  return toCamel(unwrap(await supabase.from(TABLE).select().eq('id', id).maybeSingle()));
};

exports.findByIds = async function (ids) {
  if (ids.length === 0) return [];
  return unwrap(await supabase.from(TABLE).select().in('id', ids)).map(toCamel);
};

// Everyone whose account is suspended right now, most recent first
exports.findSuspended = async function () {
  const result = await supabase.from(TABLE).select().not('suspended_at', 'is', null)
    .order('suspended_at', { ascending: false });
  return unwrap(result).map(toCamel);
};

// fields: any of { name, alertsOn, suspendedAt, emailVerifiedAt, verifyCodeHash,
//                 verifyCodeExpiresAt, verifyCodeSentAt, verifyAttempts,
//                 passwordHash (only after a password reset) }
// role is never changed through the API: make someone an admin in the seed
// data or the Supabase dashboard
exports.update = async function (id, fields) {
  const result = await supabase.from(TABLE).update(toSnake(fields)).eq('id', id).select().maybeSingle();
  return toCamel(unwrap(result));
};

// Counts one try at the email code, only if nobody else counted one since the
// user was read (attempts still equals `seen`). Returns the updated user, or
// null when another request got there first. Doing this BEFORE checking the
// code means requests sent at the same time cannot get more than the allowed
// number of tries.
exports.countVerifyAttempt = async function (id, seen) {
  const result = await supabase.from(TABLE).update({ verify_attempts: seen + 1 })
    .eq('id', id).eq('verify_attempts', seen).select().maybeSingle();
  return toCamel(unwrap(result));
};

// Saves a new email code, only if nothing changed since the user was read: no
// other code was sent (`previousSentAt`, or null if none was) and no try was
// counted (`previousAttempts`). Otherwise a try made at the same moment could
// be overwritten and not count. Returns the updated user, or null.
exports.replaceVerifyCode = async function (id, fields, { previousSentAt, previousAttempts }) {
  let query = supabase.from(TABLE).update(toSnake(fields)).eq('id', id).eq('verify_attempts', previousAttempts);
  query = previousSentAt ? query.eq('verify_code_sent_at', previousSentAt) : query.is('verify_code_sent_at', null);
  return toCamel(unwrap(await query.select().maybeSingle()));
};

// The same two for a password reset code, which has its own columns
// (reset_code_hash, reset_code_expires_at, reset_code_sent_at, reset_attempts)
// so a reset can never replace or lock the code that confirms the email
exports.countResetAttempt = async function (id, seen) {
  const result = await supabase.from(TABLE).update({ reset_attempts: seen + 1 })
    .eq('id', id).eq('reset_attempts', seen).select().maybeSingle();
  return toCamel(unwrap(result));
};

exports.replaceResetCode = async function (id, fields, { previousSentAt, previousAttempts }) {
  let query = supabase.from(TABLE).update(toSnake(fields)).eq('id', id).eq('reset_attempts', previousAttempts);
  query = previousSentAt ? query.eq('reset_code_sent_at', previousSentAt) : query.is('reset_code_sent_at', null);
  return toCamel(unwrap(await query.select().maybeSingle()));
};

// Never send the password hash or anything about the email or reset codes to the browser
exports.toPublic = function (user) {
  if (!user) return null;
  const {
    passwordHash, verifyCodeHash, verifyCodeExpiresAt, verifyCodeSentAt, verifyAttempts,
    resetCodeHash, resetCodeExpiresAt, resetCodeSentAt, resetAttempts, ...rest
  } = user;
  return rest;
};

// The name and SMU email only, for an admin contacting someone about a
// dispute or report
exports.toContact = function (user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, suspendedAt: user.suspendedAt };
};
