// Cross-page checks: what every page shares
//
// The header and its links, the phone menu, page titles, the footer, the skip
// link, night mode, "back to top", the page for a wrong address, and the
// browser's back and forward buttons. Each test moves across several pages.
//
// Nothing here submits a form or checks who may open a page: those are in
// accounts, report, feed, disputes, reports and admin.spec.js. Signing in is
// setup only (signInFast in layout-helpers.js).
import { test, expect } from '@playwright/test'
import { signInFast, openPage, PHONE, DESKTOP, LOAD } from './layout-helpers'

test.describe.configure({ timeout: 90 * 1000 })

const header = (page) => page.getByTestId('app-header')

// A link in the header's main navigation. Its name can end with a badge
// ("Matches 2 new"), so only the start of the name is matched.
const navLink = (page, name) =>
  header(page)
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: new RegExp(`^${name}\\b`) })

// The phone's Menu button (it says "Close" while the menu is open)
const menuButton = (page) => header(page).locator('button[aria-controls="fi-header-nav"]')

// The address is this page, with or without a ?query after it
const atPage = (path) => new RegExp(`${path}(\\?|$)`)

const STUDENT_LINKS = [
  ['Feed', '/feed'],
  ['Matches', '/matches'],
  ['Map', '/map'],
  ['Returns', '/returns'],
]

test.describe('The header on a computer', () => {
  test.use({ viewport: DESKTOP })

  test('each link opens its page, and only that link is marked as the current page', async ({
    page,
    request,
  }) => {
    // (1) setup
    await signInFast(page, request, 'alice')
    await openPage(page, '/feed')

    for (const [name, path] of [...STUDENT_LINKS.slice(1), STUDENT_LINKS[0]]) {
      // (2) actions
      await navLink(page, name).click()

      // (3) assert: on that page, and its link (and no other) is the current one
      await expect(page).toHaveURL(atPage(path), LOAD)
      await expect(navLink(page, name)).toHaveAttribute('aria-current', 'page')
      for (const [other] of STUDENT_LINKS.filter(([label]) => label !== name)) {
        await expect(navLink(page, other)).not.toHaveAttribute('aria-current', 'page')
      }
    }
  })

  test('searching from the header on another page opens the feed with that search', async ({
    page,
    request,
  }) => {
    // (1) setup
    await signInFast(page, request, 'alice')
    await openPage(page, '/map')

    // (2) actions
    await page.getByTestId('header-search').fill('umbrella')
    await page.getByTestId('header-search').press('Enter')

    // (3) assert: on the feed with the search in the address (what it finds is
    // feed.spec.js's job), and the header's box gives way to the feed's own
    await expect(page).toHaveURL(/\/feed\?(.*&)?q=umbrella/, LOAD)
    await expect(page.getByTestId('header-search')).toHaveCount(0)
  })

  test('"Report an item" works from any page, and hides on the report pages', async ({
    page,
    request,
  }) => {
    // (1) setup
    await signInFast(page, request, 'alice')

    for (const from of ['/matches', '/map', '/profile']) {
      // (2) actions
      await openPage(page, from)
      await page.getByTestId('header-report').click()

      // (3) assert
      await expect(page).toHaveURL(atPage('/report'), LOAD)
      await expect(page.getByTestId('header-report')).toHaveCount(0)
    }
  })

  test('an admin’s header has only the Admin link, with no search or report button', async ({
    page,
    request,
  }) => {
    // (1) setup
    await signInFast(page, request, 'admin')

    // (2) actions
    await openPage(page, '/admin')

    // (3) assert
    await expect(navLink(page, 'Admin')).toHaveAttribute('aria-current', 'page')
    for (const [name] of STUDENT_LINKS) {
      await expect(navLink(page, name)).toHaveCount(0)
    }
    await expect(page.getByTestId('header-search')).toHaveCount(0)
    await expect(page.getByTestId('header-report')).toHaveCount(0)
  })
})

test.describe('The menu on a phone', () => {
  test.use({ viewport: PHONE })

  test('the Menu button opens the links, a link moves to its page, and the menu closes', async ({
    page,
    request,
  }) => {
    // (1) setup
    await signInFast(page, request, 'alice')
    await openPage(page, '/feed')
    await expect(navLink(page, 'Map')).toBeHidden()

    // (2) actions
    await menuButton(page).click()

    // (3) assert: open, with the links showing
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(menuButton(page)).toContainText('Close')
    await expect(navLink(page, 'Map')).toBeVisible()

    // (2) actions
    await navLink(page, 'Map').click()

    // (3) assert: on the map, with the menu folded away again
    await expect(page).toHaveURL(atPage('/map'), LOAD)
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(menuButton(page)).toContainText('Menu')
    await expect(navLink(page, 'Map')).toBeHidden()
  })

  test('Esc closes the menu and puts the focus back on the Menu button', async ({
    page,
    request,
  }) => {
    // (1) setup
    await signInFast(page, request, 'alice')
    await openPage(page, '/matches')
    await menuButton(page).click()
    await expect(navLink(page, 'Feed')).toBeVisible()

    // (2) actions
    await page.keyboard.press('Escape')

    // (3) assert
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(navLink(page, 'Feed')).toBeHidden()
    await expect(menuButton(page)).toBeFocused()
  })

  test('the night mode switch in the menu works, and stays on across pages', async ({ page }) => {
    // (1) setup: signed out, which shows the same switch
    await openPage(page, '/feed')
    await menuButton(page).click()

    // (2) actions
    await page.getByRole('switch', { name: 'Night mode' }).check()

    // (3) assert
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')

    // (2) actions: another page
    await openPage(page, '/map')

    // (3) assert
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  })
})

test.describe('On every page', () => {
  test.use({ viewport: DESKTOP })

  // Each page's browser tab title (meta.title in src/router/index.js)
  const TITLES = [
    { path: '/', who: null, title: 'FoundIt' },
    { path: '/login', who: null, title: 'Sign in · FoundIt' },
    { path: '/register', who: null, title: 'Create an account · FoundIt' },
    { path: '/forgot-password', who: null, title: 'Forgot password · FoundIt' },
    { path: '/this-does-not-exist', who: null, title: 'Page not found · FoundIt' },
    { path: '/feed', who: 'alice', title: 'Feed · FoundIt' },
    { path: '/map', who: 'alice', title: 'Map · FoundIt' },
    { path: '/matches', who: 'alice', title: 'Matches · FoundIt' },
    { path: '/returns', who: 'alice', title: 'Returns · FoundIt' },
    { path: '/report', who: 'alice', title: 'Report · FoundIt' },
    { path: '/report/found', who: 'alice', title: 'Report a found item · FoundIt' },
    { path: '/report/lost', who: 'alice', title: 'Report a lost item · FoundIt' },
    { path: '/profile', who: 'alice', title: 'Profile · FoundIt' },
    { path: '/disputes', who: 'alice', title: 'My disputes · FoundIt' },
    { path: '/items/2/record', who: 'alice', title: 'Item · FoundIt' },
    { path: '/admin', who: 'admin', title: 'Admin · FoundIt' },
  ]

  for (const { path, who, title } of TITLES) {
    test(`${path} has the tab title "${title}"`, async ({ page, request }) => {
      // (1) setup
      await signInFast(page, request, who)

      // (2) actions
      await openPage(page, path)

      // (3) assert
      await expect(page).toHaveTitle(title)
    })
  }

  test('every page inside the app has the header and the footer', async ({ page, request }) => {
    // (1) setup
    await signInFast(page, request, 'alice')

    for (const path of [
      '/feed',
      '/map',
      '/matches',
      '/returns',
      '/report',
      '/report/lost',
      '/profile',
      '/disputes',
      '/items/2/record',
      '/this-does-not-exist',
    ]) {
      // (2) actions
      await openPage(page, path)

      // (3) assert
      await expect(header(page), `header on ${path}`).toBeVisible()
      await expect(page.getByTestId('app-footer'), `footer on ${path}`).toBeVisible()
    }
  })

  test('"Skip to content" is the first thing the keyboard reaches, and jumps to the page', async ({
    page,
    browserName,
  }) => {
    // (1) setup
    await openPage(page, '/feed')

    // (2) actions: Safari's Tab skips links unless Option is held (its
    // default setting), so a Safari user presses Option+Tab
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

    // (3) assert: shown once it has the focus
    await expect(page.getByTestId('skip-link')).toBeFocused()
    await expect(page.getByTestId('skip-link')).toBeVisible()

    // (2) actions
    await page.keyboard.press('Enter')

    // (3) assert: the focus moved past the header to the page itself
    await expect(page.locator('main').first()).toBeFocused()
  })

  test('night mode stays on across pages and after a reload, and turns off again', async ({
    page,
  }) => {
    // (1) setup
    await openPage(page, '/feed')
    const toggle = page.getByTestId('theme-toggle')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'night')

    // (2) actions
    await toggle.click()

    // (3) assert
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    // (2) actions: move to another page through the header, then reload
    await navLink(page, 'Map').click()
    await expect(page).toHaveURL(atPage('/map'), LOAD)

    // (3) assert
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'true')

    // (2) actions
    await page.getByTestId('theme-toggle').click()

    // (3) assert
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'night')
  })

  test('"Back to top" shows after scrolling down a long page and goes back up', async ({
    page,
  }) => {
    // (1) setup: a phone screen, so the feed is several screens long
    await page.setViewportSize(PHONE)
    await openPage(page, '/feed')
    await expect(page.locator('[data-testid^="feed-card-"]').first()).toBeVisible(LOAD)
    await expect(page.getByTestId('back-to-top')).toHaveCount(0)

    // (2) actions
    await page.getByTestId('app-footer').scrollIntoViewIfNeeded()

    // (3) assert
    await expect(page.getByTestId('back-to-top')).toBeVisible()

    // (2) actions
    await page.getByTestId('back-to-top').click()

    // (3) assert: back at the top (it scrolls smoothly, so wait for it)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await expect(page.getByTestId('back-to-top')).toHaveCount(0)
  })

  test('a wrong address shows the not-found page, which leads back to the feed', async ({
    page,
  }) => {
    // (1) setup and (2) actions
    await openPage(page, '/this-does-not-exist')

    // (3) assert
    await expect(page.getByTestId('not-found')).toBeVisible()
    await expect(page.getByTestId('not-found')).toContainText('/this-does-not-exist')

    // (2) actions
    await page.getByTestId('not-found-feed').click()

    // (3) assert
    await expect(page).toHaveURL(atPage('/feed'), LOAD)
  })

  test('the browser’s back and forward buttons move between pages and keep the header right', async ({
    page,
    request,
  }) => {
    // (1) setup: three pages, through the header
    await signInFast(page, request, 'alice')
    await openPage(page, '/feed')
    await navLink(page, 'Map').click()
    await expect(page).toHaveURL(atPage('/map'), LOAD)
    await navLink(page, 'Matches').click()
    await expect(page).toHaveURL(atPage('/matches'), LOAD)

    // (2) actions
    await page.goBack()

    // (3) assert
    await expect(page).toHaveURL(atPage('/map'), LOAD)
    await expect(navLink(page, 'Map')).toHaveAttribute('aria-current', 'page')

    // (2) actions
    await page.goBack()

    // (3) assert
    await expect(page).toHaveURL(atPage('/feed'), LOAD)
    await expect(navLink(page, 'Feed')).toHaveAttribute('aria-current', 'page')

    // (2) actions
    await page.goForward()

    // (3) assert
    await expect(page).toHaveURL(atPage('/map'), LOAD)
    await expect(navLink(page, 'Map')).toHaveAttribute('aria-current', 'page')
    await expect(header(page)).toBeVisible()
  })
})
