import { test, expect } from '@playwright/test'

test('smoke @smoke', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Patchbay/i)
})


