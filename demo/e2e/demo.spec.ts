import { expect, test } from '@playwright/test'

test.describe('首页 JS vs Link', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('Detail 全局默认 cover', async ({ page }) => {
    await page.getByTestId('push-detail').click()
    await expect(page).toHaveURL('/push/detail')
    await expect(page.getByTestId('detail-page-transition')).toContainText('cover')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')

    await page.getByTestId('link-detail').click()
    await expect(page).toHaveURL('/wrap/detail')
    await expect(page.getByTestId('detail-page-transition')).toContainText('cover')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')
  })

  test('Cover 显式推入', async ({ page }) => {
    await page.getByTestId('push-cover').click()
    await expect(page).toHaveURL('/push/cover')
    await expect(page.getByTestId('cover-page-transition')).toContainText('cover')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')

    await page.getByTestId('link-cover').click()
    await expect(page).toHaveURL('/wrap/cover')
    await expect(page.getByTestId('cover-page-transition')).toContainText('cover')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')
  })

  test('Slide 平移', async ({ page }) => {
    await page.getByTestId('push-slide').click()
    await expect(page).toHaveURL('/push/slide')
    await expect(page.getByTestId('slide-page-transition')).toContainText('slide')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')

    await page.getByTestId('link-slide').click()
    await expect(page).toHaveURL('/wrap/slide')
    await expect(page.getByTestId('slide-page-transition')).toContainText('slide')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')
  })

  test('Scale 放大', async ({ page }) => {
    await page.getByTestId('push-scale').click()
    await expect(page).toHaveURL('/push/scale')
    await expect(page.getByTestId('scale-page-transition')).toContainText('scale')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')

    await page.getByTestId('link-scale').click()
    await expect(page).toHaveURL('/wrap/scale')
    await expect(page.getByTestId('scale-page-transition')).toContainText('scale')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')
  })

  test('Fade 淡入淡出', async ({ page }) => {
    await page.getByTestId('push-fade').click()
    await expect(page).toHaveURL('/push/fade')
    await expect(page.getByTestId('fade-page-transition')).toContainText('fade')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')

    await page.getByTestId('link-fade').click()
    await expect(page).toHaveURL('/wrap/fade')
    await expect(page.getByTestId('fade-page-transition')).toContainText('fade')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')
  })

  test('Modal', async ({ page }) => {
    await page.getByTestId('push-modal').click()
    await expect(page).toHaveURL('/push/modal')
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')

    await page.getByTestId('link-modal').click()
    await expect(page).toHaveURL('/wrap/modal')
    await expect(page.locator('.animated-outlet-page.fr-modal')).toBeVisible()
    await page.getByTestId('back').click()
    await expect(page).toHaveURL('/')
  })

  test('Tabs A↔B', async ({ page }) => {
    await page.getByTestId('push-tabs').click()
    await expect(page.getByTestId('tab-a-page')).toBeVisible()
    await page.getByTestId('tab-link-b').last().click()
    await expect(page.getByTestId('tab-b-page')).toBeVisible()
    await page.getByTestId('back-tabs').first().click()
    await expect(page).toHaveURL('/')

    await page.getByTestId('link-tabs').click()
    await expect(page.getByTestId('tab-a-page')).toBeVisible()
    await page.getByTestId('tab-link-b').last().click()
    await expect(page.getByTestId('tab-b-page')).toBeVisible()
  })

  test('Tabs 重复点击当前 Tab 不堆栈', async ({ page }) => {
    await page.getByTestId('push-tabs').click()
    await expect(page).toHaveURL('/push/tabs/a')
    await page.getByTestId('tab-link-a').last().click()
    await page.getByTestId('tab-link-a').last().click()
    await page.getByTestId('tab-link-a').last().click()
    await expect(page).toHaveURL('/push/tabs/a')
    await expect(page.getByTestId('tab-a-page')).toBeVisible()
    await expect(page.locator('.animated-outlet-page.fr-animating')).toHaveCount(0)
  })
})
