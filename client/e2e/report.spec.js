// Reporting items
// Reporting a post or a chat message to an admin is a different feature, in reports.spec.js.
//
// The photo is skipped as Cloudinary is out of scope. Places are picked from
// the drop-downs rather than the map, which needs Mapbox to load.
import { test, expect } from '@playwright/test'
import { logIn, makeTag, cleanUp, singaporeDay, expectNoSideScroll } from './helpers'

// Posting and loading go to the shared test database, which can take several
// seconds a request, so waits for them get longer than the usual 5 seconds
const LOAD = { timeout: 20 * 1000 }
test.describe.configure({ timeout: 90 * 1000 })

test.afterAll(async ({ request }) => {
  await cleanUp(request)
})

// Opens /report and picks found or lost
async function startReport(page, kind) {
  await page.goto('/report')
  await page.getByTestId(`choose-${kind}`).click()
  await expect(page.getByTestId(`report-${kind}`)).toBeVisible(LOAD)
}

// The found report's photo step shows only when photo upload is set up
async function skipFoundPhoto(page) {
  await expect(
    page.getByTestId('report-category').or(page.getByTestId('report-photo')),
  ).toBeVisible(LOAD)
  if (await page.getByTestId('report-photo').isVisible()) {
    await page.getByTestId('report-next').click()
  }
  await expect(page.getByTestId('report-category')).toBeVisible(LOAD)
}

// Fills the lost report's details and goes on to the trail
async function lostDetailsThenTrail(page, title) {
  await page.getByTestId('lost-category').selectOption('Tablet')
  await page.getByTestId('lost-title').fill(title)
  await page.getByTestId('lost-description').fill('Silver tablet in a grey keyboard case')
  await page.getByTestId('lost-next').click()
  // The photo step shows only when photo upload is set up
  const trail = page.getByTestId('lost-date')
  if (!(await trail.isVisible())) await page.getByTestId('lost-next').click()
  await expect(trail).toBeVisible(LOAD)
}

// Adds a stop from the "Add a building" list and picks where in it
async function addStop(page, number, buildingIndex) {
  await page.getByTestId('lost-add-stop').click()
  await page.getByTestId('lost-add-building').selectOption({ index: buildingIndex })
  const spot = page.getByTestId(`lost-stop-spot-${number}`)
  await expect(spot).toBeVisible()
  if (!(await spot.inputValue())) await spot.selectOption({ index: 1 })
}

// Picks the first building, then its first level and facility (a building or
// level with only one is picked by the form already)
async function pickFoundPlace(page) {
  await page.getByTestId('report-building').selectOption({ index: 1 })
  for (const field of ['report-level', 'report-facility']) {
    const select = page.getByTestId(field)
    await expect(select).toBeEnabled()
    if (!(await select.inputValue())) await select.selectOption({ index: 1 })
  }
}

test.describe('Reporting a found item', () => {
  test('a finder posts a found item, opens its record and finds it on the feed', async ({
    page,
  }) => {
    // (1) setup
    const title = `Found silver tablet ${makeTag()}`
    await logIn(page, 'ben')

    // (2) actions: the details
    await startReport(page, 'found')
    await expectNoSideScroll(page)
    await skipFoundPhoto(page)
    await page.getByTestId('report-category').selectOption('Tablet')
    await page.getByTestId('report-title').fill(title)
    // The colour's checkbox is hidden inside its swatch, so the swatch is clicked
    await page.getByTestId('report-colour-Silver').locator('xpath=..').click()
    await expect(page.getByTestId('report-colour-Silver')).toBeChecked()
    await page.getByTestId('report-brand').fill('Apple')
    await page.getByTestId('report-description').fill('Silver tablet in a grey keyboard case')
    await page.getByTestId('report-next').click()

    // (2) actions: where and when (today's date and time are filled in already)
    await pickFoundPlace(page)
    await expectNoSideScroll(page)
    await page.getByTestId('report-submit').click()

    // (3) assert: posted, with a line about possible owners
    await expect(page.getByTestId('report-success')).toBeVisible(LOAD)
    await expect(
      page.getByTestId('report-matches').or(page.getByTestId('report-no-matches')),
    ).toBeVisible()

    // (2) actions: open the new item's record
    await page.getByTestId('report-view-record').click()

    // (3) assert
    await expect(page).toHaveURL(/\/items\/\d+\/record/)
    await expect(page.getByTestId('record-title')).toHaveText(title, LOAD)

    // (2) actions: look for it on the feed
    await page.goto('/feed')
    await page.getByTestId('feed-search').fill(title)

    // (3) assert: exactly one tag, and it is this item
    await expect(page.getByTestId('feed-card-title')).toHaveCount(1, LOAD)
    await expect(page.getByTestId('feed-card-title')).toHaveText(title)
  })

  test('a found report with no category is refused on the details step', async ({ page }) => {
    // (1) setup
    await logIn(page, 'ben')
    await startReport(page, 'found')
    await skipFoundPhoto(page)

    // (2) actions: a name but no category
    await page.getByTestId('report-title').fill(`Something ${makeTag()}`)
    await page.getByTestId('report-next').click()

    // (3) assert: an error, still on the details step
    await expect(page.getByTestId('report-error')).toBeVisible()
    await expect(page.getByTestId('report-category')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('report-category')).toBeVisible()
    await expect(page.getByTestId('report-building')).toHaveCount(0)
  })
})

test.describe('Reporting a lost item', () => {
  test('an owner posts a lost item with a two-place trail', async ({ page }) => {
    // (1) setup
    const title = `Lost silver tablet ${makeTag()}`
    await logIn(page, 'alice')

    // (2) actions: details, then the trail for yesterday
    await startReport(page, 'lost')
    await expectNoSideScroll(page)
    await lostDetailsThenTrail(page, title)
    await page.getByTestId('lost-date').fill(singaporeDay(1))
    await addStop(page, 1, 1)
    await page.getByTestId('lost-stop-start-1').fill('09:00')
    await page.getByTestId('lost-stop-end-1').fill('10:00')
    await addStop(page, 2, 2)
    await page.getByTestId('lost-stop-start-2').fill('11:00')
    await page.getByTestId('lost-stop-end-2').fill('12:00')

    // (3) assert: two places on the trail
    await expect(page.getByTestId('lost-trail').locator('> li')).toHaveCount(2)
    await expectNoSideScroll(page)

    // (2) actions: on to the last step, and post
    await page.getByTestId('lost-next').click()
    await page.getByTestId('lost-post').click()

    // (3) assert: posted, with a link to Matches
    await expect(page.getByTestId('lost-posted')).toBeVisible(LOAD)
    await expect(page.getByTestId('lost-posted')).toContainText(title)
    await expect(page.getByTestId('lost-posted-matches')).toBeVisible()
    await page.getByTestId('lost-see-matches').click()
    await expect(page).toHaveURL(/\/matches/)
  })

  test('a lost report with no place cannot go past the trail', async ({ page }) => {
    // (1) setup
    await logIn(page, 'alice')
    await startReport(page, 'lost')

    // (2) actions: the details, then no building on the trail
    await lostDetailsThenTrail(page, `Lost silver tablet ${makeTag()}`)

    // (3) assert: the button is off, and nothing is posted
    await expect(page.getByTestId('lost-next')).toBeDisabled()
    await expect(page.getByTestId('lost-post')).toHaveCount(0)
    await expect(page.getByTestId('lost-posted')).toHaveCount(0)
  })

  test('a trail stops at 10 places', async ({ page }) => {
    // (1) setup
    await logIn(page, 'alice')
    await startReport(page, 'lost')
    await lostDetailsThenTrail(page, `Lost silver tablet ${makeTag()}`)

    // (2) actions: add ten places
    for (let number = 1; number <= 10; number++) {
      await addStop(page, number, 1)
    }

    // (3) assert: ten on the trail, and no way to add an eleventh
    await expect(page.getByTestId('lost-trail').locator('> li')).toHaveCount(10)
    await expect(page.getByTestId('lost-add-stop')).toHaveCount(0)
    await expect(page.getByTestId('lost-add-building')).toHaveCount(0)
  })
})
