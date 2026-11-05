// Helpers shared by auth-controller.js (register, log in, email code) and
// password-controller.js (forgot, reset and change password).
const User = require('../models/user-model');
const verificationEmail = require('../lib/verification-email');
const { hash } = require('../lib/hash');
const { httpError } = require('../lib/errors');
const { isNonEmptyString } = require('../lib/validate');
const verifyCode = require('../lib/verify-code');

// smu.edu.sg and its subdomains, e.g. scis.smu.edu.sg
const SMU_EMAIL = /^[^\s@]+@([a-z0-9-]+\.)*smu\.edu\.sg$/i;
// The stricter rule for a new account: letters, digits, dots, _ and - only,
// and each part of the domain starts and ends with a letter or digit. It
// leaves out "+tags" (me+1@smu.edu.sg reaches the same inbox as
// me@smu.edu.sg, so one person could make many accounts) and addresses no
// inbox can have, such as x@-.smu.edu.sg.
const NEW_SMU_EMAIL = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*smu\.edu\.sg$/i;

// A bcrypt hash of a random string nobody knows; compared against when the
// email is not registered, so that case takes as long as a real check
const UNUSED_HASH = '$2b$10$oellFozodoMgciS5yEIJcOy86VTDX0SCeOW829wMJQloRixczBw9u';

// For logging in and the email-code pages: any SMU address, so an older
// account is never locked out by the stricter rule below
function checkSmuEmail(email) {
  if (!isNonEmptyString(email, 200) || !SMU_EMAIL.test(email.trim())) {
    throw httpError(400, 'Use your SMU email address');
  }
}

// For registering only
function checkNewSmuEmail(email) {
  checkSmuEmail(email);
  if (email.trim().includes('+')) {
    throw httpError(400, 'Use your SMU email address without a "+" part');
  }
  if (!NEW_SMU_EMAIL.test(email.trim())) throw httpError(400, 'Use your SMU email address');
}

// The one password rule, for register, reset and change. bcrypt only reads
// the first 72 bytes, so longer passwords are refused. Emoji and some other
// characters take up to 4 bytes each, so the limit is counted in bytes.
function checkNewPassword(password, label = 'Password') {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw httpError(400, `${label} must be 8 to 72 characters (fewer if it has emoji)`);
  }
}

// Answers that must not reveal whether an account exists (forgot password,
// the email code) all take at least this long, so the time taken gives
// nothing away either. Off in tests.
const SLOW_ANSWER_MS = process.env.VITEST ? 0 : 1500;

function waitUntil(time) {
  return new Promise((resolve) => { setTimeout(resolve, Math.max(0, time - Date.now())); });
}

// Makes a new code, keeps only its hash, and emails it to the SMU address.
// purpose: 'verify' (confirm the email) or 'reset' (forgot password). Each has
// its own columns, so a reset never replaces or locks the email code; both
// follow the same limits, and only the email's wording differs.
// Returns true if the email went out, false if it did not, and null if no
// code was made. Without the EmailJS settings (local development), the code
// is printed in the server terminal instead.
// Two requests at the same moment cannot both make a code, and a new code
// cannot undo a try counted at the same moment: either way the request finds
// the user changed, and no code is made (null).
async function sendCode(user, purpose, now = new Date()) {
  const code = verifyCode.generateCode();
  const codeHash = await hash(code);
  const expires = verifyCode.expiresAt(now).toISOString();
  let saved;
  if (purpose === 'reset') {
    const current = verifyCode.asResetCode(user);
    saved = await User.replaceResetCode(user.id, {
      resetCodeHash: codeHash,
      resetCodeExpiresAt: expires,
      resetCodeSentAt: now.toISOString(),
      resetAttempts: verifyCode.attemptsForNewCode(current, now),
    }, { previousSentAt: current.verifyCodeSentAt || null, previousAttempts: current.verifyAttempts });
  } else {
    saved = await User.replaceVerifyCode(user.id, {
      verifyCodeHash: codeHash,
      verifyCodeExpiresAt: expires,
      verifyCodeSentAt: now.toISOString(),
      verifyAttempts: verifyCode.attemptsForNewCode(user, now),
    }, { previousSentAt: user.verifyCodeSentAt || null, previousAttempts: user.verifyAttempts || 0 });
  }
  if (!saved) return null;

  let sent = false;
  try {
    // Called through the module so tests can catch the email instead
    sent = await verificationEmail.send({ user, code, minutes: verifyCode.CODE_TTL_MINUTES, purpose });
  } catch (error) {
    console.error(`Email code (${purpose}) failed for user ${user.id}:`, error);
  }
  if (!sent && !process.env.VITEST && process.env.NODE_ENV !== 'production') {
    const label = purpose === 'reset' ? 'Password reset code' : 'Verification code';
    console.log(`Email not sent. ${label} for ${user.email}: ${code}`);
  }
  return sent;
}

module.exports = {
  UNUSED_HASH, SLOW_ANSWER_MS, checkSmuEmail, checkNewSmuEmail, checkNewPassword, sendCode, waitUntil,
};
