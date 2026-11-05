// Feature 2, the Matches page (WS3): scenario M1 in the team's e2e plan. An
// owner opens their lost report and sees what has turned up for it, best
// match first, each with its score and the reasons it matched. They can say
// "Not mine" (with Undo), compare the finds side by side, start a claim, or
// close the report themselves. M2 to M7 (the claim and the handoff) are in
// matches.spec.js.
//
// Like the other files, these tests never seed or wipe the database. Each one
// posts its own tagged items through the API (see helpers.js): Ben finds two
// tablets, a close one and a weaker one, and Alice reports losing hers, so
// her report has exactly two finds. cleanUp takes the leftovers down.
//
// The tests check the page, not the scoring weights: which find is best
// comes from the scores the API gave, so retuning the engine never breaks
// them. Elements are found by their data-testid only.
import { test, expect as baseExpect } from '@playwright/test'
import { apiGet, apiPost, apiToken, cleanUp, logIn, makeTag, postItem } from './helpers'

// Posting three items and scoring them takes several steps
test.describe.configure({ timeout: 90 * 1000 })

// Pages load from the shared test database, which can take several seconds
const expect = baseExpect.configure({ timeout: 20 * 1000 })

// "Not mine" waits 6 seconds for an Undo before it saves (UNDO_MS)
const UNDO_WAIT = { timeout: 20 * 1000 }

// A find that shares the category, place and time but not the colour, brand
// or description, so it scores lower than postItem's close copy
function postWeakerFind(request, token, tag) {
  const now = Date.now()
  return apiPost(request, '/items', token, {
    type: 'found',
    title: `Found tablet ${tag}`,
    description: 'Tablet in a black folding case, no stickers',
    category: 'Tablet',
    colours: ['Black'],
    trail: [
      {
        spotId: 5,
        from: new Date(now - 3 * 3600 * 1000).toISOString(),
        to: new Date(now - 2 * 3600 * 1000).toISOString(),
      },
    ],
  })
}

// Ben posts two finds, then Alice reports losing her iPad. Returns
//   { tag, lost, best, other }
// where best and other are her report's two matches, each with its found
// item as .item, best being the one the API scored higher.
async function makeReportWithTwoFinds(request) {
  const tag = makeTag()
  const [ben, alice] = await Promise.all([apiToken(request, 'ben'), apiToken(request, 'alice')])
  const close = (await postItem(request, ben, { type: 'found', tag })).item
  const weaker = (await postWeakerFind(request, ben, tag)).item
  const lost = await postItem(request, alice, {
    type: 'lost',
    tag,
    title: `Alice's silver iPad ${tag}`,
  })
  const pick = (found) => {
    const match = lost.matches.find((entry) => entry.foundItemId === found.id)
    if (!match) throw new Error(`Matching did not pair Alice's report with "${found.title}"`)
    return { ...match, item: found }
  }
  const [best, other] = [pick(close), pick(weaker)].sort((a, b) => b.score - a.score)
  if (Math.round(best.score) === Math.round(other.score)) {
    throw new Error('The two test finds scored the same, so the page could show either first')
  }
  return { tag, lost: lost.item, best, other }
}

// Alice's report from GET /api/matches/mine, or undefined once it has left the page
async function aliceReport(request, lostId) {
  const alice = await apiToken(request, 'alice')
  const { reports } = await apiGet(request, '/matches/mine', alice)
  return reports.find((report) => report.item.id === lostId)
}

// Opens the Matches page and picks the test report's tag on the rail. The
// panel fades the report before it out first, so this waits until the test
// report's own find shows: a click before then would land on the old report.
async function openReport(page, set) {
  await page.goto('/matches')
  const tag = page.getByTestId('report-item').filter({ hasText: set.tag })
  await tag.click()
  await expect(tag).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(new RegExp(`[?&]report=${set.lost.id}\\b`))
  await expect(page.getByTestId('best-find')).toHaveCount(1)
  await expect(page.getByTestId('best-find')).toContainText(set.tag)
  return tag
}

test.describe('M1: the Matches page', () => {
  let set

  test.beforeEach(async ({ page, request }) => {
    // A test item left open by an earlier run would match this run's report too
    await cleanUp(request)
    set = await makeReportWithTwoFinds(request)
    await logIn(page, 'alice')
  })

  test.afterAll(async ({ request }) => {
    await cleanUp(request)
  })

  test('a report shows its finds best first, with each score and why it matched', async ({
    page,
  }) => {
    // (1) setup: done in beforeEach. (2) actions: open the report
    const tag = await openReport(page, set)

    // (3) assert: the tag counts its finds
    await expect(tag.getByTestId('report-finds')).toHaveText('2 finds')
    await expect(page.getByTestId('finds-title')).toHaveText('2 finds look like it')

    // The best find is shown large, with its score, its place and its reasons
    const best = page.getByTestId('best-find')
    await expect(best).toContainText(set.best.item.title)
    await expect(best.getByTestId('finds-score')).toHaveText(`${Math.round(set.best.score)}%`)
    // Alice's report names the same building at that time, so she sees where it was found
    await expect(best).toContainText('Found at')
    await expect(best.getByTestId('find-place-hidden')).toHaveCount(0)
    await expect(
      best.getByRole('list', { name: 'Why it matched' }).getByRole('listitem'),
    ).not.toHaveCount(0)

    // The other one is a row under it, with its own lower score
    const row = page.getByTestId('other-find')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(set.other.item.title)
    await expect(row).toContainText(`${Math.round(set.other.score)}%`)

    // "This is mine" starts a claim on the best match
    await best.getByTestId('this-is-mine').click()
    await expect(page).toHaveURL(new RegExp(`/matches/${set.best.id}/claim$`))
  })

  test('the filters and the report shown stay in the address bar', async ({ page }) => {
    await openReport(page, set)

    // (2) actions: show only the reports with finds to check
    await page.getByTestId('filter-finds').click()

    // (3) assert: the filter is on, in the address too, and the report still shows
    await expect(page.getByTestId('filter-finds')).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/[?&]show=finds\b/)
    const tag = page.getByTestId('report-item').filter({ hasText: set.tag })
    await tag.click()
    await expect(page.getByTestId('best-find')).toContainText(set.best.item.title)

    // A reload (or a shared link) opens the same filter and report
    await page.reload()
    await expect(page.getByTestId('filter-finds')).toHaveAttribute('aria-pressed', 'true')
    await expect(tag).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('best-find')).toContainText(set.best.item.title)
  })

  test('"Not mine" hides a find, Undo brings it back, and the last one leaves a note', async ({
    page,
    request,
  }) => {
    await openReport(page, set)
    const best = page.getByTestId('best-find')

    // (2) actions: turn down the best find, then undo it
    await best.getByTestId('not-mine').click()

    // (3) assert: the other find moves up at once, with an Undo
    await expect(best).toContainText(set.other.item.title)
    await expect(page.getByTestId('not-mine-undo')).toContainText(set.best.item.title)
    await page.getByTestId('not-mine-undo-button').click()
    await expect(best).toContainText(set.best.item.title)
    await expect(page.getByTestId('other-find')).toHaveCount(1)

    // Turned down again and left alone, it is saved once the Undo goes
    await best.getByTestId('not-mine').click()
    await expect(page.getByTestId('not-mine-undo')).toBeHidden(UNDO_WAIT)
    await expect
      .poll(async () => (await aliceReport(request, set.lost.id))?.matches.map((m) => m.id), {
        timeout: 20 * 1000,
      })
      .toEqual([set.other.id])

    // A reload shows only the one left
    await page.reload()
    await expect(page.getByTestId('finds-title')).toHaveText('1 find looks like it')
    await expect(best).toContainText(set.other.item.title)
    await expect(page.getByTestId('other-find')).toHaveCount(0)

    // Turning down the last one says the report is still open, with no finds
    await best.getByTestId('not-mine').click()
    await expect(page.getByTestId('cleared-note')).toContainText(
      'No finds left for your tablet.',
      UNDO_WAIT,
    )
    await expect(page.getByTestId('no-finds')).toBeVisible()
    await expect(page.getByTestId('add-details')).toBeVisible()
  })

  test('"Compare side by side" opens the finds page, where View shows another find large', async ({
    page,
  }) => {
    await openReport(page, set)

    // (2) actions: open the finds page
    await page.getByTestId('finds-link').click()

    // (3) assert: the heading counts the finds and the best one is shown large
    await expect(page).toHaveURL(new RegExp(`/matches/finds/${set.lost.id}$`))
    await expect(page.getByTestId('finds-page-title')).toHaveText('2 finds look like your tablet.')
    const card = page.getByTestId('find-card')
    await expect(card).toContainText(set.best.item.title)
    await expect(card.getByTestId('find-score')).toHaveText(`${Math.round(set.best.score)}%`)
    await expect(card.getByTestId('find-reason')).not.toHaveCount(0)
    await expect(page.getByTestId('find-compare')).toBeVisible()

    // The other find is a row; View puts it large instead, in the address too
    const row = page.getByTestId('find-row')
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('find-row-score')).toHaveText(`${Math.round(set.other.score)}%`)
    await row.getByTestId('find-view').click()
    await expect(page).toHaveURL(new RegExp(`[?&]find=${set.other.id}\\b`))
    await expect(card).toContainText(set.other.item.title)

    // The back link returns to the report on the Matches page
    await page.getByTestId('back-to-report').click()
    await expect(page).toHaveURL(new RegExp(`/matches\\?.*report=${set.lost.id}\\b`))
    await expect(page.getByTestId('report-item').filter({ hasText: set.tag })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  test('"I found it myself" closes the report and takes it off the page', async ({
    page,
    request,
  }) => {
    const tag = await openReport(page, set)

    // (2) actions: close the report, confirming the second step
    await page.getByTestId('found-it').click()
    await page.getByTestId('found-it-confirm').click()

    // (3) assert: its tag leaves the rail, and stays gone after a reload
    await expect(tag).toHaveCount(0)
    expect(await aliceReport(request, set.lost.id)).toBeUndefined()
    await page.reload()
    await expect(page.getByTestId('matches-title')).toBeVisible()
    await expect(page.getByTestId('report-item').filter({ hasText: set.tag })).toHaveCount(0)
  })
})
