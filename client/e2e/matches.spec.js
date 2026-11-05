// Feature 4, the handoff (WS5): claiming a match, the finder's check, the
// chat, the two-step handoff and a declined claim. Scenarios M2 to M6 in the
// team's e2e plan. M1 (the ranked Matches page) belongs with the Matches page.
//
// Like the other files, these tests never seed or wipe the database. Each one
// posts its own pair of tagged items through the API (see helpers.js), so the
// steps never depend on the seeded pairs or on another test, and cleanUp takes
// the leftovers down afterwards. Two browser windows, one for Alice (the
// owner) and one for Ben (the finder), stay signed in for the whole chain.
//
// Elements are found by their data-testid only, so restyling a page never
// breaks a test.
import { test, expect as baseExpect } from '@playwright/test'
import { apiPost, apiToken, cleanUp, expectNoSideScroll, logIn, makeTag, postItem } from './helpers'

// Setting up a pair and two windows takes several steps
test.describe.configure({ timeout: 90 * 1000 })

// Pages load from the shared test database, which can take several seconds,
// so each check waits up to 20 seconds (as in layout-helpers.js) instead of 5
const expect = baseExpect.configure({ timeout: 20 * 1000 })

// A new message shows on the other screen by a Realtime ping, or by the
// page's own check every 5 seconds
const CHAT_WAIT = { timeout: 20 * 1000 }

// Ben finds an iPad and Alice reports losing it, at the same place and time,
// so matching pairs them. Nobody has claimed it yet.
//   { tag, found, lost, matchId }
async function makeMatch(request) {
  const tag = makeTag()
  const [ben, alice] = await Promise.all([apiToken(request, 'ben'), apiToken(request, 'alice')])
  const found = (await postItem(request, ben, { type: 'found', tag })).item
  const lost = await postItem(request, alice, {
    type: 'lost',
    tag,
    title: `Alice's silver iPad ${tag}`,
  })
  const match = lost.matches.find((entry) => entry.foundItemId === found.id)
  if (!match) throw new Error('Matching did not pair the two test iPads')
  return { tag, found, lost: lost.item, matchId: match.id }
}

// A second signed-in window with the same address and screen size as the test's own
function windowOptions() {
  const { baseURL, viewport } = test.info().project.use
  return { baseURL, viewport }
}

test.describe.serial('M2 to M5: a claim, the chat and the two-step handoff', () => {
  let api
  let pair
  let aliceWindow
  let benWindow
  let alice
  let ben

  test.beforeAll(async ({ browser, playwright }) => {
    api = await playwright.request.newContext()
    // A test item left open by an earlier run would match this run's pair too
    await cleanUp(api)
    pair = await makeMatch(api)
    aliceWindow = await browser.newContext(windowOptions())
    benWindow = await browser.newContext(windowOptions())
    alice = await aliceWindow.newPage()
    ben = await benWindow.newPage()
    await logIn(alice, 'alice')
    await logIn(ben, 'ben')
  })

  test.afterAll(async () => {
    await aliceWindow?.close()
    await benWindow?.close()
    await cleanUp(api)
    await api.dispose()
  })

  test('M2: owner claims a match, and an empty detail is refused', async () => {
    await alice.goto(`/matches/${pair.matchId}/claim`)
    await expectNoSideScroll(alice)
    await expect(alice.getByTestId('claim-title')).toContainText(pair.tag)

    // Refused: the form will not send without a detail only the owner knows
    await alice.getByTestId('claim-submit').click()
    await expect(alice.getByTestId('claim-send-error')).toBeVisible()
    await expect(alice).toHaveURL(/\/claim$/)

    // With a detail, the claim goes through and the chat opens
    await alice
      .getByTestId('claim-detail')
      .fill(`My initials AT are engraved on the back ${pair.tag}`)
    await alice.getByTestId('claim-submit').click()
    await expect(alice).toHaveURL(new RegExp(`/matches/${pair.matchId}/handoff$`))
    await expect(alice.getByTestId('waiting-check')).toBeVisible()
    await expect(alice.getByTestId('chat')).toBeVisible()
    await expectNoSideScroll(alice)

    // The find now reads as claimed on its public record
    await alice.goto(`/items/${pair.found.id}/record`)
    await expect(alice.getByTestId('record-box')).toHaveAttribute('data-stage', 'matched')
    await expectNoSideScroll(alice)
  })

  test('M3: finder checks the detail, accepts and plans a drop-off', async () => {
    await ben.goto(`/matches/${pair.matchId}/handoff`)
    await expectNoSideScroll(ben)

    // Ben sees the detail Alice gave
    await expect(ben.getByTestId('check-claim')).toContainText(pair.tag)

    await ben.getByTestId('accept-claim').click()
    await ben.getByTestId('plan-drop-off').check()
    // The nearest collection point is chosen already
    await expect(ben.getByTestId('plan-spot')).not.toHaveValue('')
    await ben.getByTestId('plan-save').click()

    // The plan shows the method and the place, with walking directions
    const plan = ben.getByTestId('handoff-plan')
    await expect(plan).toContainText('Drop-off')
    await expect(plan).toContainText(' at ')
    await expect(ben.getByTestId('walking-directions')).toBeVisible()
    await expect(ben.getByTestId('check-claim')).toHaveCount(0)
    await expectNoSideScroll(ben)
  })

  test('M4: both people chat, and no contact details show', async () => {
    await alice.goto(`/matches/${pair.matchId}/handoff`)
    await expect(alice.getByTestId('handoff-plan')).toBeVisible()

    const fromAlice = `Hi, thanks for finding it ${pair.tag}`
    await alice.getByTestId('chat-input').fill(fromAlice)
    await alice.getByTestId('chat-send').click()
    await expect(alice.getByTestId('chat')).toContainText(fromAlice)
    await expect(ben.getByTestId('chat')).toContainText(fromAlice, CHAT_WAIT)

    const fromBen = `It is at the counter now ${pair.tag}`
    await ben.getByTestId('chat-input').fill(fromBen)
    await ben.getByTestId('chat-send').click()
    await expect(alice.getByTestId('chat')).toContainText(fromBen, CHAT_WAIT)

    // Neither person's email shows anywhere on the chat page
    for (const page of [alice, ben]) {
      await expect(page.locator('main')).not.toContainText('@smu.edu.sg')
      await expectNoSideScroll(page)
    }
  })

  test('M5: finder hands it over, owner confirms, and the item is returned', async () => {
    // Ben's step: the drop-off from the plan is chosen already
    await ben.getByTestId('handed-over').click()
    await expect(ben.getByTestId('waiting-owner')).toBeVisible()
    await expectNoSideScroll(ben)

    // Alice's step
    await alice.reload()
    await alice.getByTestId('confirm-have-it').click()
    await expect(alice.getByTestId('handoff-resolved')).toBeVisible()
    // The chat is read-only now: no box to type in
    await expect(alice.getByTestId('chat-input')).toHaveCount(0)
    await expectNoSideScroll(alice)

    // The public record says it is back with its owner
    await alice.goto(`/items/${pair.found.id}/record`)
    await expect(alice.getByTestId('record-box')).toHaveAttribute('data-stage', 'returned')
    await expectNoSideScroll(alice)

    // Ben's chat is read-only too
    await ben.reload()
    await expect(ben.getByTestId('handoff-resolved')).toBeVisible()
    await expect(ben.getByTestId('chat-input')).toHaveCount(0)
  })
})

test.describe('M6: the finder declines a claim', () => {
  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('M6: finder declines with a reason, and both items are open again', async ({
    page,
    request,
    browser,
  }) => {
    // (1) setup: Alice has claimed Ben's find through the API
    const pair = await makeMatch(request)
    const aliceToken = await apiToken(request, 'alice')
    await apiPost(request, `/claims/${pair.matchId}`, aliceToken, {
      detail: `There is a red sticker on the back ${pair.tag}`,
    })

    // (2) actions: Ben declines it and says why
    await logIn(page, 'ben')
    await page.goto(`/matches/${pair.matchId}/handoff`)
    await expectNoSideScroll(page)
    await page.getByTestId('decline-claim').click()
    // Refused: no reason, no decline
    await expect(page.getByTestId('decline-confirm')).toBeDisabled()
    const reason = `There is no red sticker on this one ${pair.tag}`
    await page.getByTestId('decline-reason').fill(reason)
    await page.getByTestId('decline-confirm').click()
    await expect(page.getByTestId('handoff-closed')).toBeVisible()
    await expect(page.getByTestId('chat-input')).toHaveCount(0)
    await expectNoSideScroll(page)

    // (3) assert: Alice sees it was declined, with Ben's reason
    const aliceWindow = await browser.newContext(windowOptions())
    try {
      const alice = await aliceWindow.newPage()
      await logIn(alice, 'alice')
      await alice.goto(`/matches/${pair.matchId}/handoff`)
      await expect(alice.getByTestId('handoff-closed')).toBeVisible()
      await expect(alice.getByTestId('closed-reason')).toContainText(reason)
      await expectNoSideScroll(alice)

      // ...and both items are open again
      await alice.goto(`/items/${pair.found.id}/record`)
      await expect(alice.getByTestId('record-box')).toHaveAttribute('data-stage', 'waiting')
      await alice.goto(`/items/${pair.lost.id}/record`)
      await expect(alice.getByTestId('record-box')).toHaveAttribute('data-stage', 'waiting')
      await expectNoSideScroll(alice)
    } finally {
      await aliceWindow.close()
    }
  })
})

test.describe('Only the two people in a handoff can open it', () => {
  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('M7: someone else opening the chat is refused', async ({ page, request }) => {
    // (1) setup: Alice has claimed Ben's find
    const pair = await makeMatch(request)
    const aliceToken = await apiToken(request, 'alice')
    await apiPost(request, `/claims/${pair.matchId}`, aliceToken, {
      detail: `My name is written inside the case ${pair.tag}`,
    })

    // (2) actions: Chloe opens their chat's address
    await logIn(page, 'chloe')
    await page.goto(`/matches/${pair.matchId}/handoff`)

    // (3) assert: she gets the problem page, never the chat or Alice's detail
    await expect(page.getByTestId('handoff-error')).toBeVisible()
    await expect(page.getByTestId('chat')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(pair.tag)
    await expectNoSideScroll(page)
  })
})
