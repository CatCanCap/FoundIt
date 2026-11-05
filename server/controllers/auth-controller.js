// Register, log in, the SMU email code, and the logged-in user's own details.
// Forgot, reset and change password are in password-controller.js.
//
// A new account is not logged in until it enters the 6-digit code from its
// SMU inbox: register only sends the code, verify-email checks it and logs the
// person in, and login refuses an account that has not done this yet.
const User = require('../models/user-model');
const { hash, compare } = require('../lib/hash');
const { sign } = require('../lib/token');
const { httpError } = require('../lib/errors');
const { isNonEmptyString } = require('../lib/validate');
const verifyCode = require('../lib/verify-code');
const { limit, clientAddress } = require('../lib/rate-limit');
const {
  UNUSED_HASH, SLOW_ANSWER_MS, checkSmuEmail, checkNewSmuEmail, checkNewPassword, sendCode, waitUntil,
} = require('./auth-shared');

// Per-device limits (lib/rate-limit.js), so nobody can script sign-ups to
// email codes to every SMU address, or guess someone's code from one laptop.
// Sign-ups are generous because a whole class may share the campus wifi's address.
// Off in tests, which register many accounts from one address.
const MINUTE = 60 * 1000;
const signUpsPerDevice = limit({ max: process.env.VITEST ? Infinity : 30, windowMs: 60 * MINUTE });
const resendsPerDevice = limit({ max: 5, windowMs: 15 * MINUTE });
// Fewer than the 5 wrong tries that lock an account's code, so one device
// cannot lock someone else's code (the same rule as forgot password)
const codeTriesPerDeviceAndEmail = limit({ max: 3, windowMs: 30 * MINUTE });
const codeTriesPerDevice = limit({ max: 10, windowMs: 30 * MINUTE });
const TOO_MANY_FROM_DEVICE = 'Too many tries from this device. Wait half an hour and try again.';

function checkName(name) {
  if (!isNonEmptyString(name, Infinity)) throw httpError(400, 'Name is required');
  if (name.trim().length > 100) throw httpError(400, 'Name must be 100 characters or fewer');
}

// { name, email, password } -> 201 { email, verificationSent }. No token yet:
// the person logs in by entering the emailed code (verifyEmail below).
exports.register = async (req, res) => {
  const { name, email, password } = req.body || {};

  checkName(name);
  checkNewSmuEmail(email);
  checkNewPassword(password);
  if (!signUpsPerDevice.take(clientAddress(req))) {
    throw httpError(429, 'Too many sign-ups from this device. Wait an hour and try again.');
  }
  if (await User.findByEmail(email)) throw httpError(409, 'Email already registered');

  const user = await User.create({ name: name.trim(), email, passwordHash: await hash(password) });
  const verificationSent = await sendVerificationCode(user);
  res.status(201).json({ email: user.email, verificationSent });
};

async function sendVerificationCode(user) {
  const sent = await sendCode(user, 'verify');
  if (sent === null) throw httpError(429, 'Your code just changed. Wait a moment and try again.');
  return sent;
}

// One answer for every reason this fails (no account, already verified, no
// code, wrong code or password, expired or locked), so this page never
// reveals whether an account exists
const CODE_FAILED = 'That code or password is wrong, or the code has expired.';

// { email, code, password } -> { token, user }, like login. The code proves
// the person controls the inbox, and the password proves they made the
// account. Both are needed: otherwise someone could register a classmate's
// email with a password of their own, wait for the classmate to type in the
// code that turns up in their inbox, and then sign in as them. Wrong tries
// count towards the code's own limit of 5 (lib/verify-code.js) and the
// per-device limits above.
exports.verifyEmail = async (req, res) => {
  const finishAt = Date.now() + SLOW_ANSWER_MS;
  const { email, code, password } = req.body || {};
  checkSmuEmail(email);
  if (!verifyCode.isCodeShape(code)) throw httpError(400, 'Enter the 6-digit code from the email');
  if (typeof password !== 'string' || password.length === 0) throw httpError(400, 'Enter your password');

  const device = clientAddress(req);
  // Checked and counted together, before any await, so tries sent at the
  // same moment cannot slip past
  if (codeTriesPerDevice.isOver(device) || !codeTriesPerDeviceAndEmail.take(`${device} ${email.trim().toLowerCase()}`)) {
    throw httpError(429, TOO_MANY_FROM_DEVICE);
  }
  codeTriesPerDevice.add(device);

  const user = await User.findByEmail(email);
  let correct = false;
  if (user && !user.emailVerifiedAt && verifyCode.isCodeUsable(user)) {
    // Count the try first, so tries sent at the same time cannot get past the limit
    const counted = await User.countVerifyAttempt(user.id, user.verifyAttempts);
    // Both comparisons always run, so the time taken does not say which was wrong
    const [codeRight, passwordRight] = await Promise.all([
      compare(code.trim(), user.verifyCodeHash),
      compare(password, user.passwordHash),
    ]);
    correct = Boolean(counted) && codeRight && passwordRight;
  } else {
    // Still run the slow comparisons, so an unknown email takes as long
    await Promise.all([compare(code.trim(), UNUSED_HASH), compare(password, UNUSED_HASH)]);
  }
  if (!correct) {
    await waitUntil(finishAt);
    throw httpError(400, CODE_FAILED);
  }

  const verified = await User.update(user.id, {
    emailVerifiedAt: new Date().toISOString(),
    verifyCodeHash: null,
    verifyCodeExpiresAt: null,
    verifyAttempts: 0,
  });
  res.json({ token: sign(verified.id, verified.passwordHash), user: User.toPublic(verified) });
};

const RESEND_ANSWER = {
  message: 'If that account still needs its code, we’ve sent a new one. It works for 15 minutes.',
};

// { email } -> always the same 200, whether or not the account exists. Sends
// a new code to an unverified account, at most once a minute (half an hour
// after a code was locked by wrong tries).
exports.resendCode = async (req, res) => {
  const finishAt = Date.now() + SLOW_ANSWER_MS;
  const { email } = req.body || {};
  checkSmuEmail(email);
  if (!resendsPerDevice.take(clientAddress(req))) {
    throw httpError(429, 'Too many code requests from this device. Wait 15 minutes and try again.');
  }

  const user = await User.findByEmail(email);
  if (user && !user.emailVerifiedAt && verifyCode.secondsUntilResend(user) === 0) {
    // A code made by another request at the same moment (null) is fine too
    await sendCode(user, 'verify');
  } else {
    // About as slow as making a code, so the two cases take the same time
    await hash(verifyCode.generateCode());
  }
  await waitUntil(finishAt);
  res.json(RESEND_ANSWER);
};

// Students and admins use the same form; the account decides what they see
exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!isNonEmptyString(email, 200) || typeof password !== 'string') {
    throw httpError(400, 'Email and password are required');
  }

  const user = await User.findByEmail(email);
  // Always run the slow hash comparison, so the response time does not
  // reveal whether an email is registered
  const matches = await compare(password, user ? user.passwordHash : UNUSED_HASH);
  if (!user || !matches) throw httpError(401, 'Invalid email or password');

  // The right password, but the SMU email is not confirmed yet. If the last
  // code can no longer be used, send a fresh one so the code page works.
  if (!user.emailVerifiedAt) {
    if (!verifyCode.isCodeUsable(user) && verifyCode.secondsUntilResend(user) === 0) {
      await sendCode(user, 'verify');
    }
    throw httpError(403, 'Enter the code we emailed you to finish signing up.');
  }

  res.json({ token: sign(user.id, user.passwordHash), user: User.toPublic(user) });
};

exports.getMe = async (req, res) => {
  res.json(req.user);
};

exports.updateMe = async (req, res) => {
  const { name, alertsOn } = req.body || {};
  const fields = {};

  if (name !== undefined) {
    checkName(name);
    fields.name = name.trim();
  }
  if (alertsOn !== undefined) {
    if (typeof alertsOn !== 'boolean') throw httpError(400, 'alertsOn must be true or false');
    fields.alertsOn = alertsOn;
  }
  if (Object.keys(fields).length === 0) throw httpError(400, 'Nothing to update');

  res.json(User.toPublic(await User.update(req.user.id, fields)));
};
