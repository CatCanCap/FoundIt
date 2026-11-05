// Forgot password (an emailed 6-digit code, then a new password) and the
// Profile page's change password.
//
// How forgot password is kept safe, in plain terms:
// - The answers never say whether an email has an account, and every answer
//   takes at least 1.5 seconds, so the time taken gives nothing away either.
// - Each account's reset code locks after 5 wrong tries (lib/verify-code.js).
// - One device may only ask for a few codes and try a few codes per email
//   (lib/rate-limit.js), so nobody can lock someone else's reset from one laptop.
// - A correct code changes the password, which signs out every other session
//   (lib/token.js).
const User = require('../models/user-model');
const { hash, compare } = require('../lib/hash');
const { sign } = require('../lib/token');
const { httpError } = require('../lib/errors');
const verifyCode = require('../lib/verify-code');
const { limit, clientAddress } = require('../lib/rate-limit');
const {
  UNUSED_HASH, SLOW_ANSWER_MS, checkSmuEmail, checkNewPassword, sendCode, waitUntil,
} = require('./auth-shared');

// Forgot password, step 1: { email }. Emails a 6-digit code if the email has
// an account and no reset code was sent in the last minute (half an hour after
// a code was locked by wrong tries). The answer is always the same 200, so
// nobody can use this page to find out whether an email has an account.
const RESET_SENT = {
  message: 'If an account exists for that email, we’ve sent a 6-digit code. It works for 15 minutes.',
};
// Every answer (and every failed reset) takes at least this long, so the time
// taken (sending an email or not, checking a code or not) does not give away
// whether the account exists either
const RESET_MIN_MS = SLOW_ANSWER_MS;

// Per-device limits (lib/rate-limit.js), on top of each account's own limits.
// One device may ask for 5 codes and try 3 codes for one email in a while,
// fewer than the 5 wrong tries that lock an account's code, so nobody can lock
// someone else out of resetting from a single device. Every try counts, right
// or wrong, and is counted before any waiting, so tries sent at the same
// moment cannot slip past.
const MINUTE = 60 * 1000;
const codeRequestsPerDevice = limit({ max: 5, windowMs: 15 * MINUTE });
const codeTriesPerDeviceAndEmail = limit({ max: 3, windowMs: 30 * MINUTE });
const codeTriesPerDevice = limit({ max: 10, windowMs: 30 * MINUTE });
const TOO_MANY_FROM_DEVICE = 'Too many tries from this device. Wait half an hour and try again.';

exports.forgotPassword = async (req, res) => {
  const finishAt = Date.now() + RESET_MIN_MS;
  const { email } = req.body || {};
  checkSmuEmail(email);

  const device = clientAddress(req);
  if (!codeRequestsPerDevice.take(device)) {
    throw httpError(429, 'Too many code requests from this device. Wait 15 minutes and try again.');
  }

  const user = await User.findByEmail(email);
  if (user && verifyCode.secondsUntilResend(verifyCode.asResetCode(user)) === 0) {
    // A code made by another request at the same moment (null) is fine too
    await sendCode(user, 'reset');
  } else {
    // About as slow as making a code, so the two cases take the same time
    await hash(verifyCode.generateCode());
  }
  await waitUntil(finishAt);
  res.json(RESET_SENT);
};

// One answer for every reason a reset code fails (no account, no code, wrong,
// expired or locked), so it never reveals whether an account exists
const RESET_CODE_FAILED = 'That code is wrong or has expired.';

// Forgot password, step 2: { email, code, password }. A correct code proves
// the person controls the inbox, so it replaces the password, marks the email
// verified if it was not, and logs them in: { token, user } like login. The
// new password changes the token fingerprint (lib/token.js), so every other
// session is signed out. Wrong tries count towards the reset code's own limit
// of 5 per half hour. A suspended account can reset, but stays suspended.
exports.resetPassword = async (req, res) => {
  const finishAt = Date.now() + RESET_MIN_MS;
  const { email, code, password } = req.body || {};
  checkSmuEmail(email);
  if (!verifyCode.isCodeShape(code)) throw httpError(400, 'Enter the 6-digit code from the email');
  checkNewPassword(password);

  const device = clientAddress(req);
  const deviceAndEmail = `${device} ${email.trim().toLowerCase()}`;
  // Checked and counted together, before any await (see the limits above)
  if (codeTriesPerDevice.isOver(device) || !codeTriesPerDeviceAndEmail.take(deviceAndEmail)) {
    throw httpError(429, TOO_MANY_FROM_DEVICE);
  }
  codeTriesPerDevice.add(device);

  const user = await User.findByEmail(email);
  const resetCode = verifyCode.asResetCode(user);
  let correct = false;
  if (verifyCode.isCodeUsable(resetCode)) {
    // Count the try first, so tries sent at the same time cannot get past the limit
    const counted = await User.countResetAttempt(user.id, resetCode.verifyAttempts);
    correct = Boolean(counted) && (await compare(code.trim(), resetCode.verifyCodeHash));
  } else {
    // Still run the slow comparison, so an unknown email takes as long
    await compare(code.trim(), UNUSED_HASH);
  }
  if (!correct) {
    await waitUntil(finishAt);
    throw httpError(400, RESET_CODE_FAILED);
  }

  const fields = {
    passwordHash: await hash(password),
    resetCodeHash: null,
    resetCodeExpiresAt: null,
    resetAttempts: 0,
  };
  // The inbox is proven, so an unconfirmed email counts as confirmed now
  if (!user.emailVerifiedAt) {
    Object.assign(fields, {
      emailVerifiedAt: new Date().toISOString(),
      verifyCodeHash: null,
      verifyCodeExpiresAt: null,
      verifyAttempts: 0,
    });
  }
  const updated = await User.update(user.id, fields);
  res.json({ token: sign(updated.id, updated.passwordHash), user: User.toPublic(updated) });
};

// The Profile page: { currentPassword, newPassword }. The current password
// must be right. A wrong one answers 400, not 401, because the browser logs
// out on any 401. The new password changes the token fingerprint
// (lib/token.js), so every other session is signed out; this one gets a new
// token: { token, user } like login.
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    throw httpError(400, 'Enter your current password');
  }
  checkNewPassword(newPassword, 'New password');

  const user = await User.findById(req.user.id);
  if (!(await compare(currentPassword, user.passwordHash))) {
    throw httpError(400, 'Your current password is wrong');
  }
  if (currentPassword === newPassword) {
    throw httpError(400, 'Choose a password different from your current one');
  }

  const updated = await User.update(user.id, { passwordHash: await hash(newPassword) });
  res.json({ token: sign(updated.id, updated.passwordHash), user: User.toPublic(updated) });
};
