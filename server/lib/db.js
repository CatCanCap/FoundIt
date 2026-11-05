// The one Supabase client for the server. Only models/ and scripts/seed.js
// should require this file.
require('./config');
const { createClient } = require('@supabase/supabase-js');
const { fetchWithTimeout } = require('./fetch-timeout');

// Every attempt gives up after 5 seconds instead of hanging (lib/fetch-timeout.js)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fetchWithTimeout() },
});

module.exports = supabase;
