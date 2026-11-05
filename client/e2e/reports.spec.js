// Feature 5c: reporting a fake post or an abusive chat message, and what an
// admin can do about it (dismiss, warn, remove, suspend, and lift a suspension).
import { test, expect } from '@playwright/test'
import {
  logIn,
  makeClaimedFind,
  cleanUp,
  apiToken,
  apiGet,
  apiPost,
  postItem,
  makeTag,
  API_URL,
} from './helpers'

// Setting up a claimed find takes several API calls, so allow a minute
test.describe.configure({ timeout: 60 * 1000 })

// The first page a test opens can take more than the usual 5 seconds (the
// shared test database, and a new browser loading the app), as in feed.spec.js
const LOAD = { timeout: 20 * 1000 }

// Ben posts a find for others to report. Returns { tag, item }.
async function bensFind(request) {
  const tag = makeTag()
  const ben = await apiToken(request, 'ben')
  const { item } = await postItem(request, ben, { type: 'found', tag })
  return { tag, item }
}

// The open report about this item, as the admin sees it
async function openReportOn(request, itemId) {
  const admin = await apiToken(request, 'admin')
  const reports = await apiGet(request, '/admin/reports?status=open', admin)
  return reports.find((report) => report.itemId === itemId)
}

// Opens the report about this tag from the Reported posts tab
async function openReportFromQueue(page, tag) {
  await page.goto('/admin?tab=reports')
  await page.getByRole('searchbox', { name: 'Search' }).fill(tag)
  await page.getByTestId('admin-open-case').click()
  await expect(page.getByRole('heading', { name: 'Review the report' })).toBeVisible()
}

test.describe('Reporting a post', () => {
  let setup

  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('a student reports a post and an admin dismisses it', async ({ page, request }) => {
    // (1) setup: Ben's find, opened by Alice
    setup = await bensFind(request)
    await logIn(page, 'alice')
    await page.goto(`/items/${setup.item.id}/record`)

    // (2) actions: report it with a reason
    await page.getByRole('button', { name: 'Report this post' }).click()
    await page
      .getByRole('textbox', { name: 'What is wrong with this post?' })
      .fill('This looks like a joke post')
    await page.getByRole('button', { name: 'Report to an admin' }).click()

    // (3) assert: she is thanked...
    await expect(page.getByText('Thanks. An admin will look at this post.')).toBeVisible()

    // ...and the admin finds it in the queue and dismisses it
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'admin')
    await openReportFromQueue(page, setup.tag)
    await expect(page.getByText('This looks like a joke post')).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss the report' }).click()
    await page.getByRole('button', { name: 'Yes, dismiss it' }).click()
    await expect(page.getByText('Report dismissed.')).toBeVisible()
    expect(await openReportOn(request, setup.item.id)).toBeUndefined()
  })

  test('the poster has no button to report their own post', async ({ page, request }) => {
    // (1) setup
    setup = await bensFind(request)
    await logIn(page, 'ben')

    // (2) actions
    await page.goto(`/items/${setup.item.id}/record`)

    // (3) assert
    await expect(page.getByRole('heading', { name: 'You found this' })).toBeVisible(LOAD)
    await expect(page.getByRole('button', { name: 'Report this post' })).toHaveCount(0)
  })

  test('a logged-out visitor has no button to report a post', async ({ page, request }) => {
    // (1) setup
    setup = await bensFind(request)

    // (2) actions
    await page.goto(`/items/${setup.item.id}/record`)

    // (3) assert
    await expect(page.getByRole('heading', { name: 'Is this yours?' })).toBeVisible(LOAD)
    await expect(page.getByRole('button', { name: 'Report this post' })).toHaveCount(0)
  })

  test('a reason of only spaces is refused', async ({ page, request }) => {
    // (1) setup
    setup = await bensFind(request)
    await logIn(page, 'alice')
    await page.goto(`/items/${setup.item.id}/record`)

    // (2) actions
    await page.getByRole('button', { name: 'Report this post' }).click()
    await page.getByRole('textbox', { name: 'What is wrong with this post?' }).fill('   ')
    await page.getByRole('button', { name: 'Report to an admin' }).click()

    // (3) assert: the server's message, and nothing reaches the admins
    await expect(page.getByRole('alert')).toContainText('Say what is wrong')
    expect(await openReportOn(request, setup.item.id)).toBeUndefined()
  })

  test('reporting the same post twice says it was already reported', async ({ page, request }) => {
    // (1) setup: Alice has already reported Ben's find
    setup = await bensFind(request)
    const alice = await apiToken(request, 'alice')
    await apiPost(request, '/reports', alice, { itemId: setup.item.id, reason: 'Fake post' })
    await logIn(page, 'alice')
    await page.goto(`/items/${setup.item.id}/record`)

    // (2) actions: report it again
    await page.getByRole('button', { name: 'Report this post' }).click()
    await page.getByRole('textbox', { name: 'What is wrong with this post?' }).fill('Still fake')
    await page.getByRole('button', { name: 'Report to an admin' }).click()

    // (3) assert: told plainly, and still only one report
    await expect(page.getByRole('alert')).toBeVisible()
    const admin = await apiToken(request, 'admin')
    const reports = await apiGet(request, '/admin/reports?status=open', admin)
    expect(reports.filter((report) => report.itemId === setup.item.id)).toHaveLength(1)
  })

  test('three reports hide a post until an admin dismisses one', async ({ page, request }) => {
    // (1) setup: Alice and Chloe report Ben's find through the API
    setup = await bensFind(request)
    for (const who of ['alice', 'chloe']) {
      const token = await apiToken(request, who)
      await apiPost(request, '/reports', token, { itemId: setup.item.id, reason: 'Fake post' })
    }

    // (2) actions: the admin sends the third report from the item page
    await logIn(page, 'admin')
    await page.goto(`/items/${setup.item.id}/record`)
    await page.getByRole('button', { name: 'Report this post' }).click()
    await page
      .getByRole('textbox', { name: 'What is wrong with this post?' })
      .fill('Third report on this post')
    await page.getByRole('button', { name: 'Report to an admin' }).click()
    await expect(page.getByText('Thanks. An admin will look at this post.')).toBeVisible()

    // (3) assert: a visitor can no longer open it...
    const hidden = await request.get(`${API_URL}/items/${setup.item.id}`)
    expect(hidden.status()).toBe(404)

    // ...until the admin dismisses a report, which shows it again
    await openReportFromQueue(page, 'Third report on this post')
    await page.getByRole('button', { name: 'Dismiss the report' }).click()
    await page.getByRole('button', { name: 'Yes, dismiss it' }).click()
    await expect(page.getByText('Report dismissed.')).toBeVisible()
    const shown = await request.get(`${API_URL}/items/${setup.item.id}`)
    expect(shown.status()).toBe(200)
  })

  test('an admin removes a reported post', async ({ page, request }) => {
    // (1) setup: Alice reported Ben's find
    setup = await bensFind(request)
    const alice = await apiToken(request, 'alice')
    await apiPost(request, '/reports', alice, {
      itemId: setup.item.id,
      reason: 'This is an advert, not a find',
    })
    await logIn(page, 'admin')
    await openReportFromQueue(page, setup.tag)

    // (2) actions: remove it, with a reason
    await page.getByRole('button', { name: 'Remove the post' }).click()
    await page.getByRole('textbox', { name: /Reason/ }).fill('Advert, not a real find')
    await page.getByRole('button', { name: 'Yes, remove the post' }).click()

    // (3) assert: logged, and visitors get "not found"
    await expect(page.getByText('Removed.')).toBeVisible()
    await page.evaluate(() => localStorage.clear())
    await page.goto(`/items/${setup.item.id}/record`)
    await expect(page.getByText('Item not found')).toBeVisible()
  })
})

test.describe('Reporting a chat message', () => {
  let setup

  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('the owner reports a message and an admin removes it from the chat', async ({
    page,
    request,
  }) => {
    // (1) setup: Alice claimed Ben's find, and Ben sent a rude message
    setup = await makeClaimedFind(request)
    const [alice, ben] = [await apiToken(request, 'alice'), await apiToken(request, 'ben')]
    const rude = `Rude message ${setup.tag}`
    await apiPost(request, `/messages/${setup.matchId}`, alice, {
      text: 'Hi, is it still with you?',
    })
    await apiPost(request, `/messages/${setup.matchId}`, ben, { text: rude })
    await logIn(page, 'alice')
    await page.goto(`/matches/${setup.matchId}/handoff`)

    // (2) actions: Alice flags it and confirms
    const message = page.getByTestId('chat-message').filter({ hasText: rude })
    await message
      .getByRole('button', { name: /Report/ })
      .first()
      .click()
    await message.getByRole('button', { name: 'Report to admin' }).click()
    await expect(message.getByText(/Reported/)).toBeVisible()

    // The admin removes it
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'admin')
    await openReportFromQueue(page, rude)
    await expect(page.getByText(rude).first()).toBeVisible()
    // The admin sees who wrote each message around it, the reporter included
    await expect(page.getByTestId('report-context')).toContainText('Alice Tan')
    await expect(page.getByTestId('report-context')).not.toContainText('The other person')
    await page.getByRole('button', { name: 'Remove the message' }).click()
    await page.getByRole('textbox', { name: /Reason/ }).fill('Rude to the owner')
    await page.getByRole('button', { name: 'Yes, remove the message' }).click()
    await expect(page.getByText('Removed.')).toBeVisible()

    // (3) assert: in the chat, the text is gone for Alice
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'alice')
    await page.goto(`/matches/${setup.matchId}/handoff`)
    await expect(page.getByText('This message was removed by an admin')).toBeVisible()
    await expect(page.getByText(rude)).toHaveCount(0)
  })
})

test.describe('Warnings and suspensions', () => {
  let setup

  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('an admin suspends a poster, who can still browse but not post, then lifts it', async ({
    page,
    request,
  }) => {
    // (1) setup: Chloe posted a find, and Alice reported it
    const tag = makeTag()
    setup = { tag }
    const chloe = await apiToken(request, 'chloe')
    const { item } = await postItem(request, chloe, { type: 'found', tag })
    const alice = await apiToken(request, 'alice')
    await apiPost(request, '/reports', alice, { itemId: item.id, reason: 'Spam posts' })
    await logIn(page, 'admin')
    await openReportFromQueue(page, tag)

    // (2) actions: suspend Chloe
    await page.getByRole('button', { name: 'Suspend the account' }).click()
    await page.getByRole('textbox', { name: /Reason/ }).fill('Posting spam')
    await page.getByRole('button', { name: 'Yes, suspend Chloe Ng' }).click()
    await expect(page.getByText('Account suspended.')).toBeVisible()

    // (3) assert: she is on the People tab as suspended
    await page.goto('/admin?tab=people')
    await page.locator('label', { has: page.getByTestId('toggle-suspended') }).click()
    await expect(page.getByRole('tabpanel')).toContainText('Chloe Ng')

    // Chloe sees the banner and cannot report a post
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'chloe')
    await expect(page.getByText('Your account is suspended.')).toBeVisible()
    const ben = await apiToken(request, 'ben')
    const { item: bensItem } = await postItem(request, ben, { type: 'found', tag: `${tag}b` })
    await page.goto(`/items/${bensItem.id}/record`)
    await page.getByRole('button', { name: 'Report this post' }).click()
    await page.getByRole('textbox', { name: 'What is wrong with this post?' }).fill('Spam')
    await page.getByRole('button', { name: 'Report to an admin' }).click()
    await expect(page.getByRole('alert')).toBeVisible()

    // The admin lifts the suspension from the People tab
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'admin')
    await page.goto('/admin?tab=people')
    await page.getByRole('button', { name: 'Unsuspend Chloe Ng' }).click()
    await page
      .getByRole('textbox', { name: /Why lift Chloe Ng's suspension/ })
      .fill('Spoke to her; she will stop')
    await page.getByRole('button', { name: 'Lift the suspension' }).click()
    await expect(page.getByText("Chloe Ng's suspension was lifted.")).toBeVisible()
    await page.locator('label', { has: page.getByTestId('toggle-suspended') }).click()
    await expect(page.getByText('Nobody is suspended.')).toBeVisible()
  })

  test('an admin warns the author of a reported post', async ({ page, request }) => {
    // (1) setup: Alice reported Ben's find
    setup = await bensFind(request)
    const alice = await apiToken(request, 'alice')
    await apiPost(request, '/reports', alice, { itemId: setup.item.id, reason: 'Misleading post' })
    await logIn(page, 'admin')
    await openReportFromQueue(page, setup.tag)

    // (2) actions
    await page.getByRole('button', { name: 'Warn Ben' }).click()
    await page
      .getByRole('textbox', { name: /Reason/ })
      .fill(`The photo is not of the item (${setup.tag})`)
    await page.getByRole('button', { name: 'Yes, warn Ben' }).click()

    // (3) assert: logged on the report and in the Log tab
    await expect(page.getByText('Warning logged.')).toBeVisible()
    await page.goto('/admin?tab=log')
    await page
      .getByRole('searchbox', { name: 'Search' })
      .fill(`The photo is not of the item (${setup.tag})`)
    await expect(page.getByRole('tabpanel')).toContainText('Ben Lim')
  })
})
