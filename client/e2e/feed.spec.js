// Browsing, item record and map

import { test, expect } from '@playwright/test'
import {
  logIn,
  expectNoSideScroll,
  apiToken,
  apiLogIn,
  apiGet,
  apiPost,
  makeTag,
  cleanUp,
} from './helpers'

// The id in a tag's data-testid, "feed-card-42" → "42"
async function tagId(tag) {
  return (await tag.getAttribute('data-testid')).replace('feed-card-', '')
}

const tags = (page) => page.locator('button[data-testid^="feed-card-"]')

// The feed, records and map load from the shared test database, which can
// take several seconds a request, so waits for loading get longer than the
// usual 5 seconds
const LOAD = { timeout: 20 * 1000 }
test.describe.configure({ timeout: 90 * 1000 })

// Waits until the feed's first tag (or row) has loaded
async function feedLoaded(page) {
  await expect(page.locator('[data-testid^="feed-card-"]').first()).toBeVisible(LOAD)
}

test.describe('Finding things on the feed', () => {
  test('a category and a search narrow the feed, and survive a reload', async ({ page }) => {
    // (1) setup
    await logIn(page, 'chloe')
    await feedLoaded(page)
    await page.getByTestId('feed-type-found').click()
    await expectNoSideScroll(page)

    // (2) actions: umbrellas only
    await page.getByTestId('feed-family-umbrellas').click()

    // (3) assert: the chip is picked, and the page holds as many tags as its
    // count says (up to the 8 on a page)
    await expect(page.getByTestId('feed-family-umbrellas')).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/family=umbrellas/)
    const umbrellas = Number(
      (await page.getByTestId('feed-family-umbrellas').innerText()).match(/\d+/)[0],
    )
    expect(umbrellas).toBeGreaterThan(0)
    await expect(tags(page)).toHaveCount(Math.min(umbrellas, 8))

    // (2) actions: search within them
    await page.getByTestId('feed-search').fill('black')

    // (3) assert: fewer or the same, at least one, all in the address bar
    await expect(page).toHaveURL(/family=umbrellas.*q=black|q=black.*family=umbrellas/)
    const searched = await tags(page).count()
    expect(searched).toBeGreaterThan(0)
    expect(searched).toBeLessThanOrEqual(Math.min(umbrellas, 8))
    await expect(page.getByTestId('feed-count')).toBeVisible()

    // (2) actions
    await page.reload()
    await feedLoaded(page)

    // (3) assert: the same filters and the same tags
    await expect(page.getByTestId('feed-family-umbrellas')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('feed-search')).toHaveValue('black')
    await expect(tags(page)).toHaveCount(searched)
  })

  test('a search with no results says so, and clearing it brings the tags back', async ({
    page,
  }) => {
    // (1) setup
    await logIn(page, 'chloe')
    await feedLoaded(page)

    // (2) actions
    await page.getByTestId('feed-search').fill('zzqxj')

    // (3) assert: the empty state, and no tags
    await expect(page.getByTestId('feed-empty')).toBeVisible()
    await expect(tags(page)).toHaveCount(0)
    await expectNoSideScroll(page)

    // (2) actions
    await page.getByTestId('feed-clear').click()

    // (3) assert
    await expect(page.getByTestId('feed-empty')).toHaveCount(0)
    await expect(tags(page).first()).toBeVisible()
    await expect(page).not.toHaveURL(/q=/)
  })

  test('the page number stays in the address bar, and page 2 opens at its first row', async ({
    page,
  }) => {
    // (1) setup: signed out, on page 1
    await page.goto('/feed')
    await feedLoaded(page)
    const firstOnPage1 = await tagId(tags(page).first())

    // (2) actions
    await page.getByTestId('feed-pager').scrollIntoViewIfNeeded()
    await page.getByTestId('feed-page-next').click()

    // (3) assert: page 2, a different first tag, in view below the search
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByTestId('feed-page-where')).toContainText('Page 2 of')
    await expect(tags(page).first()).not.toHaveAttribute('data-testid', `feed-card-${firstOnPage1}`)
    await expect(tags(page).first()).toBeInViewport()
    // The page scrolls back smoothly, so this waits for the scroll to finish:
    // the first tag ends up below the search, which stays stuck to the top
    await expect
      .poll(async () => {
        const search = await page.getByTestId('feed-search').boundingBox()
        const first = await tags(page).first().boundingBox()
        return first.y - (search.y + search.height)
      }, LOAD)
      .toBeGreaterThanOrEqual(0)
    await expectNoSideScroll(page)

    // (2) actions
    await page.reload()

    // (3) assert: still page 2
    await expect(page.getByTestId('feed-page-where')).toContainText('Page 2 of', LOAD)

    // (2) actions
    await page.getByTestId('feed-page-prev').click()

    // (3) assert: back to page 1, and the page number leaves the address bar
    await expect(page).not.toHaveURL(/page=/)
    await expect(tags(page).first()).toHaveAttribute('data-testid', `feed-card-${firstOnPage1}`)
  })

  test('the list view opens a record in one click, and the grid comes back', async ({ page }) => {
    // (1) setup
    await logIn(page, 'chloe')
    await feedLoaded(page)

    // (2) actions
    await page.getByTestId('feed-view-list').click()

    // (3) assert: rows that are links
    await expect(page.getByTestId('feed-view-list')).toHaveAttribute('aria-pressed', 'true')
    const row = page.locator('a[data-testid^="feed-card-"]').first()
    await expect(row).toBeVisible()
    await expectNoSideScroll(page)
    const id = await tagId(row)

    // (2) actions
    await row.click()

    // (3) assert
    await expect(page).toHaveURL(new RegExp(`/items/${id}/record`))
    await expect(page.getByTestId('record-title')).toBeVisible(LOAD)

    // (2) actions: back to the feed, and the grid
    await page.goBack()
    await feedLoaded(page)
    await page.getByTestId('feed-view-tags').click()

    // (3) assert: tags again, which turn over instead of opening
    await expect(page.getByTestId('feed-view-tags')).toHaveAttribute('aria-pressed', 'true')
    await expect(tags(page).first()).toBeVisible()
  })
})

// Ben posts a find (tagged E2E-, so cleanUp takes it down) in a category that
// none of Chloe's open lost reports use, or count as related, and with no
// colours. Without the category the score is at most 30 (description,
// place and time), under the 50 a match needs. Returns the find's id.
async function postFindChloeCannotMatch(request) {
  const ben = await apiToken(request, 'ben')
  const { token: chloe, user } = await apiLogIn(request, 'chloe')
  const [categories, chloeLost] = await Promise.all([
    apiGet(request, '/categories', ben),
    apiGet(request, `/items?postedBy=${user.id}&type=lost&status=open`, chloe),
  ])
  const hers = new Set(chloeLost.map((item) => item.category))
  // Related either way round: hers lists it, or it lists hers
  const near = new Set(categories.filter((entry) => hers.has(entry.name)).flatMap((e) => e.related))
  const category = categories.find(
    (entry) =>
      !hers.has(entry.name) &&
      !near.has(entry.name) &&
      !entry.related.some((name) => hers.has(name)),
  )
  if (!category) throw new Error('Chloe has a lost report in every category')
  const tag = makeTag()
  const now = Date.now()
  const { item } = await apiPost(request, '/items', ben, {
    type: 'found',
    title: `Found ${category.name.toLowerCase()} ${tag}`,
    description: `Left behind, marked ${tag}`,
    category: category.name,
    colours: [],
    trail: [
      {
        spotId: 5,
        from: new Date(now - 3 * 3600 * 1000).toISOString(),
        to: new Date(now - 2 * 3600 * 1000).toISOString(),
      },
    ],
  })
  return item.id
}

test.describe('Tags and the item record', () => {
  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('signed out, a tag only leads to its record, which keeps the place private', async ({
    page,
  }) => {
    // (1) setup: signed out, a find's tag
    await page.goto('/feed')
    await feedLoaded(page)
    const tag = tags(page).first()
    const id = await tagId(tag)

    // (2) actions: turn it over
    await tag.click()

    // (3) assert: only "See full details", no question or other button
    await expect(tag).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId(`feed-back-details-${id}`)).toBeVisible()
    await expect(page.getByTestId(`feed-back-open-${id}`)).toHaveCount(0)

    // (2) actions
    await page.getByTestId(`feed-back-details-${id}`).click()

    // (3) assert: the record, with the place hidden and no claimer named
    await expect(page).toHaveURL(new RegExp(`/items/${id}/record`))
    await expect(page.getByTestId('record-title')).toBeVisible(LOAD)
    await expect(page.getByTestId('record-place-hidden')).toBeVisible()
    await expect(page.locator('main')).not.toContainText('Alice')
    await expectNoSideScroll(page)
  })

  test('the finder sees where their find was handed in; a signed-out visitor does not', async ({
    page,
    browser,
  }) => {
    // (1) setup: Ben, who found item 2
    await logIn(page, 'ben')

    // (2) actions
    await page.goto('/items/2/record')

    // (3) assert: Ben sees the place
    await expect(page.getByTestId('record-title')).toBeVisible(LOAD)
    await expect(page.getByTestId('record-place-hidden')).toHaveCount(0)

    // (2) actions: the same record in a signed-out browser
    const visitor = await browser.newContext()
    const visitorPage = await visitor.newPage()
    await visitorPage.goto('/items/2/record')

    // (3) assert
    await expect(visitorPage.getByTestId('record-title')).toBeVisible(LOAD)
    await expect(visitorPage.getByTestId('record-place-hidden')).toBeVisible()
    await visitor.close()
  })

  test('a student turns a tag with the keyboard, Esc turns it back, and its button leads on', async ({
    page,
    request,
  }) => {
    // (1) setup: Chloe, and an open find she has no match on, whose back asks
    // her to report it lost. Ben posts a fresh one in a category none of
    // Chloe's open lost reports use, so it cannot score 50 against them, and
    // it is the newest, so it is on the first page.
    const id = String(await postFindChloeCannotMatch(request))
    await logIn(page, 'chloe')
    await feedLoaded(page)
    const tag = page.getByTestId(`feed-card-${id}`)
    await expect(page.getByTestId(`feed-back-open-${id}`)).toHaveAttribute('href', '/report/lost')

    // (2) actions: turn it over with the keyboard
    await tag.focus()
    await page.keyboard.press('Enter')

    // (3) assert: turned, with the button and a quiet link to the record
    await expect(tag).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId(`feed-back-${id}`)).toBeVisible()
    await expect(page.getByTestId(`feed-back-open-${id}`)).toBeFocused()
    await expect(page.getByTestId(`feed-back-details-${id}`)).toHaveAttribute(
      'href',
      `/items/${id}/record`,
    )

    // (2) actions
    await page.keyboard.press('Escape')

    // (3) assert: turned back, focus on the front again
    await expect(tag).toHaveAttribute('aria-expanded', 'false')
    await expect(tag).toBeFocused()

    // (2) actions: turn it again and use the button
    await page.keyboard.press('Enter')
    await page.getByTestId(`feed-back-open-${id}`).click()

    // (3) assert
    await expect(page).toHaveURL(/\/report\/lost/)
    await expect(page.getByTestId('report-lost')).toBeVisible(LOAD)
  })
})

test.describe('The hotspot map', () => {
  test('the map loads, switches between found and lost, and filters by category', async ({
    page,
  }) => {
    // (1) setup
    await logIn(page, 'chloe')

    // (2) actions
    await page.goto('/map')

    // (3) assert: it opens on this week's finds, with no error
    await expect(page.getByTestId('map-page')).toBeVisible()
    await expect(page.getByTestId('map-side-found')).toBeVisible(LOAD)
    await expect(page.getByTestId('toggle-found')).toBeChecked()
    await expect(page.getByTestId('map-error')).toHaveCount(0)
    await expectNoSideScroll(page)

    // (2) actions: the lost side (the radio button is hidden inside its label)
    await page.getByTestId('toggle-lost').locator('xpath=..').click()

    // (3) assert: the lost panel with its rates
    await expect(page.getByTestId('toggle-lost')).toBeChecked()
    await expect(page.getByTestId('map-side-lost')).toBeVisible()
    await expect(page.getByTestId('map-side-found')).toHaveCount(0)
    await expect(page.getByTestId('map-rates')).toBeVisible(LOAD)

    // (2) actions: one category
    const family = page
      .locator('[data-testid^="map-family-"]:not([data-testid="map-family-all"])')
      .first()
    await family.click()

    // (3) assert: that category is picked, and the panel still shows
    await expect(family).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('map-family-all')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('map-side-lost')).toBeVisible()

    // (2) actions: every category again
    await page.getByTestId('map-family-all').click()

    // (3) assert
    await expect(page.getByTestId('map-family-all')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('map-rates')).toBeVisible(LOAD)
    await expect(page.getByTestId('map-error')).toHaveCount(0)
  })
})
