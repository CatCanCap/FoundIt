// One-way hashing for passwords and emailed codes (bcryptjs, open source).
const bcrypt = require('bcryptjs');

function hash(text) {
  return bcrypt.hash(text, 10);
}

function compare(text, hashed) {
  return bcrypt.compare(text, hashed);
}

module.exports = { hash, compare };
