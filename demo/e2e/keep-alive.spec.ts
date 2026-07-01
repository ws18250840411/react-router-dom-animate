import { expect, test } from '@playwright/test'

test.describe('KeepAlive — React Activity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keep-alive/a')
  })

  // ── 1. 基础状态保留 ──────────────────────────────────────────────────────

  test('Tab A 计数器切走再切回后保留', async ({ page }) => {
    // increment twice
    await page.getByTestId('ka-inc').click()
    await page.getByTestId('ka-inc').click()
    await expect(page.getByTestId('ka-counter')).toHaveText('2')

    // switch to Tab B
    await page.getByTestId('ka-tab-link-b').click()
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()

    // switch back to Tab A — counter must still be 2
    await page.getByTestId('ka-tab-link-a').click()
    await expect(page.getByTestId('ka-counter')).toHaveText('2')
  })

  test('Tab B 文本输入切走再切回后保留', async ({ page }) => {
    await page.getByTestId('ka-tab-link-b').click()
    await page.getByTestId('ka-input').fill('hello keepAlive')
    await expect(page.getByTestId('ka-input')).toHaveValue('hello keepAlive')

    // switch to Tab A then back
    await page.getByTestId('ka-tab-link-a').click()
    await page.getByTestId('ka-tab-link-b').click()
    await expect(page.getByTestId('ka-input')).toHaveValue('hello keepAlive')
  })

  test('多次 A↔B 互切，状态始终保留', async ({ page }) => {
    // A: count = 5
    for (let i = 0; i < 5; i++) await page.getByTestId('ka-inc').click()
    // B: type something
    await page.getByTestId('ka-tab-link-b').click()
    await page.getByTestId('ka-input').fill('persistent')
    // back and forth × 3
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('ka-tab-link-a').click()
      await expect(page.getByTestId('ka-counter')).toHaveText('5')
      await page.getByTestId('ka-tab-link-b').click()
      await expect(page.getByTestId('ka-input')).toHaveValue('persistent')
    }
  })

  // ── 2. 命令式 API ─────────────────────────────────────────────────────────

  test('aliveRef.remove() 清除指定路由缓存后状态重置', async ({ page }) => {
    // increment on Tab A
    await page.getByTestId('ka-inc').click()
    await page.getByTestId('ka-inc').click()
    await expect(page.getByTestId('ka-counter')).toHaveText('2')

    // switch to Tab B so Tab A becomes background
    await page.getByTestId('ka-tab-link-b').click()
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()

    // click "清 A" — removes /keep-alive/a from cache and navigates back
    await page.getByTestId('ka-remove-a').click()
    await expect(page).toHaveURL('/keep-alive/a')

    // Tab A should be remounted → counter back to 0
    await expect(page.getByTestId('ka-counter')).toHaveText('0')
  })

  test('aliveRef.removeAll() 清除所有缓存', async ({ page }) => {
    // build up state on both tabs
    await page.getByTestId('ka-inc').click()
    await page.getByTestId('ka-tab-link-b').click()
    await page.getByTestId('ka-input').fill('will be cleared')
    await page.getByTestId('ka-tab-link-a').click()

    // removeAll — only affects hidden pages (B). A stays because it's active.
    await page.getByTestId('ka-remove-all').click()

    // switch to B → it should have been remounted
    await page.getByTestId('ka-tab-link-b').click()
    await expect(page.getByTestId('ka-input')).toHaveValue('')
  })

  // ── 3. 滚动位置保留 ───────────────────────────────────────────────────────

  test('Tab A 内嵌滚动区域切走再切回后位置保留', async ({ page }) => {
    const scrollArea = page.getByTestId('ka-scroll-area')

    // scroll the inner overflow container to the bottom
    await scrollArea.evaluate((el) => { el.scrollTop = el.scrollHeight })
    const scrollTopBefore = await scrollArea.evaluate((el) => el.scrollTop)
    expect(scrollTopBefore).toBeGreaterThan(0)

    // switch to Tab B (saves Tab A scroll) then back to Tab A (restores it)
    await page.getByTestId('ka-tab-link-b').click()
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()
    await page.getByTestId('ka-tab-link-a').click()
    // wait for Activity + useLayoutEffect to complete the restore
    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    await page.waitForTimeout(50)

    const scrollTopAfter = await scrollArea.evaluate((el) => el.scrollTop)
    expect(scrollTopAfter).toBeGreaterThan(0)
    expect(scrollTopAfter).toBeCloseTo(scrollTopBefore, -1)
  })

  // ── 4. Tab C — 三个 Tab 并存 ─────────────────────────────────────────────

  test('三 Tab 并存状态各自独立', async ({ page }) => {
    // Tab A: count = 3
    for (let i = 0; i < 3; i++) await page.getByTestId('ka-inc').click()

    // Tab B: text
    await page.getByTestId('ka-tab-link-b').click()
    await page.getByTestId('ka-input').fill('tab-b-value')

    // Tab C: count = 4 (click the + button inside ka-tab-c)
    await page.getByTestId('ka-tab-link-c').click()
    await expect(page.getByTestId('ka-tab-c')).toBeVisible()
    const tabCInc = page.getByTestId('ka-tab-c').getByRole('button', { name: '+' })
    for (let i = 0; i < 4; i++) await tabCInc.click()
    await expect(page.getByTestId('ka-counter-c')).toHaveText('4')

    // verify Tab A and Tab B are still correct
    await page.getByTestId('ka-tab-link-a').click()
    await expect(page.getByTestId('ka-counter')).toHaveText('3')

    await page.getByTestId('ka-tab-link-b').click()
    await expect(page.getByTestId('ka-input')).toHaveValue('tab-b-value')
  })
})
