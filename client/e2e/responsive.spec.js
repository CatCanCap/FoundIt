// Responsive layout: every page at the sizes the graders check
//
// The IS216 briefing (FAQ 17) says the layout is checked in Chrome's DevTools
// from the iPhone 6 (375px) up to Bootstrap's XL breakpoint (1200px), and the
// top band asks for the right scaling in "different screen sizes and
// orientations". So every page is opened at each size in layout-helpers.js
// (SIZES), plus a phone on its side, and must:
//   - have exactly one page title (h1), showing
//   - fit the screen: nothing sticks out past the right edge
// The header must switch to the Menu button below lg, and every page must
// still fit in night mode on a phone.
//
// These tests only open pages and look. What each page does is tested in the
// other spec files.
/* eslint playwright/expect-expect: ["warn", { "assertFunctionNames": ["expectFits", "expectOneTitle"] }] */
import { test, expect } from '@playwright/test'
import { apiToken, apiPost, makeClaimedFind, chloeDisputes, cleanUp } from './helpers'
import {
  SIZES,
  PHONE,
  LG,
  signInFast,
  openPage,
  expectOneTitle,
  expectFits,
} from './layout-helpers'

// Graders use Chrome, and the layout does not change between browsers, so
// these run once, in Chromium
// eslint-disable-next-line playwright/no-skipped-test -- skipped on purpose outside Chromium
test.skip(({ browserName }) => browserName !== 'chromium', 'The layout is graded in Chrome')

test.describe.configure({ timeout: 90 * 1000 })

// who: the demo account that can open the page (null = signed out)
const PAGES = [
  { path: '/', who: null },
  { path: '/login', who: null },
  { path: '/register', who: null },
  { path: '/forgot-password', who: null },
  { path: '/feed', who: 'alice' },
  { path: '/map', who: 'alice' },
  { path: '/report', who: 'alice' },
  { path: '/report/found', who: 'ben' },
  { path: '/report/lost', who: 'alice' },
  { path: '/matches', who: 'alice' },
  { path: '/returns', who: 'alice' },
  { path: '/profile', who: 'alice' },
  { path: '/disputes', who: 'alice' },
  { path: '/items/2/record', who: 'alice' },
  { path: '/admin', who: 'admin' },
  { path: '/this-does-not-exist', who: 'alice' },
]

for (const size of SIZES) {
  test.describe(`${size.name} (${size.width}×${size.height})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    for (const { path, who } of PAGES) {
      test(`${path} fits the screen`, async ({ page, request }) => {
        // (1) setup
        await signInFast(page, request, who)

        // (2) actions
        await openPage(page, path)

        // (3) assert
        await expectOneTitle(page)
        await expectFits(page)
      })
    }

    test(`the header shows ${size.width < LG ? 'the Menu button' : 'its links'}`, async ({
      page,
      request,
    }) => {
      // (1) setup
      await signInFast(page, request, 'alice')

      // (2) actions
      await openPage(page, '/feed')

      // (3) assert: below lg the links fold behind Menu; from lg they are in the bar
      const folded = size.width < LG
      const header = page.getByTestId('app-header')
      await expect(header.locator('button[aria-controls="fi-header-nav"]')).toBeVisible({
        visible: folded,
      })
      await expect(header.getByRole('link', { name: /^Map\b/ })).toBeVisible({ visible: !folded })
      await expect(page.getByTestId('theme-toggle')).toBeVisible({ visible: !folded })
    })
  })
}

test.describe('Night mode on a phone', () => {
  test.use({ viewport: PHONE })

  for (const { path, who } of PAGES) {
    test(`${path} fits the screen in night mode`, async ({ page, request }) => {
      // (1) setup: night mode was picked on an earlier visit
      await page.addInitScript(() => window.localStorage.setItem('foundit-theme', 'night'))
      await signInFast(page, request, who)

      // (2) actions
      await openPage(page, path)

      // (3) assert
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
      await expectFits(page)
    })
  }
})

// Pages that only exist for a claim, a dispute or a report. The setup makes
// one of each through the API (the same way disputes.spec.js does), and
// cleanUp takes it all down again at the end.
test.describe('Pages that need a claim, a dispute or a report', () => {
  let setup

  test.beforeAll(async ({ request }) => {
    test.setTimeout(120 * 1000)
    const claimed = await makeClaimedFind(request)
    const dispute = await chloeDisputes(request, claimed.found.id)
    const alice = await apiToken(request, 'alice')
    const report = await apiPost(request, '/reports', alice, {
      itemId: claimed.chloeLost.id,
      reason: `Layout check ${claimed.tag}`,
    })
    setup = { ...claimed, disputeId: dispute.id, reportId: report.id }
  })

  test.afterAll(async ({ request }) => {
    await cleanUp(request)
  })

  // path is worked out from the setup once it has run
  const CASES = [
    {
      name: 'possible finds for a lost report',
      who: 'alice',
      path: (s) => `/matches/finds/${s.aliceLost.id}`,
    },
    { name: 'the handoff chat', who: 'alice', path: (s) => `/matches/${s.matchId}/handoff` },
    {
      name: 'a claimed find’s item page',
      who: 'alice',
      path: (s) => `/items/${s.found.id}/record`,
    },
    { name: 'the dispute form', who: 'chloe', path: (s) => `/items/${s.found.id}/dispute` },
    {
      name: 'an admin’s dispute case',
      who: 'admin',
      path: (s) => `/admin/disputes/${s.disputeId}`,
    },
    { name: 'an admin’s reported post', who: 'admin', path: (s) => `/admin/reports/${s.reportId}` },
  ]

  for (const size of SIZES) {
    for (const { name, who, path } of CASES) {
      test(`${name} fits at ${size.name} (${size.width}×${size.height})`, async ({
        page,
        request,
      }) => {
        // (1) setup
        await page.setViewportSize({ width: size.width, height: size.height })
        await signInFast(page, request, who)

        // (2) actions
        await openPage(page, path(setup))

        // (3) assert
        await expectOneTitle(page)
        await expectFits(page)
      })
    }
  }
})
