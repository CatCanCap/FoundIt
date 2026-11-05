// Feature 5b, the Admin page: who may open it, deciding a dispute both ways
// (and what each person then sees), and the People tab and action log.
// Reported posts and messages are in reports.spec.js.
import { test, expect } from '@playwright/test'
import { logIn, makeClaimedFind, chloeDisputes, cleanUp, apiToken, apiPost } from './helpers'

// Setting up a claimed find takes several API calls, so allow a minute
test.describe.configure({ timeout: 60 * 1000 })

test.describe('Who can open the Admin page', () => {
  test('a logged-out visitor is sent to sign in', async ({ page }) => {
    // (1) setup: nobody is signed in
    // (2) actions
    await page.goto('/admin')

    // (3) assert
    await expect(page).toHaveURL(/\/login/)
  })

  test('a student sees the admins-only page', async ({ page }) => {
    // (1) setup
    await logIn(page, 'alice')

    // (2) actions
    await page.goto('/admin')

    // (3) assert: no queue, and no admin data
    await expect(page).toHaveURL(/\/admins-only/)
    await expect(page.getByRole('tab', { name: /Disputes/ })).toHaveCount(0)
  })

  test('an admin who opens a student page is sent to the Admin page', async ({ page }) => {
    // (1) setup
    await logIn(page, 'admin')

    // (2) actions: the feed and My disputes are for students
    await page.goto('/feed')
    await expect(page).toHaveURL(/\/admin/)
    await page.goto('/disputes')

    // (3) assert
    await expect(page).toHaveURL(/\/admin/)
  })

  test('an admin signs in and lands on the dispute queue', async ({ page }) => {
    // (1) setup: nothing
    // (2) actions
    await logIn(page, 'admin')

    // (3) assert
    await expect(page.getByRole('heading', { name: /hanging/, level: 1 })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Disputes/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})

test.describe('Deciding a dispute', () => {
  let setup

  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('an admin keeps the claim and both people see the reason', async ({ page, request }) => {
    // (1) setup: Chloe disputes Alice's claim on Ben's find
    setup = await makeClaimedFind(request)
    await chloeDisputes(request, setup.found.id)
    await logIn(page, 'admin')

    // (2) actions: find the case in the queue, read it, keep Alice's claim
    await page.getByRole('searchbox', { name: 'Search' }).fill(setup.tag)
    await expect(page.getByTestId('admin-ticket')).toContainText('Chloe Ng')
    await page.getByTestId('admin-open-case').click()

    await expect(page.getByRole('tab', { name: /What happened/ })).toBeVisible()
    await expect(page.getByTestId('case-summary').getByText('Alice Tan').first()).toBeVisible()
    await expect(page.getByTestId('case-summary').getByText('Chloe Ng').first()).toBeVisible()
    await page.getByRole('tab', { name: /Both sides/ }).click()
    await expect(
      page.getByTestId('case-claimer').getByText('My initials AT are engraved on the back'),
    ).toBeVisible()
    await expect(
      page.getByTestId('case-raiser').getByText('a scratch shaped like a C on the case'),
    ).toBeVisible()
    await page.getByRole('tab', { name: /Chat/ }).click()
    await page.getByRole('tab', { name: /Decide/ }).click()

    await page.getByRole('radio', { name: /Keep Alice Tan's claim/ }).check()
    await page
      .getByRole('textbox', { name: 'Reason both people will see' })
      .fill('Alice knew the initials engraved on the back.')
    await page.getByRole('button', { name: 'Review decision' }).click()
    await page.getByRole('button', { name: 'Yes, log it' }).click()

    // (3) assert: logged, and the case now shows the outcome
    await expect(
      page.getByText('Decision logged. Both people can now see your reason.'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'The claim was kept' })).toBeVisible()

    // Chloe sees "Claim kept" with the reason
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'chloe')
    await page.goto('/disputes')
    await page.getByRole('button', { name: new RegExp(setup.tag) }).click()
    await expect(page.getByText('Decided: the claim was kept')).toBeVisible()
    await expect(page.getByText('Alice knew the initials engraved on the back.')).toBeVisible()

    // The item record is no longer paused, and tells her how it was decided
    await page.goto(`/items/${setup.found.id}/record`)
    await expect(page.getByRole('heading', { name: 'Matched with someone' })).toBeVisible()
    await expect(page.getByText('Dispute decided:')).toBeVisible()
  })

  test('an admin returns the item to the disputer with a warning', async ({ page, request }) => {
    // (1) setup
    setup = await makeClaimedFind(request)
    await chloeDisputes(request, setup.found.id)
    await logIn(page, 'admin')
    await page.getByRole('searchbox', { name: 'Search' }).fill(setup.tag)
    await page.getByTestId('admin-open-case').click()

    // (2) actions: jump straight to Decide, return it to Chloe and warn Alice
    await page.getByRole('tab', { name: /Decide/ }).click()
    await page.getByRole('radio', { name: /Return to Chloe Ng/ }).check()
    await page
      .getByRole('textbox', { name: 'Reason both people will see' })
      .fill(`Chloe described the sticker, and the find has it (${setup.tag}).`)
    await page.getByRole('radio', { name: /Warn Alice/ }).check()
    await page.getByRole('button', { name: 'Review decision' }).click()
    await page.getByRole('button', { name: 'Yes, log it' }).click()

    // (3) assert: the case is decided for Chloe
    await expect(page.getByText('Decision logged.')).toBeVisible()

    // The People tab lists Alice as warned, and the log has both entries
    await page.goto('/admin?tab=people')
    await page.locator('label', { has: page.getByTestId('toggle-warned') }).click()
    // Alice may be warned from earlier runs too: her last action is this one
    await expect(page.getByRole('tabpanel')).toContainText(setup.tag)
    await page.getByRole('tab', { name: 'Action log' }).click()
    await page.getByRole('searchbox', { name: 'Search' }).fill(setup.tag)
    await expect(page.getByRole('tabpanel').getByRole('listitem')).toHaveCount(2)

    // Alice is told it went to the other person
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'alice')
    await page.goto('/disputes')
    await page.getByRole('button', { name: new RegExp(setup.tag) }).click()
    await expect(page.getByText('Decided: the item went to the other person')).toBeVisible()

    // Chloe is told the item is hers
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'chloe')
    await page.goto('/disputes')
    await page.getByRole('button', { name: new RegExp(setup.tag) }).click()
    await expect(page.getByText('Decided: the item is yours')).toBeVisible()
  })

  test('after the item is returned to the disputer, she and the finder can arrange the handoff', async ({
    page,
    request,
  }) => {
    // (1) setup: an admin returned Ben's find to Chloe
    setup = await makeClaimedFind(request)
    const dispute = await chloeDisputes(request, setup.found.id)
    const admin = await apiToken(request, 'admin')
    await apiPost(request, `/admin/disputes/${dispute.id}/uphold`, admin, {
      reason: `Chloe described the sticker (${setup.tag}).`,
    })

    // (2) actions: Chloe follows the verdict to the handoff and writes to Ben
    await logIn(page, 'chloe')
    await page.goto('/disputes')
    await page.getByRole('button', { name: new RegExp(setup.tag) }).click()
    await page.getByRole('link', { name: /Arrange the handoff with the finder/ }).click()
    await expect(page).toHaveURL(/\/returns/)
    await page
      .getByTestId('handoff-group')
      .filter({ hasText: setup.tag })
      .getByRole('link', { name: /Open chat/ })
      .click()
    const hello = `Hi, I can meet at SCIS 1 tomorrow (${setup.tag})`
    await page.getByTestId('chat-input').fill(hello)
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByTestId('chat-message').filter({ hasText: hello })).toBeVisible()

    // (3) assert: Ben sees her message in the chat for his find
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'ben')
    await page.goto('/returns')
    await page
      .getByTestId('handoff-group')
      .filter({ hasText: setup.tag })
      .getByRole('link', { name: /Open chat/ })
      .click()
    await expect(page.getByText(hello)).toBeVisible()
  })

  test('an admin returns the item and suspends a claim that looked deliberate', async ({
    page,
    request,
  }) => {
    // (1) setup
    setup = await makeClaimedFind(request)
    await chloeDisputes(request, setup.found.id)
    await logIn(page, 'admin')
    await page.getByRole('searchbox', { name: 'Search' }).fill(setup.tag)
    await page.getByTestId('admin-open-case').click()

    // (2) actions: return it to Chloe and suspend Alice
    await page.getByRole('tab', { name: /Decide/ }).click()
    await page.getByRole('radio', { name: /Return to Chloe Ng/ }).check()
    await page
      .getByRole('textbox', { name: 'Reason both people will see' })
      .fill(`Alice copied the details from the post (${setup.tag}).`)
    await page.getByRole('radio', { name: /Suspend Alice/ }).check()
    await page.getByRole('button', { name: 'Review decision' }).click()
    await page.getByRole('button', { name: 'Yes, log it' }).click()
    await expect(page.getByText('Decision logged.')).toBeVisible()

    // (3) assert: Alice is listed as suspended, and sees it when she signs in
    await page.goto('/admin?tab=people')
    await page.locator('label', { has: page.getByTestId('toggle-suspended') }).click()
    await expect(page.getByRole('tabpanel')).toContainText('Alice Tan')
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'alice')
    await expect(page.getByText('Your account is suspended.')).toBeVisible()
  })

  test('a decision needs a reason', async ({ page, request }) => {
    // (1) setup
    setup = await makeClaimedFind(request)
    await chloeDisputes(request, setup.found.id)
    await logIn(page, 'admin')
    await page.getByRole('searchbox', { name: 'Search' }).fill(setup.tag)
    await page.getByTestId('admin-open-case').click()

    // (2) actions: try to review the decision with no reason
    await page.getByRole('tab', { name: /Decide/ }).click()
    await page.getByRole('button', { name: 'Review decision' }).click()

    // (3) assert: nothing to confirm yet, and the case is still open
    await expect(page.getByRole('button', { name: 'Yes, log it' })).toHaveCount(0)
    await page.goto('/admin')
    await page.getByRole('searchbox', { name: 'Search' }).fill(setup.tag)
    await expect(page.getByTestId('admin-ticket')).toContainText('Alice Tan')
  })

  test('a decided case leaves the waiting queue and shows under Decided', async ({
    page,
    request,
  }) => {
    // (1) setup: decide one through the page
    setup = await makeClaimedFind(request)
    await chloeDisputes(request, setup.found.id)
    await logIn(page, 'admin')
    await page.getByRole('searchbox', { name: 'Search' }).fill(setup.tag)
    await page.getByTestId('admin-open-case').click()
    await page.getByRole('tab', { name: /Decide/ }).click()
    await page.getByRole('radio', { name: /Keep Alice Tan's claim/ }).check()
    await page
      .getByRole('textbox', { name: 'Reason both people will see' })
      .fill('Kept: the claim detail fits the find.')
    await page.getByRole('button', { name: 'Review decision' }).click()
    await page.getByRole('button', { name: 'Yes, log it' }).click()
    await expect(page.getByText('Decision logged.')).toBeVisible()

    // (2) actions: back to the queue, search, switch Show to Decided
    await page.getByTestId('case-back').click()
    await page.getByRole('searchbox', { name: 'Search' }).fill(setup.tag)
    const row = page.getByRole('row').filter({ hasText: setup.tag })
    await expect(row).toHaveCount(0)
    await page.locator('label', { has: page.getByTestId('toggle-decided') }).click()

    // (3) assert
    await expect(row).toBeVisible()
  })
})
