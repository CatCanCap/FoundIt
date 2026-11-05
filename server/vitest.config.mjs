import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/global-setup.mjs',
    // API tests share one database, so run one file at a time
    fileParallelism: false,
    // The API tests post the same made-up report many times on purpose, so the
    // check for a report sent twice (lib/same-report.js) is off unless a test
    // turns it on
    //
    // SUPABASE_URL and SUPABASE_SECRET_KEY are placeholders so the unit tests
    // also run on a fresh copy with no config.env: lib/db.js builds its client
    // when it loads, and the unit tests mock every query. A real config.env
    // replaces both (lib/config.js loads it with override), and with no file
    // DB_TARGET stays unset, so the API tests refuse to touch anything.
    env: {
      REPEAT_WINDOW_SECONDS: '0',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SECRET_KEY: 'unit-test-placeholder',
    },
    testTimeout: 20000,
    hookTimeout: 60000,
  },
})
