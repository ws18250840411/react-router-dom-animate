/**
 * keepAlive switch + include/exclude E2E 测试
 *
 * 验证 `exclude` prop 使特定路由在离开后被销毁（下次进入重新 mount），
 * 而未被排除的路由状态正常保留。
 *
 * Demo 路由：/keep-alive-filter
 *   - Tab A（/keep-alive-filter/a）：正常缓存
 *   - Tab B（/keep-alive-filter/b）：exclude 排除，离开后销毁
 *   - Tab C（/keep-alive-filter/c）：正常缓存
 */
import { expect, test } from '@playwright/test'

const SETTLE_MS = 450

test.describe('keepAlive switch + exclude — B 页面不缓存', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keep-alive-filter')
    await expect(page.getByTestId('kf-page-a')).toBeVisible()
  })

  test('A 页面正常缓存：离开再回来 state 保留', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    // 在 A 页面增加计数
    await page.getByTestId('kf-page-a-inc').click()
    await page.getByTestId('kf-page-a-inc').click()
    await expect(page.getByTestId('kf-page-a-count')).toHaveText('2')

    // 切到 B
    await page.getByTestId('kf-tab-link-b').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('kf-page-b')).toBeVisible()

    // 切回 A
    await page.getByTestId('kf-tab-link-a').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('kf-page-a')).toBeVisible()

    // state 保留
    await expect(page.getByTestId('kf-page-a-count')).toHaveText('2')
    expect(errors).toEqual([])
  })

  test('B 页面被 exclude：切走后 DOM 移除，再回来 state 重置', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    // 切到 B，修改计数
    await page.getByTestId('kf-tab-link-b').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('kf-page-b')).toBeVisible()
    await page.getByTestId('kf-page-b-inc').click()
    await page.getByTestId('kf-page-b-inc').click()
    await expect(page.getByTestId('kf-page-b-count')).toHaveText('2')

    // 切走（A），B 应从 DOM 移除（关键断言）
    await page.getByTestId('kf-tab-link-a').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.locator('[data-testid="kf-page-b"]')).toHaveCount(0)

    // 再回 B，state 应已重置（新实例）
    await page.getByTestId('kf-tab-link-b').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('kf-page-b')).toBeVisible()
    await expect(page.getByTestId('kf-page-b-count')).toHaveText('0')
    expect(errors).toEqual([])
  })

  test('C 页面正常缓存（未被 exclude）：state 保留', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    // 切到 C，增加计数
    await page.getByTestId('kf-tab-link-c').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('kf-page-c')).toBeVisible()
    await page.getByTestId('kf-page-c-inc').click()
    await expect(page.getByTestId('kf-page-c-count')).toHaveText('1')

    // 切到 B，再切回 C
    await page.getByTestId('kf-tab-link-b').click()
    await page.waitForTimeout(SETTLE_MS)
    await page.getByTestId('kf-tab-link-c').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('kf-page-c')).toBeVisible()

    // C 的 state 保留
    await expect(page.getByTestId('kf-page-c-count')).toHaveText('1')
    expect(errors).toEqual([])
  })

  test('A→B→A→B 切换：B 每次 state 重置，无残留动画', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    // 第一次访问 B，增加计数
    await page.getByTestId('kf-tab-link-b').click()
    await page.waitForTimeout(SETTLE_MS)
    await page.getByTestId('kf-page-b-inc').click()
    await expect(page.getByTestId('kf-page-b-count')).toHaveText('1')

    // 切走 A，B 应从 DOM 移除
    await page.getByTestId('kf-tab-link-a').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.locator('[data-testid="kf-page-b"]')).toHaveCount(0)

    // 第二次进入 B，state 应重置（新实例）
    await page.getByTestId('kf-tab-link-b').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('kf-page-b')).toBeVisible()
    await expect(page.getByTestId('kf-page-b-count')).toHaveText('0')

    // 无残留动画 class
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })
})
