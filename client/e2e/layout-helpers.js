// Shared steps for the layout tests (cross-page.spec.js and responsive.spec.js).
//
// These tests check what every page has in common (the header, menu, footer,
// titles, night mode) and that every page fits the screen. They never submit a
// form: posting, claiming, signing in and page access have their own tests.
// So signing in here is setup only, done through the API instead of the form.
import { expect } from '@playwright/test'
import { apiToken } from './helpers'

// The graders check the layout in Chrome's DevTools, from the iPhone 6 up to
// Bootstrap's XL breakpoint (IS216 project briefing, FAQ 17). 991 and 992 sit
// on either side of lg, where the header folds its links into the Menu button.
export const SIZES = [
  { name: 'iPhone 6', width: 375, height: 667 },
  { name: 'phone on its side', width: 667, height: 375 },
  { name: 'sm', width: 576, height: 800 },
  { name: 'md', width: 768, height: 1024 },
  { name: 'just under lg', width: 991, height: 800 },
  { name: 'lg', width: 992, height: 800 },
  { name: 'xl', width: 1200, height: 900 },
]

export const PHONE = { width: 375, height: 667 }
export const DESKTOP = { width: 1200, height: 900 }

// The header folds into the Menu button below this width (Bootstrap's lg)
export const LG = 992

// Pages load from the shared test database, which can take several seconds
export const LOAD = { timeout: 20 * 1000 }

// Where the app keeps the sign-in token (TOKEN_KEY in src/api.js)
const TOKEN_KEY = 'foundit_token'

// One API sign-in per demo account per run, not one per test
const tokens = new Map()

// Opens the next pages as a demo account, without going through the sign-in
// form. who: 'alice', 'ben', 'chloe', 'admin', or null to stay signed out.
export async function signInFast(page, request, who) {
  if (!who) return
  if (!tokens.has(who)) tokens.set(who, await apiToken(request, who))
  await page.addInitScript(
    ([key, token]) => window.localStorage.setItem(key, token),
    [TOKEN_KEY, tokens.get(who)],
  )
}

// Opens a page and waits until it has finished loading: a page title (h1) is
// showing and the grey loading blocks (ui/PageSkeleton.vue) are gone
export async function openPage(page, path) {
  await page.goto(path)
  await expect(page.locator('h1').first()).toBeVisible(LOAD)
  await expect(page.locator('.page-skeleton')).toHaveCount(0, LOAD)
}

// Each page has exactly one page title (h1), for screen readers and the
// design system's rule "one <h1> per page"
export async function expectOneTitle(page) {
  await expect(page.locator('h1'), 'one page title (h1) on the page').toHaveCount(1)
}

// The page fits the screen: nothing spills off the side. When something does,
// the failure lists up to 10 of the innermost elements past the right edge, as
// leads for the page's owner: the cause is usually one of them, or the
// element just after them (a fixed width, a long word, a wide picture).
export async function expectFits(page) {
  const culprits = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth <= width) return []
    const describe = (element) => {
      if (element.dataset.testid) return `[data-testid="${element.dataset.testid}"]`
      const classes = typeof element.className === 'string' ? element.className.trim() : ''
      return element.tagName.toLowerCase() + (classes ? `.${classes.split(/\s+/).join('.')}` : '')
    }
    const all = [...document.body.querySelectorAll('*')]
    const innermost = (test) =>
      all.filter((element) => test(element) && ![...element.children].some(test))
    // Usually one thing is simply wider than the window: name that first
    const tooWide = (element) => element.getBoundingClientRect().width > width + 1
    // Otherwise, whatever reaches past the right edge
    const sticksOut = (element) => {
      const box = element.getBoundingClientRect()
      return box.width > 0 && box.right > width + 1
    }
    const found = innermost(tooWide)
    return (found.length ? found : innermost(sticksOut)).slice(0, 10).map(describe)
  })
  expect(culprits, 'The page scrolls sideways. These elements reach past the right edge').toEqual(
    [],
  )
}
