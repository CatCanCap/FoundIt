const User = require('../models/user-model');
const { read, passwordStamp } = require('../lib/token');
const { httpError } = require('../lib/errors');

// Requests that only read. Unverified and suspended users may still make these.
const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// The user whose token came with the request, or null. A token made before
// the password last changed (or before tokens carried the fingerprint) no
// longer counts, so a password reset signs out every other session.
async function findTokenUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = read(token);
  if (!payload?.id) return null;
  const user = await User.findById(payload.id);
  if (!user || payload.pw !== passwordStamp(user.passwordHash)) return null;
  return user;
}

async function loadUser(req) {
  const user = await findTokenUser(req);
  if (!user) throw httpError(401, 'Please log in');
  req.user = User.toPublic(user);
}

// Use on any route that needs a logged-in user: router.get('/x', requireAuth, handler)
// Someone whose account is suspended (or who still has a login from before
// their SMU email was confirmed) can look around, but every request that changes
// something (post, claim, chat, report, dispute) is refused here, so no
// feature route has to check for either itself.
async function requireAuth(req, res, next) {
  await loadUser(req);
  checkCanChangeThings(req);
  next();
}

// Only for changing your password, which a suspended account (or an older
// login from before its email was confirmed) may still do
async function requireLogin(req, res, next) {
  await loadUser(req);
  next();
}

// For public pages that show more to some people (the item record shows a
// dispute only to the people in it and admins). Sets req.user when a valid
// token comes with the request, else req.user is null. A missing or expired
// token is never an error here: the visitor just sees the public view.
async function optionalAuth(req, res, next) {
  const user = await findTokenUser(req);
  req.user = user ? User.toPublic(user) : null;
  next();
}

function checkCanChangeThings(req) {
  if (READ_METHODS.includes(req.method)) return;
  if (!req.user.emailVerifiedAt) {
    throw httpError(403, 'Verify your SMU email first. Enter the code we emailed you.');
  }
  if (req.user.suspendedAt) {
    throw httpError(403, 'Your account is suspended. Contact the FoundIt admins through your SMU email.');
  }
}

// Use after requireAuth on every admin route:
//   router.get('/disputes', requireAuth, requireAdmin, handler)
// The role is read from the database on every request (in requireAuth), so it
// is checked on the server and cannot be faked from the browser.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') throw httpError(403, 'Admins only');
  next();
}

module.exports = { requireAuth, requireLogin, optionalAuth, requireAdmin, checkCanChangeThings };
