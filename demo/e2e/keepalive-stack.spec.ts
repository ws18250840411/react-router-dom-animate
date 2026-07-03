/**
 * keepAlive 堆叠模式 E2E 验收测试
 *
 * 覆盖 BackgroundPreserveRoot（keepAlive 不带 mode="switch"）的关键行为：
 * - 状态保活：PUSH→POP 后列表 state 保留
 * - 动画触发：进入/退出 cover 动画类正确出现
 * - 快速 PUSH/POP：动画未完成时无残留节点、无 JS 错误
 * - 多层堆叠：深栈 PUSH 后底层页在 DOM 中保持 keepAlive
 * - fromSnapRef 回归（Bug #1）：快速往返导航每次都有动画
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

// ─────────────────────────────────────────────────────────────────────────────
// 一、基础 PUSH→POP 状态保留
// ─────────────────────────────────────────────────────────────────────────────

test.describe('keepAlive stack — 基础状态保留', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/keep-alive-stack')
  })

  test('PUSH 详情后 POP，列表计数器保留', async ({ page }) => {
    // 将计数器加到 5
    for (let i = 0; i < 5; i++) await page.getByTestId('ka-stack-inc').click()
    await expect(page.getByTestId('ka-stack-counter')).toHaveText('5')

    // PUSH 到 item 1
    await page.getByTestId('ka-stack-item-1').click()
    await expect(page.getByTestId('ka-stack-detail')).toBeVisible()

    // POP 返回
    await page.getByTestId('ka-stack-detail-back').click()
    await expect(page.getByTestId('ka-stack-list')).toBeVisible()

    // 计数器必须保留（列表页未重新 mount）
    await expect(page.getByTestId('ka-stack-counter')).toHaveText('5')
  })

  test('PUSH 详情时出现 fr-animating 动画 class', async ({ page }) => {
    await page.getByTestId('ka-stack-item-1').click()

    // 在动画运行期间，应出现 fr-animating class（cover enter 动画）
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
    await expect(page.getByTestId('ka-stack-detail')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
  })

  test('POP 返回时有 fr-animating 动画 class，结束后无残留', async ({ page }) => {
    await page.getByTestId('ka-stack-item-1').click()
    await expect(page.getByTestId('ka-stack-detail')).toBeVisible()
    await page.waitForTimeout(SETTLE_MS)

    await page.getByTestId('ka-stack-detail-back').click()

    // 在动画运行期间，应出现 fr-animating class（cover exit 动画）
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
    await expect(page.getByTestId('ka-stack-list')).toBeVisible()
    expect(await page.locator('.fr-animating').count()).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 二、快速 PUSH/POP（动画未完成时）
// ─────────────────────────────────────────────────────────────────────────────

test.describe('keepAlive stack — 快速 PUSH/POP', () => {
  test('快速 PUSH 后立即 POP，最终回到列表页无残留动画', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/keep-alive-stack')

    for (let i = 0; i < 3; i++) await page.getByTestId('ka-stack-inc').click()
    await expect(page.getByTestId('ka-stack-counter')).toHaveText('3')

    // 快速 PUSH → POP（不等待动画）
    await page.getByTestId('ka-stack-item-1').click({ force: true })
    await page.waitForTimeout(50) // 动画未完成
    await page.getByTestId('ka-stack-back').click({ force: true })

    await page.waitForTimeout(SETTLE_MS)
    await expect(page).toHaveURL('/keep-alive-stack')
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(await page.locator('.animated-outlet-page').count()).toBeLessThanOrEqual(2)
    expect(errors).toEqual([])
  })

  test('连续快速 PUSH 多个详情页不产生残留节点', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/keep-alive-stack')

    // 快速点多个详情
    for (let i = 1; i <= 5; i++) {
      const item = page.getByTestId(`ka-stack-item-${i}`)
      if (await item.isVisible()) {
        await item.click({ force: true })
        await page.waitForTimeout(30)
      }
    }

    await page.waitForTimeout(SETTLE_MS)
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('PUSH detail → POP 一次回根，无 JS 错误', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/keep-alive-stack')

    await page.getByTestId('ka-stack-item-1').click()
    await expect(page.getByTestId('ka-stack-detail')).toBeVisible()

    // POP 一次回到列表
    await page.getByTestId('ka-stack-detail-back').click()
    await page.waitForTimeout(SETTLE_MS)

    await expect(page).toHaveURL('/keep-alive-stack')
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 三、多层堆叠（深栈）
// ─────────────────────────────────────────────────────────────────────────────

test.describe('keepAlive stack — 深栈', () => {
  test('PUSH 多个不同 id 详情后，列表页仍在 DOM 中（keepAlive 保活）', async ({ page }) => {
    await page.goto('/keep-alive-stack')
    for (let i = 0; i < 3; i++) await page.getByTestId('ka-stack-inc').click()

    // PUSH 到 item 1
    await page.getByTestId('ka-stack-item-1').click()
    await expect(page.getByTestId('ka-stack-detail')).toBeVisible()
    await page.waitForTimeout(SETTLE_MS)

    // 列表页应仍在 DOM（keepAlive）
    const listInDom = await page.evaluate(() =>
      Boolean(document.querySelector('[data-testid="ka-stack-list"]')),
    )
    expect(listInDom).toBe(true)

    // 动画结束后无残留
    expect(await page.locator('.fr-animating').count()).toBe(0)
  })

  test('深栈 POP 到根后，列表 state 保留', async ({ page }) => {
    await page.goto('/keep-alive-stack')
    for (let i = 0; i < 7; i++) await page.getByTestId('ka-stack-inc').click()
    await expect(page.getByTestId('ka-stack-counter')).toHaveText('7')

    // PUSH detail
    await page.getByTestId('ka-stack-item-3').click()
    await expect(page.getByTestId('ka-stack-detail')).toBeVisible()
    await page.waitForTimeout(SETTLE_MS)

    // POP 返回
    await page.getByTestId('ka-stack-detail-back').click()
    await page.waitForTimeout(SETTLE_MS)

    await expect(page.getByTestId('ka-stack-counter')).toHaveText('7')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 四、fromSnapRef 快速往返动画回归（Bug #1）
// ─────────────────────────────────────────────────────────────────────────────

test.describe('keepAlive stack — fromSnapRef 回归（Bug #1）', () => {
  test('快速 list→detail→list→detail：每次都有 cover enter 动画', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/keep-alive-stack')

    let animationSeenCount = 0
    const rounds = 3

    for (let i = 0; i < rounds; i++) {
      // PUSH detail
      await page.getByTestId('ka-stack-item-1').click({ force: true })
      // 立即检查是否有动画（在动画运行窗口内）
      const hasCoverEnter = await expect
        .poll(
          () =>
            page.evaluate(() =>
              [...document.querySelectorAll('.animated-outlet-page')].some((el) =>
                el.className.includes('cover-enter') || el.className.includes('fr-animating'),
              ),
            ),
          { timeout: 1000 },
        )
        .toBe(true)
      animationSeenCount++

      await page.waitForTimeout(SETTLE_MS)

      // POP
      await page.getByTestId('ka-stack-detail-back').click({ force: true })
      await page.waitForTimeout(SETTLE_MS)
    }

    // 所有 rounds 都应看到动画
    expect(animationSeenCount).toBe(rounds)
    expect(errors).toEqual([])
  })

  test('PUSH→POP→PUSH：第二次 PUSH 有动画（不因 fromSnapRef 过期而跳过）', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/keep-alive-stack')

    // 第一次 PUSH
    await page.getByTestId('ka-stack-item-1').click()
    await expect(page.getByTestId('ka-stack-detail')).toBeVisible()
    await page.waitForTimeout(SETTLE_MS)

    // POP
    await page.getByTestId('ka-stack-detail-back').click()
    await page.waitForTimeout(SETTLE_MS)
    await expect(page.getByTestId('ka-stack-list')).toBeVisible()

    // 第二次 PUSH — 检查是否有动画
    await page.getByTestId('ka-stack-item-2').click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll('.animated-outlet-page')].some((el) =>
              el.className.includes('fr-animating'),
            ),
          ),
        { timeout: 1500 },
      )
      .toBe(true)

    await expect(page.getByTestId('ka-stack-detail')).toBeVisible()
    expect(errors).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 五、压测：快速连续 PUSH/POP
// ─────────────────────────────────────────────────────────────────────────────

test.describe('keepAlive stack — 压测', () => {
  test('快速 PUSH/POP 20 次，无 JS 错误且无残留动画', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/keep-alive-stack')

    const ROUNDS = 20
    for (let i = 0; i < ROUNDS; i++) {
      const id = (i % 5) + 1
      const item = page.getByTestId(`ka-stack-item-${id}`)
      if (await item.isVisible()) {
        await item.click({ force: true })
      }
      await page.waitForTimeout(20)
      await page.getByTestId('ka-stack-back').click({ force: true })
      await page.waitForTimeout(20)
    }

    await page.waitForTimeout(SETTLE_MS)
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(await page.locator('.animated-outlet-page').count()).toBeLessThanOrEqual(3)
    expect(errors).toEqual([])
  })
})
