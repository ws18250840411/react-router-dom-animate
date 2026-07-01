import { test, expect } from '@playwright/test'

test('debug BPR', async ({ page }) => {
  const logs: string[] = []
  page.on('console', msg => logs.push(msg.text()))
  
  await page.goto('http://localhost:5180/keep-alive-stack')
  await expect(page.getByTestId('ka-stack-counter')).toHaveText('0')
  
  for (let i = 0; i < 3; i++) await page.getByTestId('ka-stack-inc').click()
  await expect(page.getByTestId('ka-stack-counter')).toHaveText('3')
  
  await page.getByTestId('ka-stack-item-1').click()
  await page.waitForTimeout(600)
  
  await page.getByTestId('ka-stack-detail-back').click()
  await page.waitForTimeout(600)
  
  const bprLogs = logs.filter(l => l.includes('[BPR]') || l.includes('[StackList]'))
  for (const l of bprLogs) console.log(l)
  
  const counter = await page.getByTestId('ka-stack-counter').textContent()
  console.log('Counter:', counter)
})
