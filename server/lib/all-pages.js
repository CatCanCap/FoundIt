// Supabase sends back at most 1000 rows per request, and says nothing when it
// stops there. For lists that can grow past that (open items for matching,
// the hotspot figures, a long chat), this asks page by page until a page
// comes back short, so nothing is silently left out.
//
// makeQuery() must build a fresh query each time it is called, with an
// order that never changes between pages (end with .order('id')).
const { unwrap } = require('./errors');

const PAGE_SIZE = 1000;

async function allPages(makeQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = unwrap(await makeQuery().range(from, from + PAGE_SIZE - 1));
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

module.exports = { allPages, PAGE_SIZE };
