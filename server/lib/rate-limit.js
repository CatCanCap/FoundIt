// A small limit on how often one device may do something, such as asking for
// password reset codes. It is kept in the server's memory: each running copy
// of the server counts on its own and forgets on restart, so it slows a
// person down rather than stopping a determined attacker. The per-account
// limits in lib/verify-code.js are the real guard; this one stops a single
// device from using them up on someone else's account.

// limit({ max, windowMs }) -> { isOver(key), add(key), take(key) }
//   isOver(key)  true once `key` has been added `max` times in the last windowMs
//   add(key)     counts one more for `key`
//   take(key)    counts one more and returns true, or returns false when `key`
//                is already over. Use this before any `await`: checking and
//                counting in one step means requests sent at the same moment
//                cannot all pass the check before any of them is counted.
function limit({ max, windowMs, maxKeys = 10000 }) {
  const hits = new Map(); // key -> times (ms), oldest first

  function recent(key, now) {
    const times = (hits.get(key) || []).filter((time) => now - time < windowMs);
    if (times.length) hits.set(key, times);
    else hits.delete(key);
    return times;
  }

  return {
    isOver(key, now = Date.now()) {
      return recent(key, now).length >= max;
    },
    add(key, now = Date.now()) {
      // Never let the memory grow without end: forget the oldest keys first
      if (!hits.has(key) && hits.size >= maxKeys) hits.delete(hits.keys().next().value);
      hits.set(key, [...recent(key, now), now]);
    },
    take(key, now = Date.now()) {
      if (this.isOver(key, now)) return false;
      this.add(key, now);
      return true;
    },
  };
}

// The address a request came from. On Vercel this is the visitor's address
// (Vercel sets x-forwarded-for); locally it is the computer's own.
function clientAddress(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || 'unknown';
}

module.exports = { limit, clientAddress };
