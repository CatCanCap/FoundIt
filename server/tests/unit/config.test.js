import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('settings loading', () => {
  it('lets the settings file win over a value already set in the shell', () => {
    // A stray DB_TARGET=live in the shell must not relabel the database in config.env.example
    const output = execFileSync(process.execPath, ['-e', "require('./lib/config'); console.log(process.env.DB_TARGET)"], {
      cwd: serverDir,
      env: { ...process.env, ENV_FILE: 'config.env.example', DB_TARGET: 'live' },
      encoding: 'utf8',
    })
    expect(output.trim()).toBe('test')
  })
})
