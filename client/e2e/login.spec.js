// The sign-in page's lion: it shuts its eyes while the password is shown.
import { test, expect } from '@playwright/test'

test.describe('Sign-in mascot', () => {
  test('the lion shuts its eyes while the password is shown', async ({ page }) => {
    // (1) setup
    await page.goto('/login')
    await page.getByRole('textbox', { name: 'Password' }).fill('FoundIt-demo-1')
    const lion = page.getByTestId('mascot')
    await expect(lion).toHaveAttribute('data-eyes', 'open')

    // (2) actions: show the password
    await page.getByRole('button', { name: 'Show password' }).click()

    // (3) assert: eyes shut, password readable; hiding it opens them again
    await expect(lion).toHaveAttribute('data-eyes', 'closed')
    await expect(page.getByRole('textbox', { name: 'Password' })).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide password' }).click()
    await expect(lion).toHaveAttribute('data-eyes', 'open')
  })

  test('the lion keeps its eyes shut on a phone too', async ({ page }) => {
    // (1) setup: grading starts at 375px wide
    await page.setViewportSize({ width: 375, height: 760 })
    await page.goto('/login')

    // (2) actions
    await page.getByRole('button', { name: 'Show password' }).click()

    // (3) assert
    await expect(page.getByTestId('mascot')).toHaveAttribute('data-eyes', 'closed')
    await expect(page.getByTestId('mascot')).toBeVisible()
  })
})
