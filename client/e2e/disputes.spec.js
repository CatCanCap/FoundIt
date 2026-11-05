// Feature 5a, "This is my item": raising a dispute, the claimer's side,
// withdrawing, and who may and may not dispute. The admin's decision is in
// admin.spec.js. See helpers.js for how the tests set up their data.
import { test, expect } from '@playwright/test'
import {
  logIn,
  makeClaimedFind,
  chloeDisputes,
  cleanUp,
  apiToken,
  apiGet,
  apiPost,
  postItem,
  makeTag,
  returnItem,
  suspendChloe,
} from './helpers'

// Setting up a claimed find takes several API calls, so allow a minute
test.describe.configure({ timeout: 60 * 1000 })

test.describe('Raising a dispute', () => {
  let setup

  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('a student disputes a claimed find and sees it waiting on My disputes', async ({
    page,
    request,
  }) => {
    // (1) setup: Alice has claimed Ben's find; Chloe says it is hers
    setup = await makeClaimedFind(request)
    await logIn(page, 'chloe')
    await page.goto(`/items/${setup.found.id}/record`)

    // (2) actions: open the dispute form, say what only the owner would know, send
    await expect(page.getByRole('heading', { name: 'Matched with someone' })).toBeVisible()
    await page.getByRole('button', { name: 'This is my item. Dispute it' }).click()
    await expect(page.getByRole('heading', { name: 'Dispute this claim' })).toBeVisible()
    // Her own lost report is attached for her
    await expect(page.getByText(`Chloe's silver iPad ${setup.tag}`)).toBeVisible()
    await page
      .getByRole('textbox', { name: 'What only the owner would know' })
      .fill('It has a scratch shaped like a C on the case and a cat sticker')
    await page.getByRole('button', { name: 'Submit dispute' }).click()

    // (3) assert: My disputes says it was sent and lists it as waiting
    await expect(page).toHaveURL(/\/disputes\?sent=1/)
    await expect(page.getByText('Your dispute was sent. The handoff is paused')).toBeVisible()
    const row = page.getByRole('button', { name: new RegExp(setup.tag) })
    await expect(row).toContainText('Waiting for an admin')

    // ...and the item record now shows the handoff paused, to her
    await page.goto(`/items/${setup.found.id}/record`)
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible()
  })

  test('a second visit to the form says the dispute was already sent', async ({
    page,
    request,
  }) => {
    // (1) setup: Chloe has already disputed the find
    setup = await makeClaimedFind(request)
    await chloeDisputes(request, setup.found.id)
    await logIn(page, 'chloe')

    // (2) actions: open the dispute form again
    await page.goto(`/items/${setup.found.id}/dispute`)

    // (3) assert: no second form, just a link to My disputes
    await expect(page.getByText('You already disputed this claim')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'What only the owner would know' })).toHaveCount(
      0,
    )
    await page.getByRole('link', { name: 'See my disputes' }).click()
    await expect(page).toHaveURL(/\/disputes$/)
  })

  test('without a lost report of her own, the form asks her to report it lost first', async ({
    page,
    request,
  }) => {
    // (1) setup: Chloe has no open lost report for a tablet
    setup = await makeClaimedFind(request, { withChloeReport: false })
    await logIn(page, 'chloe')

    // (2) actions: open the dispute form
    await page.goto(`/items/${setup.found.id}/dispute`)

    // (3) assert: she is sent to report it lost, not shown a form that would be refused
    await expect(page.getByText('First, report your item as lost')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Report it as lost' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Submit dispute' })).toHaveCount(0)
  })

  test('the finder cannot dispute their own find', async ({ page, request }) => {
    // (1) setup
    setup = await makeClaimedFind(request)
    await logIn(page, 'ben')

    // (2) actions: Ben opens his own find, then the dispute address directly
    await page.goto(`/items/${setup.found.id}/record`)
    await expect(page.getByRole('heading', { name: 'Matched with someone' })).toBeVisible()
    const disputeButtons = page.getByRole('button', { name: 'This is my item. Dispute it' })
    await page.goto(`/items/${setup.found.id}/dispute`)

    // (3) assert
    await expect(disputeButtons).toHaveCount(0)
    await expect(page.getByText("You can't dispute this item")).toBeVisible()
    await expect(page.getByText('You reported finding this item')).toBeVisible()
  })

  test('an admin account cannot raise a dispute', async ({ page, request }) => {
    // (1) setup
    setup = await makeClaimedFind(request)
    await logIn(page, 'admin')

    // (2) actions
    await page.goto(`/items/${setup.found.id}/dispute`)

    // (3) assert
    await expect(page.getByText('Admins decide disputes', { exact: true })).toBeVisible()
  })

  test('a logged-out visitor is asked to sign in first', async ({ page, request }) => {
    // (1) setup
    setup = await makeClaimedFind(request)

    // (2) actions: open the dispute form without signing in
    await page.goto(`/items/${setup.found.id}/dispute`)

    // (3) assert: the login page, which brings them back afterwards
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('a find nobody has claimed has no dispute button', async ({ page, request }) => {
    // (1) setup: Ben posts a find that nobody claims
    const tag = makeTag()
    setup = { tag }
    const ben = await apiToken(request, 'ben')
    const { item } = await postItem(request, ben, { type: 'found', tag })
    await logIn(page, 'chloe')

    // (2) actions
    await page.goto(`/items/${item.id}/record`)

    // (3) assert: the usual "Is this yours?", never a dispute
    await expect(page.getByRole('heading', { name: 'Is this yours?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'This is my item. Dispute it' })).toHaveCount(0)
  })

  test('other students never learn that a find is disputed', async ({ page, request }) => {
    // (1) setup: Chloe disputes Alice's claim. Logged out, nobody else is in it
    setup = await makeClaimedFind(request)
    await chloeDisputes(request, setup.found.id)

    // (2) actions: a visitor opens the find
    await page.goto(`/items/${setup.found.id}/record`)

    // (3) assert: it still just looks matched
    await expect(page.getByRole('heading', { name: 'Matched with someone' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Paused' })).toHaveCount(0)
  })
})

test.describe('The claimer’s side', () => {
  let setup

  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('the claimer sees the dispute, without who raised it, and sends their side', async ({
    page,
    request,
  }) => {
    // (1) setup: Chloe disputes Alice's claim
    setup = await makeClaimedFind(request)
    await chloeDisputes(request, setup.found.id)
    await logIn(page, 'alice')
    await page.goto('/disputes')

    // (2) actions: Alice adds a detail only the owner would know
    const card = page.getByRole('article').filter({ hasText: setup.tag })
    await expect(card.getByRole('heading', { name: "Someone else says it's theirs" })).toBeVisible()
    await expect(card).toContainText('My initials AT are engraved on the back')
    await card
      .getByRole('textbox', { name: 'Add a detail only the owner would know' })
      .fill('The case has a crack on one corner from when I dropped it')
    await card.getByRole('button', { name: 'Send my side' }).click()

    // (3) assert: it is saved, and nothing names Chloe or quotes her
    await expect(card.getByText(/Your side was sent/)).toBeVisible()
    await expect(card).not.toContainText('Chloe')
    await expect(card).not.toContainText('cat sticker')
  })

  test('the claimer withdraws and the item goes to the person who disputed it', async ({
    page,
    request,
  }) => {
    // (1) setup
    setup = await makeClaimedFind(request)
    await chloeDisputes(request, setup.found.id)
    await logIn(page, 'alice')
    await page.goto('/disputes')

    // (2) actions: withdraw, then confirm
    const card = page.getByRole('article').filter({ hasText: setup.tag })
    await card.getByRole('button', { name: 'Withdraw my claim' }).click()
    await expect(card.getByText('Withdraw your claim?')).toBeVisible()
    await card.getByRole('button', { name: 'Withdraw my claim' }).click()

    // (3) assert: the dispute is decided for Alice...
    await expect(page.getByRole('article').filter({ hasText: setup.tag })).toHaveCount(0)
    await expect(page.getByRole('button', { name: new RegExp(setup.tag) })).toContainText(
      'You withdrew',
    )

    // ...and Chloe sees it went her way
    await page.evaluate(() => localStorage.clear())
    await logIn(page, 'chloe')
    await page.goto('/disputes')
    const row = page.getByRole('button', { name: new RegExp(setup.tag) })
    await row.click()
    await expect(
      page.getByText('The person who claimed the item withdrew their claim.'),
    ).toBeVisible()
  })

  test('the claimer can keep their claim after opening the withdraw step', async ({
    page,
    request,
  }) => {
    // (1) setup
    setup = await makeClaimedFind(request)
    await chloeDisputes(request, setup.found.id)
    await logIn(page, 'alice')
    await page.goto('/disputes')
    const card = page.getByRole('article').filter({ hasText: setup.tag })

    // (2) actions: start withdrawing, then change her mind
    await card.getByRole('button', { name: 'Withdraw my claim' }).click()
    await card.getByRole('button', { name: 'Keep it' }).click()

    // (3) assert: the dispute is still open with both buttons back
    await expect(card.getByRole('button', { name: 'Send my side' })).toBeVisible()
    await expect(card.getByText('Withdraw your claim?')).toHaveCount(0)
  })
})

test.describe('Dispute limits', () => {
  let setup

  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('a dispute the admin already closed cannot be raised again', async ({ page, request }) => {
    // (1) setup: Chloe disputed, and an admin kept Alice's claim
    setup = await makeClaimedFind(request)
    const dispute = await chloeDisputes(request, setup.found.id)
    const admin = await apiToken(request, 'admin')
    await apiPost(request, `/admin/disputes/${dispute.id}/close`, admin, {
      reason: 'Alice knew the initials under the base',
    })
    await logIn(page, 'chloe')

    // (2) actions: she tries again with the form
    await page.goto(`/items/${setup.found.id}/dispute`)
    await page
      .getByRole('textbox', { name: 'What only the owner would know' })
      .fill('I really think it is mine, it has a cat sticker')
    await page.getByRole('button', { name: 'Submit dispute' }).click()

    // (3) assert: the server's reason is shown and she stays on the form
    await expect(page.getByRole('alert')).toContainText('An admin already decided your dispute')
    await expect(page).toHaveURL(new RegExp(`/items/${setup.found.id}/dispute`))
  })

  test('a lost report that is no longer open is not offered as the attached report', async ({
    page,
    request,
  }) => {
    // (1) setup: Chloe's only tablet report gets claimed on another find,
    // so it is no longer open and the server cannot attach it
    setup = await makeClaimedFind(request, { withChloeReport: false })
    const ben = await apiToken(request, 'ben')
    const chloe = await apiToken(request, 'chloe')
    const otherFind = (
      await postItem(request, ben, {
        type: 'found',
        tag: `${setup.tag}x`,
        title: `Other silver iPad ${setup.tag}x`,
      })
    ).item
    const chloeLost = await postItem(request, chloe, {
      type: 'lost',
      tag: `${setup.tag}x`,
      title: `Chloe's other iPad ${setup.tag}x`,
    })
    const match = chloeLost.matches.find((entry) => entry.foundItemId === otherFind.id)
    await apiPost(request, `/claims/${match.id}`, chloe, { detail: 'A cat sticker on the lid' })
    await logIn(page, 'chloe')

    // (2) actions: open the dispute form on Alice's claim
    await page.goto(`/items/${setup.found.id}/dispute`)

    // (3) assert: she is told to report it lost, as the server would say
    await expect(page.getByText('First, report your item as lost')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Submit dispute' })).toHaveCount(0)
  })
})

test.describe('The open-dispute limit', () => {
  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('a fourth dispute waits until one of the first three is decided', async ({
    page,
    request,
  }) => {
    // (1) setup: Chloe already has 3 disputes waiting for an admin. The seed
    // gives her one of its own, which cleanUp leaves alone, so only top up to 3
    const chloe = await apiToken(request, 'chloe')
    const mine = await apiGet(request, '/disputes/mine', chloe)
    const toRaise = Math.max(0, 3 - mine.filter((dispute) => dispute.status === 'open').length)
    const finds = []
    for (let count = 0; count <= toRaise; count += 1) finds.push(await makeClaimedFind(request))
    for (const find of finds.slice(0, toRaise)) await chloeDisputes(request, find.found.id)
    await logIn(page, 'chloe')
    await page.goto(`/items/${finds.at(-1).found.id}/dispute`)

    // (2) actions: she tries a fourth
    await page
      .getByRole('textbox', { name: 'What only the owner would know' })
      .fill('It has a scratch shaped like a C on the case and a cat sticker')
    await page.getByRole('button', { name: 'Submit dispute' }).click()

    // (3) assert: told why, and still on the form
    await expect(page.getByRole('alert')).toContainText('3 disputes waiting for an admin')
    await expect(page).toHaveURL(new RegExp(`/items/${finds.at(-1).found.id}/dispute`))
  })
})

test.describe('Disputing a returned item', () => {
  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('a find returned in the last 7 days can still be disputed, and the case reopens', async ({
    page,
    request,
  }) => {
    // (1) setup: Ben gave the find to Alice and she confirmed it
    const setup = await makeClaimedFind(request)
    await returnItem(request, setup.matchId)
    await logIn(page, 'chloe')
    await page.goto(`/items/${setup.found.id}/record`)

    // (2) actions: the record shows the 7-day window; Chloe disputes
    await expect(page.getByText('Dispute window')).toBeVisible()
    await page.getByRole('button', { name: 'This is my item. Dispute it' }).click()
    await expect(page.getByText('Case reopens.')).toBeVisible()
    await page
      .getByRole('textbox', { name: 'What only the owner would know' })
      .fill('It has a scratch shaped like a C on the case and a cat sticker')
    await page.getByRole('button', { name: 'Submit dispute' }).click()

    // (3) assert
    await expect(page.getByText('Your dispute was sent.')).toBeVisible()
  })

  test('when an admin gives a returned item to the disputer, the claimer is asked to bring it back', async ({
    page,
    request,
  }) => {
    // (1) setup: Alice already has the item, Chloe disputed, and an admin
    // returned it to Chloe
    const setup = await makeClaimedFind(request)
    await returnItem(request, setup.matchId)
    const dispute = await chloeDisputes(request, setup.found.id)
    const admin = await apiToken(request, 'admin')
    await apiPost(request, `/admin/disputes/${dispute.id}/uphold`, admin, {
      reason: 'Chloe described the sticker, and the find has it.',
    })
    await logIn(page, 'alice')
    await page.goto('/disputes')

    // (2) actions: Alice opens the verdict
    await page.getByRole('button', { name: new RegExp(setup.tag) }).click()

    // (3) assert: she is told it went to the other person, and by when to hand it in
    await expect(page.getByText('Decided: the item went to the other person')).toBeVisible()
    await expect(page.getByText(/please bring it to a collection point by/)).toBeVisible()
  })
})

test.describe('Suspended accounts', () => {
  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('a suspended student is told they cannot dispute before filling in the form', async ({
    page,
    request,
  }) => {
    // (1) setup: Chloe has a lost report attached, but an admin suspended her
    const setup = await makeClaimedFind(request)
    await suspendChloe(request, setup.chloeLost.id)
    await logIn(page, 'chloe')

    // (2) actions
    await page.goto(`/items/${setup.found.id}/dispute`)

    // (3) assert: no form to fill in, and why
    await expect(page.getByText("You can't dispute this item")).toBeVisible()
    await expect(page.getByText(/Your account is suspended/).last()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Submit dispute' })).toHaveCount(0)
  })
})

test.describe('Verdicts', () => {
  test.afterEach(async ({ request }) => {
    await cleanUp(request)
  })

  test('the verdict notice shows once, and stays closed once closed', async ({ page, request }) => {
    // (1) setup: an admin decided Chloe's dispute while she was away
    const setup = await makeClaimedFind(request)
    const dispute = await chloeDisputes(request, setup.found.id)
    const admin = await apiToken(request, 'admin')
    await apiPost(request, `/admin/disputes/${dispute.id}/close`, admin, {
      reason: 'Alice knew the initials engraved on the back',
    })

    // (2) actions: she signs in, sees the notice, and closes it
    await logIn(page, 'chloe')
    const notice = page.getByTestId('slide-toast')
    await expect(notice).toContainText('An admin decided')
    await notice.getByRole('button', { name: 'Close' }).click()

    // (3) assert: gone, and still gone after a reload. The account menu's
    // count of new verdicts shows once the verdicts have loaded, so by then
    // the notice would be back if it were coming back.
    await expect(notice).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: /Account: Chloe Ng, \d+ new/ })).toBeVisible()
    await expect(notice).toHaveCount(0)
  })

  test('opening a verdict clears its New verdict mark', async ({ page, request }) => {
    // (1) setup: a decided dispute Chloe has not opened yet
    const setup = await makeClaimedFind(request)
    const dispute = await chloeDisputes(request, setup.found.id)
    const admin = await apiToken(request, 'admin')
    await apiPost(request, `/admin/disputes/${dispute.id}/close`, admin, {
      reason: 'Alice knew the initials engraved on the back',
    })
    await logIn(page, 'chloe')
    await page.goto('/disputes')
    const row = page.getByRole('button', { name: new RegExp(setup.tag) })
    await expect(row).toContainText('New verdict')

    // (2) actions
    await row.click()

    // (3) assert: the verdict shows and the mark has gone, also after a reload
    await expect(page.getByText('Decided: the claim was kept')).toBeVisible()
    await expect(row).not.toContainText('New verdict')
    await page.reload()
    await expect(page.getByRole('button', { name: new RegExp(setup.tag) })).not.toContainText(
      'New verdict',
    )
  })
})
