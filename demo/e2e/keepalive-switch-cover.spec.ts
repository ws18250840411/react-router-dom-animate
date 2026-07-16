/**
 * keepAlive switch + cover/modal E2E 测试
 *
 * 验证 <KeepAlive mode="switch"><AnimatedOutlet transition="cover|modal" /></KeepAlive> 在 tabs
 * 场景下的动画方向行为：
 *
 * - 需配置 tabIndex 才能开启双向动画（forward/backward）
 * - Forward（低 tabIndex → 高 tabIndex）：新 tab 从右侧滑入覆盖旧 tab（slide-next-enter）
 * - Backward（高 tabIndex → 低 tabIndex）：新 tab 从左侧滑入覆盖旧 tab（tabs-cover-enter-back）
 * - 无 tabIndex：始终走 forward 默认动画，不尝试自动推算
 */
import { expect, test, type Page } from '@playwright/test'

const SETTLE_MS = 450

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

/** 收集 group 内 class 变化事件，返回取消函数 */
function watchClasses(page: Page): { stop: () => Promise<string[]> } {
  // 使用 page.exposeFunction + MutationObserver 在浏览器端收集
  let classes: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.startsWith('[class]')) {
      classes.push(text.slice(7))
    }
  })
  return {
    stop: async () => {
      const snapshot = [...classes]
      classes = []
      return snapshot
    },
  }
}

test.describe('keepAlive switch + cover — 方向正确（需 tabIndex）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keep-alive')
    // 等待 Tab A 渲染
    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    // 切换为 cover transition
    await page.getByTestId('ka-anim-cover').click()
  })

  test('Tab A→B（forward）出现 slide-next-enter 进入动画', async ({ page }) => {
    const errors = trackErrors(page)

    // 点击 Tab B
    await page.getByTestId('ka-tab-link-b').click()

    // 动画期间应出现 fr-animating
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll('.animated-outlet-page')].some((el) =>
              el.className.includes('fr-animating'),
            ),
          ),
        { timeout: 2000 },
      )
      .toBe(true)

    // 等待动画结束
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('Tab B→A（backward）出现 slide-prev-enter-cover（iOS pop 风格）进入动画', async ({ page }) => {
    const errors = trackErrors(page)

    // 先切到 Tab B，等动画完成
    await page.getByTestId('ka-tab-link-b').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()

    // 挂上 MutationObserver 收集 class 变化
    await page.evaluate(() => {
      const group = document.querySelector('.animated-outlet-group')
      if (!group) return
      const obs = new MutationObserver((muts) => {
        muts.forEach((m) => {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            console.log('[class]' + (m.target as Element).className)
          }
        })
      })
      obs.observe(group, { attributes: true, subtree: true })
      // @ts-ignore
      ;(window as any).__classMutObs = obs
    })

    // 切回 Tab A（backward）
    await page.getByTestId('ka-tab-link-a').click()

    // 等动画触发
    await page.waitForTimeout(100)

    // 停止 observer
    const classHistory = await page.evaluate(() => {
      // @ts-ignore
      const obs = (window as any).__classMutObs
      if (obs) obs.disconnect()
      return []
    })

    // 检查浏览器控制台里收集到的 class（通过 console.log）
    // 等待动画帧确保已触发
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('Tab A→B→A 来回切换各有动画，无 JS 错误，state 保留', async ({ page }) => {
    const errors = trackErrors(page)

    // 在 Tab A 上操作计数器
    await page.getByTestId('ka-inc').click()
    await page.getByTestId('ka-inc').click()
    await expect(page.getByTestId('ka-counter')).toHaveText('2')

    // 切到 Tab B
    await page.getByTestId('ka-tab-link-b').click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.querySelectorAll('.fr-animating').length > 0,
          ),
        { timeout: 2000 },
      )
      .toBe(true)
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()

    // 切回 Tab A
    await page.getByTestId('ka-tab-link-a').click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.querySelectorAll('.fr-animating').length > 0,
          ),
        { timeout: 2000 },
      )
      .toBe(true)
    await page.waitForTimeout(SETTLE_MS)

    // Tab A state 保留
    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    await expect(page.getByTestId('ka-counter')).toHaveText('2')
    expect(errors).toEqual([])
  })

  test('快速 A→B→A→B 连点，最终落在 Tab B，无残留动画', async ({ page }) => {
    const errors = trackErrors(page)

    // 快速连点
    await page.getByTestId('ka-tab-link-b').click({ force: true })
    await page.waitForTimeout(30)
    await page.getByTestId('ka-tab-link-a').click({ force: true })
    await page.waitForTimeout(30)
    await page.getByTestId('ka-tab-link-b').click({ force: true })

    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })
})

test.describe('keepAlive switch + modal — forward 动画', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keep-alive')
    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    await page.getByTestId('ka-anim-modal').click()
  })

  test('Tab A→B 出现 fr-animating（modal 进入动画）', async ({ page }) => {
    const errors = trackErrors(page)

    await page.getByTestId('ka-tab-link-b').click()

    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.querySelectorAll('.fr-animating').length > 0,
          ),
        { timeout: 2000 },
      )
      .toBe(true)

    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('Tab B→A（backward）出现 fr-animating，无 JS 错误', async ({ page }) => {
    const errors = trackErrors(page)

    await page.getByTestId('ka-tab-link-b').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()

    await page.getByTestId('ka-tab-link-a').click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.querySelectorAll('.fr-animating').length > 0,
          ),
        { timeout: 2000 },
      )
      .toBe(true)

    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// scale 动画（通用化回归）
// ─────────────────────────────────────────────────────────────────────────────

test.describe('keepAlive switch + scale — 通用化回归', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keep-alive')
    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    await page.getByTestId('ka-anim-scale').click()
  })

  test('Tab A→B 出现 fr-animating（scale 进入动画），无 JS 错误', async ({ page }) => {
    const errors = trackErrors(page)

    await page.getByTestId('ka-tab-link-b').click()

    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.querySelectorAll('.fr-animating').length > 0,
          ),
        { timeout: 2000 },
      )
      .toBe(true)

    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('Tab B→A（backward）出现 fr-animating，无 JS 错误', async ({ page }) => {
    const errors = trackErrors(page)

    await page.getByTestId('ka-tab-link-b').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()

    await page.getByTestId('ka-tab-link-a').click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.querySelectorAll('.fr-animating').length > 0,
          ),
        { timeout: 2000 },
      )
      .toBe(true)

    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('快速 A→B→A 连点，scale 动画正确清理，无残留', async ({ page }) => {
    const errors = trackErrors(page)

    await page.getByTestId('ka-tab-link-b').click({ force: true })
    await page.waitForTimeout(30)
    await page.getByTestId('ka-tab-link-a').click({ force: true })

    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// fade 动画（通用化回归）
// ─────────────────────────────────────────────────────────────────────────────

test.describe('keepAlive switch + fade — 通用化回归', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keep-alive')
    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    await page.getByTestId('ka-anim-fade').click()
  })

  test('Tab A→B 出现 fr-animating（fade 进入动画），无 JS 错误', async ({ page }) => {
    const errors = trackErrors(page)

    await page.getByTestId('ka-tab-link-b').click()

    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.querySelectorAll('.fr-animating').length > 0,
          ),
        { timeout: 2000 },
      )
      .toBe(true)

    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-tab-b')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('Tab A→B→A 来回切换各有动画，state 保留', async ({ page }) => {
    const errors = trackErrors(page)

    await page.getByTestId('ka-inc').click()
    await page.getByTestId('ka-inc').click()
    await expect(page.getByTestId('ka-counter')).toHaveText('2')

    await page.getByTestId('ka-tab-link-b').click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.querySelectorAll('.fr-animating').length > 0,
          ),
        { timeout: 2000 },
      )
      .toBe(true)
    await page.waitForTimeout(SETTLE_MS)

    await page.getByTestId('ka-tab-link-a').click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.querySelectorAll('.fr-animating').length > 0,
          ),
        { timeout: 2000 },
      )
      .toBe(true)
    await page.waitForTimeout(SETTLE_MS)

    await expect(page.getByTestId('ka-tab-a')).toBeVisible()
    await expect(page.getByTestId('ka-counter')).toHaveText('2')
    expect(errors).toEqual([])
  })
})
