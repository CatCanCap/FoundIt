// Accounts and access testing

import { test, expect } from '@playwright/test'
import { ACCOUNTS, newSmuEmail, expectNoSideScroll } from './helpers'

const PASSWORD = 'E2E-password-1'

// Signing up hashes the password and sends the code email before it answers,
// and the shared test database can take several seconds a request, so waits
// for the server get longer than the usual 5 seconds
const LOAD = { timeout: 20 * 1000 }
test.describe.configure({ timeout: 90 * 1000 })

// Fills the sign-up form and sends it
async function signUp(page, email) {
  await page.goto('/register')
  await page.getByTestId('register-name').fill('E2E Tester')
  await page.getByTestId('register-email').fill(email)
  await page.getByTestId('register-password').fill(PASSWORD)
  await page.getByTestId('register-confirm').fill(PASSWORD)
  await page.getByTestId('register-submit').click()
}

test.describe('Signing in and out', () => {
  test('a wrong password is refused, the right one signs in, and signing out locks pages again', async ({
    page,
  }) => {
    // (1) setup: Alice's demo account
    const alice = ACCOUNTS.alice
    await page.goto('/login')
    await expectNoSideScroll(page)

    // (2) actions: a wrong password first
    await page.getByTestId('login-email').fill(alice.email)
    await page.getByTestId('login-password').fill('not-her-password')
    await page.getByTestId('login-submit').click()

    // (3) assert: refused, still on the sign-in page
    await expect(page.getByTestId('login-error')).toBeVisible(LOAD)
    await expect(page).toHaveURL(/\/login/)

    // (2) actions: the right password
    await page.getByTestId('login-password').fill(alice.password)
    await page.getByTestId('login-submit').click()

    // (3) assert: signed in and on the feed
    await expect(page).toHaveURL(/\/feed/)
    await expect(page.getByTestId('header-avatar')).toBeVisible()

    // (2) actions: sign out, then try a page that needs signing in
    await page.getByTestId('header-avatar').click()
    await page.getByTestId('header-logout').click()
    await page.goto('/matches')

    // (3) assert: sent to sign in
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId('login-form')).toBeVisible()
  })

  test('a signed-out visitor is sent to sign in, then back to the page they wanted', async ({
    page,
  }) => {
    // (1) setup: nobody is signed in
    const alice = ACCOUNTS.alice

    // (2) actions
    await page.goto('/matches')

    // (3) assert: sent to sign in, remembering where they were going
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)matches/)

    // (2) actions: sign in on that page
    await page.getByTestId('login-email').fill(alice.email)
    await page.getByTestId('login-password').fill(alice.password)
    await page.getByTestId('login-submit').click()

    // (3) assert: straight on to Matches
    await expect(page).toHaveURL(/\/matches$/)
    await expectNoSideScroll(page)
  })
})

test.describe('Signing up', () => {
  test('a new account is held at the code page and is not signed in yet', async ({ page }) => {
    // (1) setup: a new address
    const email = newSmuEmail()

    // (2) actions
    await signUp(page, email)

    // (3) assert: on the code page for that address
    await expect(page).toHaveURL(/\/verify-email/, LOAD)
    await expect(page.getByTestId('verify-form')).toBeVisible()
    await expect(page.getByTestId('verify-code')).toBeVisible()
    await expectNoSideScroll(page)

    // (2) actions: try to report a find before entering the code
    await page.goto('/report/found')

    // (3) assert: not signed in, so the report form never shows
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId('report-form')).toHaveCount(0)
  })

  test('a non-SMU email, or one with a + part, is refused', async ({ page }) => {
    // (1) setup: a Gmail address
    const gmail = `e2e.${Date.now()}@gmail.com`

    // (2) actions
    await signUp(page, gmail)

    // (3) assert: refused in the form, under the email box
    await expect(page).toHaveURL(/\/register/)
    await expect(page.getByTestId('register-email')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('register-email')).toHaveAccessibleDescription(/SMU email/)
    await expectNoSideScroll(page)

    // (2) actions: an SMU address with a + part, which the server refuses
    await page.getByTestId('register-email').fill(newSmuEmail().replace('@', '+1@'))
    await page.getByTestId('register-submit').click()

    // (3) assert
    await expect(page.getByTestId('register-error')).toBeVisible(LOAD)
    await expect(page.getByTestId('register-error')).toContainText('+')
    await expect(page).toHaveURL(/\/register/)

    // (2) actions: no account was made, so the Gmail address cannot sign in
    await page.goto('/login')
    await page.getByTestId('login-email').fill(gmail)
    await page.getByTestId('login-password').fill(PASSWORD)
    await page.getByTestId('login-submit').click()

    // (3) assert: still signed out, on the sign-in page
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId('header-avatar')).toHaveCount(0)
  })

  test('a wrong email code is refused', async ({ page }) => {
    // (1) setup: a new account waiting for its code
    await signUp(page, newSmuEmail())
    await expect(page).toHaveURL(/\/verify-email/, LOAD)

    // (2) actions
    await page.getByTestId('verify-code').fill('000000')
    await page.getByTestId('verify-submit').click()

    // (3) assert: refused, and still not signed in
    await expect(page.getByTestId('verify-error')).toBeVisible(LOAD)
    await expect(page).toHaveURL(/\/verify-email/, LOAD)
    await page.goto('/report/found')
    await expect(page).toHaveURL(/\/login/)
  })
})
