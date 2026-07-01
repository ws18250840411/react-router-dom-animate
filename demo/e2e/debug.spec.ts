import { test, expect } from '@playwright/test'

test('debug keepAlive stack', async ({ page }) => {
  const logs: string[] = []
  page.on('console', msg => {
    if (msg.text().includes('[StackList]')) {
      logs.push(msg.text())
    }
  })
  
  await page.goto('http://localhost:5180/keep-alive-stack')
  await expect(page.getByTestId('ka-stack-counter')).toHaveText('0')
  
  for (let i = 0; i < 3; i++) await page.getByTestId('ka-stack-inc').click()
  await expect(page.getByTestId('ka-stack-counter')).toHaveText('3')
  
  console.log('Logs after increment:', logs.join(' | '))
  
  await page.getByTestId('ka-stack-item-1').click()
  await expect(page.getByTestId('ka-stack-detail')).toBeVisible()
  
  console.log('Logs after nav to detail:', logs.join(' | '))
  
  await page.getByTestId('ka-stack-detail-back').click()
  await expect(page.getByTestId('ka-stack-list')).toBeVisible()
  
  console.log('Logs after back:', logs.join(' | '))
  
  const counter = await page.getByTestId('ka-stack-counter').textContent()
  console.log('Counter after back:', counter)
  console.log('All logs:', JSON.stringify(logs))
  
  await expect(page.getByTestId('ka-stack-counter')).toHaveText('3')
})
