import { expect, test } from '@playwright/test'

test('modal POP 期间 DOM 层级采样', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('push-modal').click()
  await expect(page).toHaveURL('/push/modal')
  await page.waitForTimeout(400)

  const settled = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.animated-outlet-page')]
    return pages.map((el) => ({
      classes: el.className,
      zIndex: getComputedStyle(el).zIndex,
      bg: getComputedStyle(el).backgroundColor,
      visible: (el as HTMLElement).offsetParent !== null,
      testIds: [...el.querySelectorAll('[data-testid]')].map((n) => n.getAttribute('data-testid')),
    }))
  })
  console.log('settled', JSON.stringify(settled, null, 2))

  await page.getByTestId('back').click()

  const samples: unknown[] = []
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(40)
    samples.push(
      await page.evaluate(() => {
        const pages = [...document.querySelectorAll('.animated-outlet-page')]
        return {
          url: location.pathname,
          pages: pages.map((el) => ({
            classes: el.className,
            zIndex: getComputedStyle(el).zIndex,
            bg: getComputedStyle(el).backgroundColor,
            rect: el.getBoundingClientRect(),
            testIds: [...el.querySelectorAll('[data-testid]')].map((n) => n.getAttribute('data-testid')),
          })),
        }
      }),
    )
  }
  console.log('pop samples', JSON.stringify(samples, null, 2))

  await expect(page).toHaveURL('/')
})
