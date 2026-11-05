// A time limit for the database's requests. Supabase is reached over HTTP, and
// without a limit a request that stalls (a dropped network, a busy server)
// keeps the API waiting for minutes while the page shows "Loading…". With it,
// the call gives up and the request answers 500, which the page can show, and
// the user can try again.
//
// The limit is per attempt. supabase-js tries a read (GET) again up to 3 times
// after a failed attempt, waiting 1, 2 and then 4 seconds, and a fresh attempt
// on a new connection usually gets through. So a read that keeps stalling
// gives up after about 4 × 5 + 7 = 27 seconds, inside the page's 30-second
// limit (client/src/api.js); a write is never retried. The API runs next to
// the database (sin1), where a normal query takes well under a second.
const DB_TIMEOUT_MS = 5000;

// fetch with a time limit, for createClient's `global.fetch` (lib/db.js). A
// signal the caller already passed (supabase-js uses one to cancel) still
// works: the request stops at whichever comes first.
function fetchWithTimeout(ms = DB_TIMEOUT_MS, baseFetch = (...args) => fetch(...args)) {
  return (input, init = {}) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return baseFetch(input, { ...init, signal });
  };
}

module.exports = { DB_TIMEOUT_MS, fetchWithTimeout };
