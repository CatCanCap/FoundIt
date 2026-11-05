// Runs once around the whole test run. API tests empty the shared test
// database, so put the seed data back afterwards for everyone else.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

export default function setup() {
  return async function teardown() {
    // `npm run test:unit` touches no database, so there is nothing to restore
    const unitOnly = process.argv.some((argument) => argument.includes('tests/unit'))
    if (unitOnly) return

    require('../lib/config')
    if (process.env.DB_TARGET !== 'test') return
    const { seedDatabase } = require('../scripts/seed')
    await seedDatabase({ withMatches: true })
  }
}
