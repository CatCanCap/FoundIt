// Message.findLatestByMatches against a fake messages table that, like
// Supabase, never sends back more than 1000 rows per request. Every other
// table throws, so this file never touches the shared test database.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const supabase = require('../../lib/db')
const Message = require('../../models/message-model')

const HOUR = 60 * 60 * 1000
const at = (hoursAgo) => new Date(Date.UTC(2026, 10, 4, 12) - hoursAgo * HOUR).toISOString()

let messages = []
let requests = []
const originalFrom = supabase.from

// A query on the fake table: select, in, order and range, then await it
function fakeQuery() {
  const query = { columns: '*', filters: [], from: 0, to: Infinity }
  const builder = {
    select(columns = '*') {
      query.columns = columns
      return builder
    },
    in(column, values) {
      query.filters.push([column, new Set(values.map(Number))])
      return builder
    },
    order(column) {
      query.order = column
      return builder
    },
    range(from, to) {
      query.from = from
      query.to = to
      return builder
    },
    then(resolve, reject) {
      requests.push(query)
      let rows = messages.filter((row) => query.filters.every(([column, values]) => values.has(Number(row[column]))))
      if (query.order) rows = [...rows].sort((a, b) => a[query.order] - b[query.order])
      rows = rows.slice(query.from, Math.min(query.to + 1, query.from + 1000))
      if (query.columns !== '*') {
        const keep = query.columns.split(',').map((column) => column.trim())
        rows = rows.map((row) => Object.fromEntries(keep.map((column) => [column, row[column]])))
      }
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
    },
  }
  return builder
}

beforeAll(() => {
  supabase.from = (table) => {
    if (table !== 'messages') throw new Error('The database must not be used in unit tests')
    return fakeQuery()
  }
})

afterAll(() => {
  supabase.from = originalFrom
})

beforeEach(() => {
  messages = []
  requests = []
})

function message(id, matchId, hoursAgo, extra = {}) {
  return { id, match_id: matchId, sender_id: 1, text: `Message ${id}`, sent_at: at(hoursAgo), removed_at: null, ...extra }
}

describe('Message.findLatestByMatches', () => {
  it('returns the newest message of each chat and leaves out chats with none', async () => {
    messages = [message(1, 10, 5), message(2, 10, 1), message(3, 11, 3), message(4, 10, 2)]
    const latest = await Message.findLatestByMatches([10, 11, 12])
    expect([...latest.keys()].sort()).toEqual([10, 11])
    expect(latest.get(10)).toMatchObject({ id: 2, matchId: 10, text: 'Message 2' })
    expect(latest.get(11)).toMatchObject({ id: 3 })
  })

  it('uses the time a message was sent, not its id, and the id only to break a tie', async () => {
    messages = [message(1, 10, 1), message(2, 10, 4), message(3, 11, 2), message(4, 11, 2)]
    const latest = await Message.findLatestByMatches([10, 11])
    expect(latest.get(10).id).toBe(1)
    expect(latest.get(11).id).toBe(4)
  })

  it('stays a few requests however many chats there are', async () => {
    messages = Array.from({ length: 141 }, (_, i) => message(i + 1, i + 1, 1))
    const latest = await Message.findLatestByMatches(messages.map((row) => row.match_id))
    expect(latest.size).toBe(141)
    // One for the ids and times, one for the newest rows: not one per chat
    expect(requests).toHaveLength(2)
  })

  it('still finds the newest message of a chat past the first 1000 rows', async () => {
    messages = Array.from({ length: 1500 }, (_, i) => message(i + 1, 10, 3000 - i))
    messages.push(message(1501, 11, 5000))
    const latest = await Message.findLatestByMatches([10, 11])
    expect(latest.get(10).id).toBe(1500)
    expect(latest.get(11).id).toBe(1501)
  })

  it('hides the text of a removed message, as the rest of the chat does', async () => {
    messages = [message(1, 10, 1, { removed_at: at(0) })]
    const latest = await Message.findLatestByMatches([10])
    expect(latest.get(10).text).toBe('')
  })

  it('asks nothing for an empty list', async () => {
    expect((await Message.findLatestByMatches([])).size).toBe(0)
    expect(requests).toHaveLength(0)
  })
})
