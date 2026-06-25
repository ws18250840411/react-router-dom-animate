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

test('cover PUSH 旧页退场无 fr-enter-below', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('push-cover').click()
  await page.waitForFunction(() => document.querySelector('.slide-prev-leave-cover'))
  const exit = await page.evaluate(() => {
    const el = document.querySelector('.slide-prev-leave-cover')
    return el ? el.className : ''
  })
  expect(exit).not.toContain('fr-enter-below')
})

test('slide PUSH 新页在上层、旧页视差', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('push-slide').click()

  await page.waitForFunction(() => {
    const enter = document.querySelector('.slide-next-enter')
    const exit = document.querySelector('.slide-prev-leave-slide')
    if (!enter || !exit) return false
    return (
      Number(getComputedStyle(enter).zIndex) > Number(getComputedStyle(exit).zIndex) &&
      exit.classList.contains('fr-enter-below')
    )
  })

  let maxRatio = 0
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(35)
    const ratio = await page.evaluate(() => {
      const exit = document.querySelector('.slide-prev-leave-slide')
      if (!exit) return 0
      const width = exit.getBoundingClientRect().width
      const matrix = getComputedStyle(exit).transform
      if (!matrix || matrix === 'none') return 0
      const m = matrix.match(/matrix.*\((.+)\)/)
      if (!m) return 0
      const parts = m[1].split(',').map((s) => Number.parseFloat(s.trim()))
      const tx = parts.length === 6 ? parts[4] : (parts[12] ?? 0)
      return Math.abs(tx) / width
    })
    maxRatio = Math.max(maxRatio, ratio)
  }

  expect(maxRatio).toBeGreaterThan(0.2)
  await expect(page).toHaveURL('/push/slide')
})

test('modal POP outlet 整页 slide-up-leave', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('push-modal').click()
  await page.waitForTimeout(400)
  await page.getByTestId('back').click()

  const leaving = await page.waitForFunction(() => {
    const el = document.querySelector('.animated-outlet-page.fr-modal.slide-up-leave')
    if (!el) return null
    const style = getComputedStyle(el)
    if (style.animationName === 'none') return null
    return style.animationName
  })

  expect(String(await leaving.jsonValue())).toContain('fr-slide-up-leave')
})

test('modal POP 退场不透出首页按钮', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('push-modal').click()
  await page.waitForTimeout(400)
  await page.getByTestId('back').click()

  let leaked = false
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(45)
    leaked = await page.evaluate(() => {
      const modalBack = document.querySelector('[data-testid="modal-page"] [data-testid="back"]')
      const homeBtn = document.querySelector('[data-testid="push-modal"]')
      if (!modalBack || !homeBtn) return false
      const mb = modalBack.getBoundingClientRect()
      const hb = homeBtn.getBoundingClientRect()
      if (getComputedStyle(modalBack).opacity === '0' || getComputedStyle(homeBtn).opacity === '0') return false
      const overlap =
        mb.top < hb.bottom && mb.bottom > hb.top && mb.left < hb.right && mb.right > hb.left
      return overlap && mb.bottom > 80
    })
    if (leaked) break
  }

  expect(leaked).toBe(false)
  await expect(page).toHaveURL('/')
})
