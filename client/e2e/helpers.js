// Shared steps for the end-to-end tests (Week 10c: Playwright).
//
// Each test follows the three stages from the lecture:
//   (1) setup:   put the app in the state the test needs
//   (2) actions: click and type like a user
//   (3) assert:  check what the user sees with expect()
//
// The tests run against the real API and the shared FoundIt-Test database,
// but they never seed or wipe it. Instead, every test posts its own fresh
// items with a unique tag in the title (see makeTag), so teammates keep
// their data. The setup stage posts those items and claims through the API,
// because the report forms upload photos and pick places on a map, which
// belong to other workstreams' tests. Everything the test is about is done
// through the pages, as a user would.
//
// Before running: start the API (cd server && npm run dev) and the app
// (cd client && npm run dev). E2E_API_URL points the setup at another API.
import process from 'node:process'
import { expect } from '@playwright/test'

export const API_URL = process.env.E2E_API_URL || 'http://localhost:8000/api'

// The demo accounts from the README. All four are email-verified.
export const ACCOUNTS = {
  alice: { name: 'Alice Tan', email: 'alice.tan.2024@scis.smu.edu.sg', password: 'FoundIt-demo-1' },
  ben: { name: 'Ben Lim', email: 'ben.lim.2024@business.smu.edu.sg', password: 'FoundIt-demo-2' },
  chloe: {
    name: 'Chloe Ng',
    email: 'chloe.ng.2025@economics.smu.edu.sg',
    password: 'FoundIt-demo-3',
  },
  admin: { name: 'FoundIt Admin', email: 'foundit.admin@smu.edu.sg', password: 'FoundIt-admin-1' },
}

// A short tag that makes this run's items easy to find (and unlike any other)
export function makeTag() {
  return `E2E-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
}

// A new SMU address for signing up, different every run. The e2e subdomain
// has no inboxes, so the code email the app sends reaches nobody.
export function newSmuEmail() {
  return `e2e.${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}@e2e.smu.edu.sg`
}

// The Singapore date a number of days ago, as a date box takes it: '2026-10-30'
export function singaporeDay(daysAgo = 0) {
  const day = new Date(Date.now() - daysAgo * 24 * 3600 * 1000)
  return day.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

// The page fits the screen: nothing spills off the side
export async function expectNoSideScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// ---- Through the pages ----

// Signs in on the login page, like a user. Admins land on /admin, students on the feed.
export async function logIn(page, who) {
  const account = ACCOUNTS[who]
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'SMU email' }).fill(account.email)
  await page.getByRole('textbox', { name: 'Password' }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(who === 'admin' ? /\/admin/ : /\/feed/)
}

// ---- Setup through the API ----

async function send(request, method, path, token, data) {
  const response = await request.fetch(`${API_URL}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data,
    // Fail with a clear message rather than using up the whole test's time
    timeout: 20 * 1000,
  })
  const text = await response.text()
  if (!response.ok()) {
    // An error is { error } from our API, or an HTML page from a proxy
    let message = text.slice(0, 200)
    try {
      message = JSON.parse(text).error
    } catch {
      // keep the raw text
    }
    throw new Error(`${method} ${path} answered ${response.status()}: ${message}`)
  }
  return text ? JSON.parse(text) : null
}

// { token, user }
export function apiLogIn(request, who) {
  const { email, password } = ACCOUNTS[who]
  return send(request, 'POST', '/auth/login', null, { email, password })
}

export async function apiToken(request, who) {
  return (await apiLogIn(request, who)).token
}

export function apiGet(request, path, token) {
  return send(request, 'GET', path, token)
}

export function apiPost(request, path, token, data = {}) {
  return send(request, 'POST', path, token, data)
}

// Posts a lost or found iPad at the same place and time as the other
// test items, so matching pairs them. Returns { item, matches }.
export function postItem(request, token, { type, tag, title, description }) {
  const now = Date.now()
  return apiPost(request, '/items', token, {
    type,
    title: title || `${type === 'found' ? 'Found' : 'Lost'} silver iPad ${tag}`,
    description: description || `Silver iPad with a ${tag} sticker`,
    category: 'Tablet',
    colours: ['Silver'],
    brand: `Apple ${tag}`,
    trail: [
      {
        spotId: 5,
        from: new Date(now - 3 * 3600 * 1000).toISOString(),
        to: new Date(now - 2 * 3600 * 1000).toISOString(),
      },
    ],
  })
}

// The usual starting point for a dispute: Ben found an iPad, Chloe reported
// losing one, and Alice reported losing one and claimed Ben's find. (Tablet
// is a category none of Chloe's seeded lost reports use, so the only one she
// has is the test's own.)
// Chloe's lost report is filed before the claim, so it is the one her
// dispute attaches. withChloeReport: false leaves her without one.
export async function makeClaimedFind(request, { withChloeReport = true } = {}) {
  const tag = makeTag()
  const [ben, alice, chloe] = await Promise.all([
    apiToken(request, 'ben'),
    apiToken(request, 'alice'),
    apiToken(request, 'chloe'),
  ])
  const found = (await postItem(request, ben, { type: 'found', tag })).item
  const chloeLost = withChloeReport
    ? (await postItem(request, chloe, { type: 'lost', tag, title: `Chloe's silver iPad ${tag}` }))
        .item
    : null
  const aliceLost = await postItem(request, alice, {
    type: 'lost',
    tag,
    title: `Alice's silver iPad ${tag}`,
  })
  const match = aliceLost.matches.find((entry) => entry.foundItemId === found.id)
  if (!match) throw new Error('Matching did not pair the two test iPads')
  await apiPost(request, `/claims/${match.id}`, alice, {
    detail: 'My initials AT are engraved on the back',
  })
  return { tag, found, chloeLost, aliceLost: aliceLost.item, matchId: match.id }
}

// Ben hands the find back to Alice and she confirms: the item is returned
export async function returnItem(request, matchId) {
  const [ben, alice] = [await apiToken(request, 'ben'), await apiToken(request, 'alice')]
  const handoff = await apiPost(request, '/handoffs', ben, { matchId, method: 'meetup', spotId: 5 })
  await apiPost(request, `/handoffs/${handoff.id}/handed-over`, ben)
  await apiPost(request, `/handoffs/${handoff.id}/confirm`, alice)
}

// An admin suspends Chloe through a report on one of her posts (lifted again
// by cleanUp)
export async function suspendChloe(request, chloesItemId) {
  const [alice, admin] = [await apiToken(request, 'alice'), await apiToken(request, 'admin')]
  const report = await apiPost(request, '/reports', alice, {
    itemId: chloesItemId,
    reason: 'Spam posts',
  })
  await apiPost(request, `/admin/reports/${report.id}/suspend`, admin, { reason: 'Posting spam' })
}

// Chloe disputes the find through the API (for tests about what happens next)
export async function chloeDisputes(request, foundId) {
  const chloe = await apiToken(request, 'chloe')
  return apiPost(request, '/disputes', chloe, {
    itemId: foundId,
    description: 'It has a scratch shaped like a C on the case and a cat sticker',
  })
}

// ---- Clean-up, so a failed test never leaves the shared database stuck ----

// Closes any dispute still open on a test item (a person may only have
// 3 open), dismisses any report still open on a test post or message (so the
// admin queue is not left full of them), lifts any suspension the test gave,
// and takes down every test item that is still open, from this run or an
// earlier one. Otherwise a test item left open would be attached to the next
// test's dispute, or matched in the next test's setup.
export async function cleanUp(request) {
  const admin = await apiToken(request, 'admin')
  const open = await apiGet(request, '/admin/disputes?status=open', admin)
  for (const dispute of open.filter((entry) => entry.item?.title?.includes('E2E-'))) {
    await apiPost(request, `/admin/disputes/${dispute.id}/close`, admin, {
      reason: 'Closed by the end-to-end test clean-up',
    })
  }
  const reports = await apiGet(request, '/admin/reports?status=open', admin)
  const isTest = (report) =>
    report.item?.title?.includes('E2E-') || report.message?.text?.includes('E2E-')
  for (const report of reports.filter(isTest)) {
    await apiPost(request, `/admin/reports/${report.id}/dismiss`, admin, {
      reason: 'Dismissed by the end-to-end test clean-up',
    })
  }
  const suspended = await apiGet(request, '/admin/users?status=suspended', admin)
  const demoEmails = Object.values(ACCOUNTS).map((account) => account.email)
  for (const person of suspended.filter((entry) => demoEmails.includes(entry.email))) {
    await apiPost(request, `/admin/users/${person.id}/unsuspend`, admin, {
      reason: 'Lifted by the end-to-end test clean-up',
    })
  }
  for (const who of ['alice', 'ben', 'chloe']) {
    const { token, user } = await apiLogIn(request, who)
    const items = await apiGet(request, `/items?postedBy=${user.id}&status=open&q=E2E`, token)
    for (const item of items.filter((entry) => entry.title.includes('E2E-'))) {
      await send(request, 'DELETE', `/items/${item.id}`, token)
    }
  }
}
