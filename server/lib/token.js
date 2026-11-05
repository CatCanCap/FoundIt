// Login tokens (jsonwebtoken, open source). A token holds the user id and a
// short fingerprint of their password, so changing the password (a reset)
// signs out every token made before it: requireAuth compares the fingerprint
// with the account's password now (middleware/auth.js).
require('./config');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

// A fingerprint of the stored password hash, keyed with the server's secret,
// so it changes whenever the password does but gives nothing away about it
function passwordStamp(passwordHash) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(String(passwordHash || ''))
    .digest('base64url')
    .slice(0, 16);
}

function sign(userId, passwordHash) {
  return jwt.sign({ id: userId, pw: passwordStamp(passwordHash) }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

// What a token says: { id, pw }, or null if it is missing, altered or expired
function read(token) {
  try {
    const { id, pw } = jwt.verify(token, process.env.JWT_SECRET);
    return { id, pw };
  } catch (error) {
    return null;
  }
}

module.exports = { sign, read, passwordStamp };
