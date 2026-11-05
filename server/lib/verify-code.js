// One-time codes that prove someone owns the SMU email address they
// registered with. No database here, so the rules are easy to unit test.
const crypto = require('node:crypto');

const CODE_LENGTH = 6;
// How long a code works for
const CODE_TTL_MINUTES = 15;
// Wrong guesses allowed per code, so a 6-digit code cannot be guessed
const MAX_ATTEMPTS = 5;
// The shortest wait between two emails, to protect the EmailJS quota
const RESEND_AFTER_SECONDS = 60;
// After a code is locked by wrong tries, the wait before a new one. This caps
// guessing at 5 tries per half hour, so a 6-digit code cannot be brute-forced.
const LOCKED_WAIT_SECONDS = 30 * 60;

// A random code such as '048213' (crypto, not Math.random, so it cannot be predicted)
function generateCode() {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

function isCodeShape(value) {
  return typeof value === 'string' && /^\d{6}$/.test(value.trim());
}

function expiresAt(now = new Date()) {
  return new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);
}

// Why a code cannot be checked right now, or null if it can.
// user: { emailVerifiedAt, verifyCodeHash, verifyCodeExpiresAt, verifyAttempts }
function codeProblem(user, now = new Date()) {
  if (user.emailVerifiedAt) return { status: 400, message: 'Your email is already verified' };
  if (!user.verifyCodeHash || new Date(user.verifyCodeExpiresAt) <= now) {
    return { status: 400, message: 'This code has expired. Ask for a new one.' };
  }
  if (user.verifyAttempts >= MAX_ATTEMPTS) {
    return { status: 429, message: 'Too many wrong codes. You can ask for a new one 30 minutes after the last.' };
  }
  return null;
}

// A password reset code lives in its own columns (reset_code_hash and so on),
// so asking for a reset can never replace or lock the code that confirms the
// email. This gives the reset columns the names the functions here read, so
// the same rules apply to both: isCodeUsable(asResetCode(user)).
function asResetCode(user) {
  if (!user) return null;
  return {
    verifyCodeHash: user.resetCodeHash,
    verifyCodeExpiresAt: user.resetCodeExpiresAt,
    verifyCodeSentAt: user.resetCodeSentAt,
    verifyAttempts: user.resetAttempts || 0,
  };
}

// For a password reset: whether the code on this account can still be tried.
// It must exist, not have expired, and not be locked by wrong tries. Unlike
// codeProblem it gives no reason and ignores whether the email is verified,
// so the reset page can answer the same way for every failure and never
// reveal whether an account exists. user may be null (no such account).
function isCodeUsable(user, now = new Date()) {
  return Boolean(
    user
    && user.verifyCodeHash
    && new Date(user.verifyCodeExpiresAt) > now
    && user.verifyAttempts < MAX_ATTEMPTS,
  );
}

// Wrong tries carry over to a new code, so asking for new codes cannot reset
// the limit. They start again only once the last code is half an hour old.
// The result: at most 5 guesses per half hour, however often codes are sent.
function attemptsForNewCode(user, now = new Date()) {
  if (!user.verifyCodeSentAt) return 0;
  const waited = (now.getTime() - new Date(user.verifyCodeSentAt).getTime()) / 1000;
  return waited >= LOCKED_WAIT_SECONDS ? 0 : user.verifyAttempts;
}

// Seconds to wait before another code may be sent (0 means send now): a
// minute normally, half an hour after a code was locked by wrong tries
function secondsUntilResend(user, now = new Date()) {
  if (!user.verifyCodeSentAt) return 0;
  const waited = (now.getTime() - new Date(user.verifyCodeSentAt).getTime()) / 1000;
  const wait = user.verifyAttempts >= MAX_ATTEMPTS ? LOCKED_WAIT_SECONDS : RESEND_AFTER_SECONDS;
  return Math.max(0, Math.ceil(wait - waited));
}

module.exports = {
  generateCode, isCodeShape, expiresAt, codeProblem, asResetCode, isCodeUsable, secondsUntilResend,
  attemptsForNewCode,
  CODE_TTL_MINUTES, MAX_ATTEMPTS, RESEND_AFTER_SECONDS, LOCKED_WAIT_SECONDS,
};
