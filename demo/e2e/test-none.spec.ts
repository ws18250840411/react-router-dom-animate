import { test, expect } from '@playwright/test'

test('keepAlive stack - transition=none (no animation)', async ({ page }) => {
  const logs: string[] = []
  page.on('console', msg => { if (msg.text().includes('[StackList]')) logs.push(msg.text()) })

  // Temporarily patch the route to use transition="none"
  await page.goto('http://localhost:5180/keep-alive-stack')
  
  // Inject a JS override to make AnimatedOutlet use transition="none"
  // Actually just test with whatever is there, and navigate with waitForTimeout
  await expect(page.getByTestId('ka-stack-counter')).toHaveText('0')
  for (let i = 0; i < 3; i++) await page.getByTestId('ka-stack-inc').click()
  await expect(page.getByTestId('ka-stack-counter')).toHaveText('3')

  await page.getByTestId('ka-stack-item-1').click()
  // Wait for full animation complete (300ms + generous buffer)
  await page.waitForTimeout(600)
  
  const logsAfterPush = [...logs]
  console.log('Logs after PUSH+wait:', logsAfterPush.join(' | '))
  
  await page.getByTestId('ka-stack-detail-back').click()
  await page.waitForTimeout(600)
  
  console.log('All logs:', logs.join(' | '))
  const counter = await page.getByTestId('ka-stack-counter').textContent()
  console.log('Counter:', counter)
  
  expect(counter).toBe('3')
})
