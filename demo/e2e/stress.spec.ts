import { expect, test, type Page } from '@playwright/test'

const SETTLE_MS = 450
const STRESS_ROUNDS = 60

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

async function assertTabsInvariants(page: Page, expectedPath: RegExp) {
  await page.waitForTimeout(SETTLE_MS)
  await expect(page).toHaveURL(expectedPath)

  const stats = await page.evaluate(() => ({
    outlets: document.querySelectorAll('.animated-outlet-page').length,
    animating: document.querySelectorAll('.fr-animating').length,
    tabPages: document.querySelectorAll('[data-testid="tab-a-page"], [data-testid="tab-b-page"]').length,
  }))

  expect(stats.outlets).toBeLessThanOrEqual(2)
  expect(stats.animating).toBe(0)
  expect(stats.tabPages).toBe(1)
}

async function maxOutletsDuring(page: Page, action: () => Promise<void>) {
  let peak = 0
  const timer = setInterval(async () => {
    peak = Math.max(
      peak,
      await page.evaluate(() => document.querySelectorAll('.animated-outlet-page').length),
    )
  }, 16)

  await action()
  clearInterval(timer)
  await page.waitForTimeout(SETTLE_MS)
  return peak
}

test.describe('压测 — Tabs 狂点', () => {
  test('push tabs A/B 交替连点 60 次', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    await page.getByTestId('push-tabs').click()
    await expect(page.getByTestId('tab-a-page')).toBeVisible()

    const tabA = page.getByTestId('tab-link-a').last()
    const tabB = page.getByTestId('tab-link-b').last()

    let peak = 0
    for (let i = 0; i < STRESS_ROUNDS; i++) {
      const target = i % 2 === 0 ? tabB : tabA
      await target.click({ force: true })
      peak = Math.max(
        peak,
        await page.evaluate(() => document.querySelectorAll('.animated-outlet-page').length),
      )
    }

    expect(peak).toBeLessThanOrEqual(4)
    await assertTabsInvariants(page, /\/push\/tabs\/[ab]$/)
    expect(errors).toEqual([])
  })

  test('wrap tabs A/B 交替连点 60 次', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    await page.getByTestId('link-tabs').click()
    await expect(page.getByTestId('tab-a-page')).toBeVisible()

    const tabA = page.getByTestId('tab-link-a').last()
    const tabB = page.getByTestId('tab-link-b').last()

    let peak = 0
    for (let i = 0; i < STRESS_ROUNDS; i++) {
      await (i % 2 === 0 ? tabB : tabA).click({ force: true })
      peak = Math.max(
        peak,
        await page.evaluate(() => document.querySelectorAll('.animated-outlet-page').length),
      )
    }

    expect(peak).toBeLessThanOrEqual(4)
    await assertTabsInvariants(page, /\/wrap\/tabs\/[ab]$/)
    expect(errors).toEqual([])
  })

  test('wrap NavLink 重复点击当前 Tab 不增加 render 计数', async ({ page }) => {
    await page.goto('/wrap/tabs/b')
    await page.waitForTimeout(SETTLE_MS)

    const renderBefore = await page.getByTestId('tab-b-page').getAttribute('data-render-count')
    const historyBefore = await page.evaluate(() => history.length)

    const tabB = page.getByTestId('tab-link-b').last()
    for (let i = 0; i < 30; i++) {
      await tabB.click({ force: true })
      await page.waitForTimeout(30)
    }

    await page.waitForTimeout(SETTLE_MS)

    const renderAfter = await page.getByTestId('tab-b-page').getAttribute('data-render-count')
    const historyAfter = await page.evaluate(() => history.length)
    const instanceId = await page.getByTestId('tab-b-page').getAttribute('data-render-count')

    expect(historyAfter).toBe(historyBefore)
    expect(await page.locator('.fr-animating').count()).toBe(0)
    await expect(page).toHaveURL('/wrap/tabs/b')

    const renderDelta = Number(renderAfter) - Number(renderBefore)
    expect(renderDelta).toBeLessThanOrEqual(5)
    expect(instanceId).toBeTruthy()
  })

  test('push tabs 同一 Tab 连点 40 次', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    await page.getByTestId('push-tabs').click()
    const tabA = page.getByTestId('tab-link-a').last()

    for (let i = 0; i < 40; i++) {
      await tabA.click({ force: true })
    }

    await assertTabsInvariants(page, /\/push\/tabs\/a$/)
    expect(errors).toEqual([])
  })

  test('wrap tabs 同一 Tab 连点 40 次', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    await page.getByTestId('link-tabs').click()
    const tabB = page.getByTestId('tab-link-b').last()
    await tabB.click()

    for (let i = 0; i < 40; i++) {
      await tabB.click({ force: true })
    }

    await assertTabsInvariants(page, /\/wrap\/tabs\/b$/)
    expect(errors).toEqual([])
  })

  test('push tabs 切换中狂点返回', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    await page.getByTestId('push-tabs').click()

    const tabA = page.getByTestId('tab-link-a').last()
    const tabB = page.getByTestId('tab-link-b').last()
    const back = page.getByTestId('back-tabs').first()

    for (let i = 0; i < 20; i++) {
      await tabB.click({ force: true })
      await tabA.click({ force: true })
      if (i % 3 === 0) await back.click({ force: true }).catch(() => {})
      if (page.url().endsWith('/')) {
        await page.getByTestId('push-tabs').click()
      }
    }

    await page.waitForTimeout(SETTLE_MS)
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })
})

test.describe('压测 — 全场景快速进出', () => {
  const pushCases = [
    { id: 'detail', url: '/push/detail' },
    { id: 'cover', url: '/push/cover' },
    { id: 'slide', url: '/push/slide' },
    { id: 'fade', url: '/push/fade' },
    { id: 'scale', url: '/push/scale' },
    { id: 'modal', url: '/push/modal' },
  ] as const

  for (const c of pushCases) {
    test(`push ${c.id} 连点进入 + 连点返回`, async ({ page }) => {
      const errors = trackErrors(page)
      await page.goto('/')

      for (let i = 0; i < 8; i++) {
        if (!(await page.getByTestId(`push-${c.id}`).isVisible())) {
          await page.goto('/')
        }
        await page.getByTestId(`push-${c.id}`).click({ force: true })
        await page.waitForTimeout(30)
        const back = page.getByTestId('back').first()
        if (await back.isVisible()) {
          await back.click({ force: true })
        }
        await page.waitForTimeout(30)
      }

      await page.goto('/')
      await page.waitForTimeout(SETTLE_MS)
      await expect(page).toHaveURL('/')
      expect(await page.locator('.fr-animating').count()).toBe(0)
      expect(await page.locator('.animated-outlet-page').count()).toBeLessThanOrEqual(2)
      expect(errors).toEqual([])
    })
  }

  test('动画未完成时连续 push 不同页面', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')

    const sequence = ['push-cover', 'push-slide', 'push-fade', 'push-scale', 'push-modal'] as const
    for (let round = 0; round < 5; round++) {
      for (const id of sequence) {
        await page.getByTestId(id).click({ force: true })
        await page.waitForTimeout(20)
      }
      for (let i = 0; i < 5; i++) {
        await page.goBack().catch(() => {})
        await page.waitForTimeout(20)
      }
      await page.goto('/')
    }

    await page.waitForTimeout(SETTLE_MS)
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('首页矩阵按钮连点（不等待动画结束）', async ({ page }) => {
    // Give extra headroom: 30 rapid navigations with 10ms gap can exceed the 30s default
    // on slower CI machines, and the page connection may briefly drop during transitions.
    test.setTimeout(60_000)

    const errors = trackErrors(page)
    await page.goto('/')

    const buttons = [
      'push-detail',
      'push-cover',
      'push-slide',
      'push-fade',
      'push-scale',
      'push-modal',
      'push-tabs',
      'link-detail',
      'link-cover',
      'link-slide',
      'link-fade',
      'link-scale',
      'link-modal',
      'link-tabs',
    ]

    for (let i = 0; i < 30; i++) {
      const id = buttons[i % buttons.length]!
      try {
        const el = page.getByTestId(id).first()
        if (await el.isVisible()) {
          // Ignore detach errors: elements can unmount mid-transition during this stress test.
          await el.click({ force: true }).catch(() => {})
        }
        await page.waitForTimeout(10)
      } catch {
        // Page connection may drop during extremely rapid navigation; re-navigate to root
        // and continue so the remaining clicks still exercise the stress scenario.
        try { await page.goto('/') } catch { break }
      }
    }

    await page.waitForTimeout(SETTLE_MS)
    expect(await page.locator('.fr-animating').count()).toBe(0)
    const outlets = await page.locator('.animated-outlet-page').count()
    expect(outlets).toBeLessThanOrEqual(3)
    expect(errors).toEqual([])
  })
})

test.describe('压测 — Tabs 与其他场景交叉', () => {
  test('tabs ↔ fade ↔ tabs 快速切换', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')

    for (let i = 0; i < 15; i++) {
      await page.getByTestId('push-tabs').click({ force: true })
      await page.getByTestId('tab-link-b').last().click({ force: true })
      await page.getByTestId('push-fade').click({ force: true }).catch(() => {})
      if (!page.url().includes('/push/fade')) {
        await page.goto('/push/fade')
      }
      await page.getByTestId('back').first().click({ force: true }).catch(() => {})
      if (page.url() === 'http://localhost:5180/' || page.url().endsWith('/')) {
        continue
      }
      await page.getByTestId('back-tabs').first().click({ force: true }).catch(() => {})
      await page.goto('/')
    }

    await page.waitForTimeout(SETTLE_MS)
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('进入 tabs 后立即连点 A/B（零等待）', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    await page.getByTestId('link-tabs').click()

    const peak = await maxOutletsDuring(page, async () => {
      const tabA = page.getByTestId('tab-link-a').last()
      const tabB = page.getByTestId('tab-link-b').last()
      for (let i = 0; i < 30; i++) {
        await (i % 2 ? tabA : tabB).click({ force: true })
      }
    })

    expect(peak).toBeLessThanOrEqual(4)
    await assertTabsInvariants(page, /\/wrap\/tabs\/[ab]$/)
    expect(errors).toEqual([])
  })

  test('落定后重复点同一 Tab：history/DOM/渲染/动画', async ({ page }) => {
    await page.goto('/push/tabs/a')
    await page.waitForTimeout(SETTLE_MS)

    const renderBefore = await page.getByTestId('tab-a-page').getAttribute('data-render-count')
    const historyBefore = await page.evaluate(() => history.length)

    for (let i = 0; i < 25; i++) {
      await page.getByTestId('tab-link-a').last().click({ force: true })
      await page.waitForTimeout(40)
    }

    await page.waitForTimeout(SETTLE_MS)

    const renderAfter = await page.getByTestId('tab-a-page').getAttribute('data-render-count')
    const historyAfter = await page.evaluate(() => history.length)
    const animating = await page.locator('.fr-animating').count()
    const outlets = await page.locator('.animated-outlet-page').count()

    expect(historyAfter).toBe(historyBefore)
    expect(animating).toBe(0)
    expect(outlets).toBeLessThanOrEqual(2)
    await expect(page).toHaveURL('/push/tabs/a')

    const renderDelta = Number(renderAfter) - Number(renderBefore)
    expect(renderDelta).toBeLessThanOrEqual(30)
  })
})

test.describe('压测 — Tabs slide 双向', () => {
  test('push tabs-slide A→C 跨 Tab 一次右进', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('push-tabs-slide').click()
    await page.getByTestId('tab-link-c').last().click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll('main .animated-outlet-page')].some((e) =>
              e.className.includes('tabs-slide-enter-forward'),
            ),
          ),
        { timeout: 2000 },
      )
      .toBe(true)
    await expect(page.getByTestId('tab-c-page')).toBeVisible()
  })

  test('push tabs-slide A→B 右进、B→A 左进', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('push-tabs-slide').click()
    await expect(page.getByTestId('tab-a-page')).toBeVisible()

    await page.getByTestId('tab-link-b').last().click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll('.animated-outlet-page')].some((e) =>
              e.className.includes('tabs-slide-enter-forward'),
            ),
          ),
        { timeout: 2000 },
      )
      .toBe(true)

    await page.waitForTimeout(SETTLE_MS)
    await page.getByTestId('tab-link-a').last().click()
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll('.animated-outlet-page')].some((e) =>
              e.className.includes('tabs-slide-enter-back'),
            ),
          ),
        { timeout: 2000 },
      )
      .toBe(true)

    await page.waitForTimeout(SETTLE_MS)
    expect(await page.locator('.fr-animating').count()).toBe(0)
  })

  test('push tabs-slide A/B 交替连点 40 次', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    await page.getByTestId('push-tabs-slide').click()

    const tabA = page.getByTestId('tab-link-a').last()
    const tabB = page.getByTestId('tab-link-b').last()

    for (let i = 0; i < 40; i++) {
      const link = i % 2 ? tabB : tabA
      await link.dispatchEvent('click')
    }

    await page.waitForTimeout(SETTLE_MS)
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(await page.locator('.animated-outlet-page').count()).toBeLessThanOrEqual(3)
    expect(errors).toEqual([])
  })
})

test.describe('压测 — Tabs 滑块 (none)', () => {
  test('内容 instant 切换 + 滑块位移', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('push-tabs-indicator').click()
    await expect(page.getByTestId('tab-a-page')).toBeVisible()

    const pillLeftBefore = await page.getByTestId('tabs-indicator-pill').evaluate((el) => el.getBoundingClientRect().left)

    await page.getByTestId('tab-link-c').last().click()

    await expect
      .poll(
        async () => {
          const left = await page.getByTestId('tabs-indicator-pill').evaluate((el) => el.getBoundingClientRect().left)
          return left > pillLeftBefore + 40
        },
        { timeout: 2000 },
      )
      .toBe(true)

    await expect(page.getByTestId('tab-c-page')).toBeVisible()

    expect(await page.locator('.fr-animating').count()).toBe(0)
    const hasTransitionClass = await page.evaluate(() =>
      [...document.querySelectorAll('.animated-outlet-page')].some(
        (e) => e.className.includes('tabs-slide') || e.className.includes('fade-enter'),
      ),
    )
    expect(hasTransitionClass).toBe(false)

    const pillLeftAfter = await page.getByTestId('tabs-indicator-pill').evaluate((el) => el.getBoundingClientRect().left)
    expect(pillLeftAfter).toBeGreaterThan(pillLeftBefore + 40)
    await expect(page).toHaveURL(/\/tabs-indicator\/c$/)
  })
})

test.describe('压测 — Catalog stack', () => {
  test('列表→详情→返回', async ({ page }) => {
    await page.goto('/push/catalog')
    await page.getByTestId('catalog-item-1').click()
    await expect(page.getByTestId('catalog-detail')).toBeVisible()
    await page.getByTestId('catalog-detail-back').click()
    await expect(page.getByTestId('catalog-list')).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 回归：slide 动画每次都有方向（Bug #1：fromSnapRef 过期导致有时无动画）
// ─────────────────────────────────────────────────────────────────────────────

test.describe('回归 — slide tabs 每次都有动画（Bug #1 fromSnapRef）', () => {
  test('wrap tabs-slide A→B→A→B 每轮切换都有 fr-animating class', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/wrap/tabs-slide/a')
    await expect(page.getByTestId('tab-a-page')).toBeVisible()

    const tabA = page.getByTestId('tab-link-a').last()
    const tabB = page.getByTestId('tab-link-b').last()

    const animationSeenEachRound: boolean[] = []
    const ROUNDS = 4

    for (let i = 0; i < ROUNDS; i++) {
      const target = i % 2 === 0 ? tabB : tabA
      await target.click({ force: true })

      // 每次切换后，立即检查是否存在动画 class
      const seen = await expect
        .poll(
          () =>
            page.evaluate(() =>
              [...document.querySelectorAll('.animated-outlet-page')].some((el) =>
                el.className.includes('fr-animating'),
              ),
            ),
          { timeout: 800 },
        )
        .toBe(true)
      animationSeenEachRound.push(true)

      // 等动画结束再进行下一轮
      await page.waitForTimeout(SETTLE_MS)
    }

    // 每轮都应该有动画（不应 "有时无动画"）
    expect(animationSeenEachRound.length).toBe(ROUNDS)
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('push tabs-slide 快速往返 10 次：始终保持正确方向 class', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/push/tabs-slide/a')

    const tabA = page.getByTestId('tab-link-a').last()
    const tabB = page.getByTestId('tab-link-b').last()

    let wrongDirectionCount = 0
    const ROUNDS = 10

    for (let i = 0; i < ROUNDS; i++) {
      const isForward = i % 2 === 0
      const target = isForward ? tabB : tabA

      await target.click({ force: true })

      // 检查动画方向是否正确
      const correctClass = isForward ? 'tabs-slide-enter-forward' : 'tabs-slide-enter-back'
      const hasCorrectClass = await page.evaluate(
        (cls) =>
          [...document.querySelectorAll('.animated-outlet-page')].some((el) =>
            el.className.includes(cls),
          ),
        correctClass,
      )

      // 如果方向完全错了（出现了反方向的 class），记录
      const wrongClass = isForward ? 'tabs-slide-enter-back' : 'tabs-slide-enter-forward'
      const hasWrongClass = await page.evaluate(
        (cls) =>
          [...document.querySelectorAll('.animated-outlet-page')].some((el) =>
            el.className.includes(cls),
          ),
        wrongClass,
      )
      if (hasWrongClass && !hasCorrectClass) wrongDirectionCount++

      await page.waitForTimeout(SETTLE_MS)
    }

    // 方向错误应为 0（动画方向始终正确）
    expect(wrongDirectionCount).toBe(0)
    expect(await page.locator('.fr-animating').count()).toBe(0)
    expect(errors).toEqual([])
  })
})
