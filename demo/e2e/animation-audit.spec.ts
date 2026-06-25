import { expect, test } from '@playwright/test'

test('push 与 wrap Fade 均有转场类', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('push-fade').click()
  await expect.poll(() => page.locator('.fr-animating').count(), { timeout: 2000 }).toBeGreaterThan(0)
  await page.getByTestId('back').click()
  await expect(page).toHaveURL('/')

  await page.getByTestId('link-fade').click()
  await expect.poll(() => page.locator('.fr-animating').count(), { timeout: 2000 }).toBeGreaterThan(0)
  await page.getByTestId('back').click()
  await expect(page).toHaveURL('/')
})

test('wrap Modal 落定 fr-modal', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('link-modal').click()
  await page.waitForTimeout(350)
  await expect(page.locator('.animated-outlet-page.fr-modal')).toBeVisible()
})
